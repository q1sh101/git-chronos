#!/usr/bin/env node

// ===================================================================
// |> Git Chronos - The Commit Engine <|
// ===================================================================
// Features:
// 1. Configurable weekday/weekend execution (with --enableWeekends flag)
// 2. Random commits with configurable range (default 1-10/day, set via --minCommits/--maxCommits)
// 3. Timezone-aware commits (default: America/New_York, configurable via --timezone)
// 4. Fully asynchronous Git & file operations for maximum performance
// 5. Customizable commit intervals (default 1-5 sec, set via --commitDelayMin/--commitDelayMax)
// 6. Comprehensive CLI configuration (repo path, branch, commit limits, timezone, file paths, etc.)
// 7. Centralized logging with file output (configurable via --logFile, default: bot_runtime.log)
// 8. Proactive health monitoring with remote Git validation and system diagnostics
// 9. Secure parameter handling (CLI args with environment variable fallbacks)
// 10. Independent daily commit limit enforcement (default: 15, set via --dailyLimit, resets daily)
// 11. Pure Node.js implementation, no external dependencies for full control
// 12. Robust error handling with try-catch across all critical operations
// 13. Graceful shutdown with cleanup (tracker save, lock removal)
// 14. Retry mechanism for transient Git failures (configurable via --retryAttempts/--retryDelay)
// 15. Concurrency control with lock files and in-memory caching to prevent duplicate runs
// 16. Chronos-powered terminal effects (customizable colors, spinners, and dynamic formatting)
// 17. Modular architecture (separate logic and presentation for maintainability)
// 18. npm-ready package structure (bin/lib split for CLI and library usage)
// 19. Seamless interactive configuration menu for intuitive, guided setup
// 20. Enhanced commit precision with flexible daily limits and random commit ranges

// Core Node.js built-in modules
const { promisify } = require('util');
const { exec, spawn } = require('child_process');
const { readFile, writeFile, appendFile, stat, unlink, access, constants, mkdir } = require('fs');
const { resolve, join, dirname } = require('path');
const { tmpdir } = require('os');

// Promisify built-in functions for async operations
const execPromise = promisify(exec);
const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const appendFileAsync = promisify(appendFile);
const statAsync = promisify(stat);
const unlinkAsync = promisify(unlink);
const accessAsync = promisify(access);
const mkdirAsync = promisify(mkdir);

// Import terminal effects
const augEffects = require('./augEffects');

// Show help if --help or -h is passed
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
|> Git Chronos - Commit Engine Activated <|
    Options:
      --repo=<path>            Path to Git repository (default: current directory)
      --branch=<name>          Git branch (default: main)
      --timezone=<tz>          Timezone (default: America/New_York)
      --minCommits=<n>         Min random commits per day (default: 1)
      --maxCommits=<n>         Max random commits per day (default: 10)
      --dailyLimit=<n>         Absolute daily commit limit (default: 15)
      --commitDelayMin=<ms>    Min delay between commits (ms, default: 1000)
      --commitDelayMax=<ms>    Max delay between commits (ms, default: 5000)
      --scheduleStart=<hour>   Start hour for commits (0-23, default: 9)
      --scheduleEnd=<hour>     End hour for commits (0-23, default: 17)
      --enableWeekends         Enable weekend commits (default: false)
      --targetFile=<name>      Target file for bot updates (default: bot_activity.log)
      --commitTrackerFile=<path> Commit tracker file path (default: <repo>/commit_tracker.json)
      --lockFile=<path>        Lock file path for concurrency (default: <repo>/git_chronos.lock)
      --logFile=<path>         Log file path (default: <repo>/bot_runtime.log)
      --retryAttempts=<n>      Retry attempts for Git operations (default: 3)
      --retryDelay=<ms>        Delay between retries (ms, default: 5000)
    Notes:
      - Feel the Chronos flow! -|>
  `);
  process.exit(0);
}

// Parse CLI arguments with support for --key=value format
const args = {};
process.argv.slice(2).forEach((arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    args[key] = value !== undefined ? value : true;
  }
});
const hasCLIArgs = process.argv.slice(2).length > 0;

// Validate CLI arguments for numeric values with environment variable fallbacks
const minCommits = Number(args.minCommits) || Number(process.env.MIN_COMMITS) || 1;
const maxCommits = Number(args.maxCommits) || Number(process.env.MAX_COMMITS) || 10;
const dailyLimit = Number(args.dailyLimit) || Number(process.env.DAILY_LIMIT) || 15;
const commitDelayMin = Number(args.commitDelayMin) || Number(process.env.COMMIT_DELAY_MIN) || 1000;
const commitDelayMax = Number(args.commitDelayMax) || Number(process.env.COMMIT_DELAY_MAX) || 5000;
const scheduleStart = Number(args.scheduleStart) || Number(process.env.SCHEDULE_START) || 9;
const scheduleEnd = Number(args.scheduleEnd) || Number(process.env.SCHEDULE_END) || 17;
const retryAttempts = Number(args.retryAttempts) || Number(process.env.RETRY_ATTEMPTS) || 3;
const retryDelay = Number(args.retryDelay) || Number(process.env.RETRY_DELAY) || 5000;

// Validate all numeric arguments
if (isNaN(maxCommits) || isNaN(minCommits) || isNaN(dailyLimit) || isNaN(commitDelayMin) || isNaN(commitDelayMax) ||
  isNaN(scheduleStart) || isNaN(scheduleEnd) || isNaN(retryAttempts) || isNaN(retryDelay)) {
  const invalidArg = Object.entries({ maxCommits, minCommits, dailyLimit, commitDelayMin, commitDelayMax, scheduleStart, scheduleEnd, retryAttempts, retryDelay })
    .find(([_, val]) => isNaN(val))?.[0] || 'unknown';
  augEffects.logError(`SYSTEM ERROR: Numeric argument '${invalidArg}' must be a valid number! Check your input stream!`, null);
  process.exit(1);
}

// Validate schedule hours and retry parameters
if (scheduleStart < 0 || scheduleStart > 23 || scheduleEnd < 0 || scheduleEnd > 23 || scheduleStart >= scheduleEnd) {
  augEffects.logError(`TIME SYNC ERROR: --scheduleStart and --scheduleEnd must be 0-23, and start < end!`, null);
  process.exit(1);
}
if (retryAttempts < 1) {
  augEffects.logError(`RETRY CORE ERROR: --retryAttempts must be at least 1!`, null);
  process.exit(1);
}
if (retryDelay < 0) {
  augEffects.logError(`TIME DELAY ERROR: --retryDelay can't be negative!`, null);
  process.exit(1);
}

// Define root directory (where package.json lives)
const ROOT_DIR = resolve(dirname(__filename), '..');

// Define configuration with defaults, CLI overrides, and environment variable fallbacks
const CONFIG = {
  REPO_DIR: resolve(args.repo || process.env.REPO_DIR || ROOT_DIR),
  TARGET_FILE: args.targetFile || process.env.TARGET_FILE || 'bot_activity.log',
  GIT_BRANCH: args.branch || process.env.GIT_BRANCH || 'main',
  TIMEZONE: args.timezone || process.env.TIMEZONE || 'America/New_York',
  MAX_COMMITS: Math.min(Math.max(maxCommits, 1), 100),
  MIN_COMMITS: Math.max(minCommits, 1),
  DAILY_LIMIT: Math.max(dailyLimit, 1),
  COMMIT_DELAY_MIN: commitDelayMin,
  COMMIT_DELAY_MAX: commitDelayMax,
  SCHEDULE_START: scheduleStart,
  SCHEDULE_END: scheduleEnd,
  ENABLE_WEEKENDS: args.enableWeekends || process.env.ENABLE_WEEKENDS === 'true' || false,
  COMMIT_TRACKER_FILE: args.commitTrackerFile || process.env.COMMIT_TRACKER_FILE || join(resolve(args.repo || process.env.REPO_DIR || ROOT_DIR), 'commit_tracker.json'),
  LOCK_FILE: args.lockFile || process.env.LOCK_FILE || join(resolve(args.repo || process.env.REPO_DIR || ROOT_DIR), 'git_chronos.lock'),
  LOG_FILE: args.logFile || process.env.LOG_FILE || join(resolve(args.repo || process.env.REPO_DIR || ROOT_DIR), 'bot_runtime.log'),
  RETRY_ATTEMPTS: retryAttempts,
  RETRY_DELAY: retryDelay,
};

// Validate commit limits to prevent zero commits
if (CONFIG.MIN_COMMITS < 1 || CONFIG.MAX_COMMITS < CONFIG.MIN_COMMITS || CONFIG.DAILY_LIMIT < CONFIG.MIN_COMMITS) {
  augEffects.logError(`COMMIT CORE ERROR: MIN_COMMITS must be >= 1, <= MAX_COMMITS, and DAILY_LIMIT >= MIN_COMMITS!`, CONFIG.LOG_FILE);
  process.exit(1);
}

// Ensure directories exist for configurable file paths
async function ensureDirectory(filePath) {
  const dir = dirname(filePath);
  try {
    await accessAsync(dir, constants.W_OK);
  } catch (error) {
    await mkdirAsync(dir, { recursive: true });
    augEffects.logOperation(`CHRONOS PATH ONLINE: ${dir} initialized!`, CONFIG.LOG_FILE);
  }
}

// In-memory cache for commit tracker
let commitTrackerCache = {
  commitCount: 0,
  lastRunDate: new Date().toISOString(),
};

// Initialize commit tracker file if it doesn’t exist or is corrupted
const initCommitTracker = async () => {
  await ensureDirectory(CONFIG.COMMIT_TRACKER_FILE);
  try {
    const fileExists = await statAsync(CONFIG.COMMIT_TRACKER_FILE).catch(() => false);
    if (!fileExists) {
      await writeFileAsync(CONFIG.COMMIT_TRACKER_FILE, JSON.stringify(commitTrackerCache, null, 2));
      augEffects.logOperation(`COMMIT TRACKING CORE ONLINE: ${CONFIG.COMMIT_TRACKER_FILE} activated!`, CONFIG.LOG_FILE);
    } else {
      const data = await readFileAsync(CONFIG.COMMIT_TRACKER_FILE, 'utf8');
      commitTrackerCache = JSON.parse(data);
    }
  } catch (error) {
    augEffects.logError(`TRACKING CORE FAILURE: Couldn’t access ${CONFIG.COMMIT_TRACKER_FILE}! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    augEffects.logOperation(`REBOOTING CORE: Creating new tracker with default values!`, CONFIG.LOG_FILE);
    commitTrackerCache = { commitCount: 0, lastRunDate: new Date().toISOString() };
    await writeFileAsync(CONFIG.COMMIT_TRACKER_FILE, JSON.stringify(commitTrackerCache, null, 2));
  }
};

// Check and initialize Git repository
const initGitRepo = async () => {
  try {
    await execPromise('git status', { cwd: CONFIG.REPO_DIR });
  } catch (error) {
    augEffects.logOperation(`INITIALIZING GIT REPO at ${CONFIG.REPO_DIR}...`, CONFIG.LOG_FILE);
    try {
      await execPromise('git init', { cwd: CONFIG.REPO_DIR });
      augEffects.logOperation(`GIT REPO ONLINE: Git initialized successfully!`, CONFIG.LOG_FILE);
    } catch (initError) {
      augEffects.logError(`GIT CORE CRASH: Failed to initialize Git! ${initError.message} (Code: ${initError.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
      process.exit(1);
    }
  }
};

// ========================
// |> Utility Functions <|
// ========================

// Get formatted timestamp (YYYY-MM-DD HH:mm:ss) for logs and commits using configured timezone
function getFormattedTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  try {
    const year = now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE, year: 'numeric' });
    const month = pad(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE, month: 'numeric' }));
    const day = pad(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE, day: 'numeric' }));
    const hour = pad(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE, hour: 'numeric', hour12: false }));
    const minute = pad(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE, minute: 'numeric' }));
    const second = pad(now.toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE, second: 'numeric' }));
    const timestamp = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    augEffects.logOperation(`TIMESTAMP CORE CHECK: Generated ${timestamp}`, CONFIG.LOG_FILE);
    return timestamp;
  } catch (error) {
    augEffects.logWarning(`TIMEZONE GRID FAILURE: '${CONFIG.TIMEZONE}' invalid, falling back to UTC!`, CONFIG.LOG_FILE);
    const fallback = now.toISOString().replace('T', ' ').substring(0, 19);
    augEffects.logOperation(`TIMESTAMP FALLBACK: Using ${fallback}`, CONFIG.LOG_FILE);
    return fallback;
  }
}

// Check if today is a weekend based on configured timezone
function isWeekend() {
  if (CONFIG.ENABLE_WEEKENDS) return false;
  const now = new Date().toLocaleDateString('en-US', { timeZone: CONFIG.TIMEZONE, weekday: 'short' });
  return ['Sat', 'Sun'].includes(now);
}

// Check if current time is within working hours based on configured timezone
function isWorkingHours() {
  const now = new Date().toLocaleTimeString('en-US', { timeZone: CONFIG.TIMEZONE, hour12: false });
  const currentHour = parseInt(now.split(':')[0], 10);
  return currentHour >= CONFIG.SCHEDULE_START && currentHour < CONFIG.SCHEDULE_END;
}

// Generate random commit count for the day
function getRandomCommitCount() {
  return Math.floor(Math.random() * (CONFIG.MAX_COMMITS - CONFIG.MIN_COMMITS + 1)) + CONFIG.MIN_COMMITS;
}

// Delay execution between commits
function delay(min, max) {
  const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delayTime));
}

// Change to repository directory
async function changeDirectory() {
  try {
    process.chdir(CONFIG.REPO_DIR);
    await augEffects.logOperation(`TELEPORTED TO GIT REPO: ${CONFIG.REPO_DIR}`, CONFIG.LOG_FILE);
  } catch (error) {
    await augEffects.logError(`TELEPORT FAILURE: Couldn’t access ${CONFIG.REPO_DIR}! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    throw error;
  }
}

// ========================
// |> Core Functionality <|
// ========================

// Modify the target file by appending a timestamp
async function modifyFile() {
  const timestamp = getFormattedTimestamp();
  try {
    const filePath = join(CONFIG.REPO_DIR, CONFIG.TARGET_FILE);
    await ensureDirectory(filePath);
    if (!(await statAsync(filePath).catch(() => false))) {
      await writeFileAsync(filePath, '');
      await augEffects.logOperation(`NEW DATA NODE CREATED: ${CONFIG.TARGET_FILE}`, CONFIG.LOG_FILE);
    }
    await appendFileAsync(filePath, ` Update at ${timestamp}\n`);
    await augEffects.logOperation(`DATA NODE UPGRADED: ${CONFIG.TARGET_FILE} at ${timestamp}`, CONFIG.LOG_FILE);
  } catch (error) {
    await augEffects.logError(`DATA NODE ERROR: Failed to upgrade ${CONFIG.TARGET_FILE}! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    throw error;
  }
}

// Perform Git operations: add, commit, push with retry mechanism and timezone-aware commit dates
async function performGitOperations() {
  const commitMessage = `-🤖-|> auto-commit: ${getFormattedTimestamp()}`;
  const commitDate = new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE });
  const env = {
    GIT_AUTHOR_DATE: commitDate,
    GIT_COMMITTER_DATE: commitDate,
    ...process.env,
  };
  for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      await execPromise('git add .', { cwd: CONFIG.REPO_DIR, env });
      const gitCommit = spawn('git', ['commit', '-m', commitMessage], { cwd: CONFIG.REPO_DIR, env });
      await new Promise((resolve, reject) => {
        gitCommit.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`git commit failed with code ${code}`))));
        gitCommit.on('error', reject);
      });
      await execPromise(`git push origin ${CONFIG.GIT_BRANCH}`, { cwd: CONFIG.REPO_DIR, env });
      await augEffects.logOperation(`GIT SYNC COMPLETE: Data streamed to the grid !`, CONFIG.LOG_FILE);
      return;
    } catch (error) {
      await augEffects.logError(`GIT SYNC FAILURE (Attempt ${attempt}/${CONFIG.RETRY_ATTEMPTS}): ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
      if (attempt < CONFIG.RETRY_ATTEMPTS && (
        error.message.includes('fatal: unable to access') ||
        error.message.includes('repository is locked') ||
        error.message.includes('could not lock')
      )) {
        await augEffects.logOperation(`RECHARGING SYNC MODULE: Retrying in ${CONFIG.RETRY_DELAY / 1000} seconds...`, CONFIG.LOG_FILE);
        await new Promise((resolve) => setTimeout(resolve, CONFIG.RETRY_DELAY));
      } else {
        throw error;
      }
    }
  }
}

// ========================
// |> Health Check System <|
// ========================

// Perform comprehensive health check including remote validation and write permissions
async function performHealthCheck() {
  try {
    await accessAsync(CONFIG.REPO_DIR, constants.W_OK);
    await augEffects.logOperation('REPO CORE ONLINE: Directory is writable!', CONFIG.LOG_FILE);

    await execPromise('git status', { cwd: CONFIG.REPO_DIR });
    await augEffects.logOperation('GIT MODULE ACTIVE: Repository is operational!', CONFIG.LOG_FILE);

    const hasOrigin = (await execPromise('git remote', { cwd: CONFIG.REPO_DIR }).catch(() => ({ stdout: '' }))).stdout.includes('origin');
    if (hasOrigin) {
      await execPromise(`git ls-remote origin ${CONFIG.GIT_BRANCH}`, { cwd: CONFIG.REPO_DIR });
      await augEffects.logOperation('GRID LINK ESTABLISHED: Git remote is accessible!', CONFIG.LOG_FILE);
    } else {
      await augEffects.logOperation('OFFLINE MODE: No remote origin, skipping validation.', CONFIG.LOG_FILE);
    }

    await accessAsync(CONFIG.COMMIT_TRACKER_FILE, constants.W_OK).catch(async () => {
      await ensureDirectory(CONFIG.COMMIT_TRACKER_FILE);
    });
    await augEffects.logOperation('TRACKING CORE ONLINE: Commit tracker is writable!', CONFIG.LOG_FILE);

    await accessAsync(join(CONFIG.REPO_DIR, CONFIG.TARGET_FILE), constants.W_OK).catch(async () => {
      await ensureDirectory(join(CONFIG.REPO_DIR, CONFIG.TARGET_FILE));
    });
    await augEffects.logOperation('DATA NODE READY: Target file is writable!', CONFIG.LOG_FILE);

    await accessAsync(CONFIG.LOG_FILE, constants.W_OK).catch(async () => {
      await ensureDirectory(CONFIG.LOG_FILE);
    });
    await augEffects.logOperation('LOG SYSTEM ONLINE: Log file is writable!', CONFIG.LOG_FILE);

    return true;
  } catch (error) {
    await augEffects.logError(`SYSTEM DIAGNOSTIC FAILURE: Check failed! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    return false;
  }
}

// ========================
// |> Execution Flow <|
// ========================

// Get daily commit count from cache
function getDailyCommitCount() {
  const now = new Date();
  const getDatePart = (date) => date.toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE });
  if (getDatePart(new Date(commitTrackerCache.lastRunDate)) !== getDatePart(now)) {
    commitTrackerCache.commitCount = 0;
    commitTrackerCache.lastRunDate = now.toISOString();
  }
  return commitTrackerCache.commitCount;
}

// Save commit tracker to file
async function saveCommitTracker() {
  try {
    await ensureDirectory(CONFIG.COMMIT_TRACKER_FILE);
    await writeFileAsync(CONFIG.COMMIT_TRACKER_FILE, JSON.stringify(commitTrackerCache, null, 2), 'utf8');
  } catch (error) {
    await augEffects.logError(`TRACKING CORE CRASH: Failed to save! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    throw error;
  }
}

// Check if commits are allowed today
function shouldCommitToday() {
  return getDailyCommitCount() < CONFIG.DAILY_LIMIT;
}

// Increment commit count and save tracker immediately
async function updateCommitCount() {
  commitTrackerCache.commitCount += 1;
  await saveCommitTracker();
}

// Main bot logic with animated progress
async function runBot() {
  try {
    if (!await performHealthCheck()) {
      await augEffects.logError('CORE SYSTEM OFFLINE: Health check failed! Shutting down...', CONFIG.LOG_FILE);
      process.exit(1);
    }

    if (!CONFIG.ENABLE_WEEKENDS && isWeekend()) {
      await augEffects.logWarning('OFFLINE WEEKEND PROTOCOL: Bot is in standby mode...', CONFIG.LOG_FILE);
      return;
    }

    if (!isWorkingHours()) {
      await augEffects.logWarning('NIGHT CYCLE: Outside working hours! Bot is idle...', CONFIG.LOG_FILE);
      return;
    }

    if (!shouldCommitToday()) {
      await augEffects.logWarning(`MISSION COMPLETE: Daily commit limit of ${CONFIG.DAILY_LIMIT} reached! Bot is victorious!`, CONFIG.LOG_FILE);
      console.log(augEffects.formatCommitSuccess(CONFIG.DAILY_LIMIT, CONFIG.DAILY_LIMIT));
      return;
    }

    await changeDirectory();
    const remainingCommits = CONFIG.DAILY_LIMIT - getDailyCommitCount();
    let intendedCommits, plannedCommits;
    intendedCommits = getRandomCommitCount();
    plannedCommits = Math.min(intendedCommits, remainingCommits);

    await augEffects.logOperation(`CHRONOS PULSE: Preparing ${intendedCommits} commits (Daily Limit: ${CONFIG.DAILY_LIMIT})!`, CONFIG.LOG_FILE);

    // Animated commit progress
    for (let i = 0; i < plannedCommits; i++) {
      process.stdout.write(augEffects.formatCommitProgress(i, plannedCommits) + '\r');
      await modifyFile();
      await performGitOperations();
      await updateCommitCount();
      await delay(CONFIG.COMMIT_DELAY_MIN, CONFIG.COMMIT_DELAY_MAX);
      process.stdout.write(augEffects.formatCommitSuccess(i + 1, plannedCommits) + '          \n');
    }

    if (intendedCommits > plannedCommits && getDailyCommitCount() >= CONFIG.DAILY_LIMIT) {
      await augEffects.logWarning(`MISSION COMPLETE: ${plannedCommits} of ${intendedCommits} commits executed! Daily limit of ${CONFIG.DAILY_LIMIT} reached! Bot is victorious!`, CONFIG.LOG_FILE);
      console.log(augEffects.formatCommitSuccess(CONFIG.DAILY_LIMIT, CONFIG.DAILY_LIMIT));
    } else {
      await augEffects.logOperation(`CHRONOS VICTORY: All ${plannedCommits} commits successfully streamed!`, CONFIG.LOG_FILE);
    }
  } catch (error) {
    await augEffects.logError(`SYSTEM OVERLOAD: Critical failure! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    process.exit(1);
  }
}

// ========================
// |> Concurrency Control <|
// ========================

// Check if another instance is running and handle stale lock files
async function checkLock() {
  try {
    const pid = await readFileAsync(CONFIG.LOCK_FILE, 'utf8');
    try {
      process.kill(pid, 0);
      await augEffects.logError('MULTI-INSTANCE DETECTED: Another bot is active! Exiting...', CONFIG.LOG_FILE);
      process.exit(1);
    } catch (error) {
      await unlinkAsync(CONFIG.LOCK_FILE);
      await augEffects.logOperation('CLEARING LOCK: Removed stale system lock!', CONFIG.LOG_FILE);
    }
  } catch (error) {
    // Lock file does not exist or other error, proceed
  }
}

// Create lock file
async function createLock() {
  try {
    await ensureDirectory(CONFIG.LOCK_FILE);
    await writeFileAsync(CONFIG.LOCK_FILE, process.pid.toString());
    await augEffects.logOperation('SYSTEM LOCK ENGAGED: Bot is in control!', CONFIG.LOG_FILE);
  } catch (error) {
    await augEffects.logError(`LOCK SYSTEM FAILURE: Couldn’t secure the grid! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
    process.exit(1);
  }
}

// Remove lock file
async function removeLock() {
  try {
    await unlinkAsync(CONFIG.LOCK_FILE);
    await augEffects.logOperation('SYSTEM LOCK DISENGAGED: Bot is free!', CONFIG.LOG_FILE);
  } catch (error) {
    await augEffects.logError(`LOCK RELEASE ERROR: Lock stuck! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
  }
}

// ========================
// |> Graceful Shutdown <|
// ========================

let isShuttingDown = false;

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  await augEffects.logOperation('SHUTDOWN SEQUENCE: Bot is powering down...', CONFIG.LOG_FILE);
  try {
    await saveCommitTracker();
    await removeLock();
  } catch (error) {
    await augEffects.logError(`SHUTDOWN ERROR: Cleanup failed! ${error.message} (Code: ${error.code || 'UNKNOWN'})`, CONFIG.LOG_FILE);
  } finally {
    console.log(augEffects.formatShutdown());
    process.exit(0);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ========================
// |> Start the Bot <|
// ========================
async function scheduleNextRun() {
  if (!isShuttingDown) {
    await runBot();
    const nextRun = CONFIG.ENABLE_WEEKENDS || (!isWeekend() && isWorkingHours()) ? 60 * 60 * 1000 : 5 * 60 * 1000;
    setTimeout(scheduleNextRun, nextRun);
  }
}

// Main execution block with interactive menu integration
(async () => {
  console.log(augEffects.formatStartup());

  // Interactive menu only   if no CLI arguments are provided
  if (!hasCLIArgs) {
    try {
      const interactiveParams = await augEffects.interactiveConfig(CONFIG);

      Object.assign(CONFIG, {
        REPO_DIR: resolve(interactiveParams.repo || CONFIG.REPO_DIR),
        GIT_BRANCH: interactiveParams.branch || CONFIG.GIT_BRANCH,
        MIN_COMMITS: Number(interactiveParams.minCommits) || CONFIG.MIN_COMMITS,
        MAX_COMMITS: Number(interactiveParams.maxCommits) || CONFIG.MAX_COMMITS,
        DAILY_LIMIT: Number(interactiveParams.dailyLimit) || CONFIG.DAILY_LIMIT,
        SCHEDULE_START: Number(interactiveParams.scheduleStart) || CONFIG.SCHEDULE_START,
        SCHEDULE_END: Number(interactiveParams.scheduleEnd) || CONFIG.SCHEDULE_END,
        ENABLE_WEEKENDS: interactiveParams.enableWeekends,
        TIMEZONE: interactiveParams.timezone || CONFIG.TIMEZONE,
        TARGET_FILE: interactiveParams.targetFile || CONFIG.TARGET_FILE,
        COMMIT_TRACKER_FILE: interactiveParams.commitTrackerFile || CONFIG.COMMIT_TRACKER_FILE,
        LOCK_FILE: interactiveParams.lockFile || CONFIG.LOCK_FILE,
        LOG_FILE: interactiveParams.logFile || CONFIG.LOG_FILE,
        COMMIT_DELAY_MIN: Number(interactiveParams.commitDelayMin) || CONFIG.COMMIT_DELAY_MIN,
        COMMIT_DELAY_MAX: Number(interactiveParams.commitDelayMax) || CONFIG.COMMIT_DELAY_MAX,
        RETRY_ATTEMPTS: Number(interactiveParams.retryAttempts) || CONFIG.RETRY_ATTEMPTS,
        RETRY_DELAY: Number(interactiveParams.retryDelay) || CONFIG.RETRY_DELAY
      });

      if (CONFIG.SCHEDULE_START < 0 || CONFIG.SCHEDULE_START > 23 || CONFIG.SCHEDULE_END < 0 || CONFIG.SCHEDULE_END > 23 || CONFIG.SCHEDULE_START >= CONFIG.SCHEDULE_END) {
        augEffects.logError(`TIME SYNC ERROR: Schedule Start and End must be 0-23, and Start < End!`, CONFIG.LOG_FILE);
        process.exit(1);
      }

      if (CONFIG.COMMIT_DELAY_MIN < 0 || CONFIG.COMMIT_DELAY_MAX < CONFIG.COMMIT_DELAY_MIN) {
        augEffects.logError(`DELAY CORE ERROR: COMMIT_DELAY_MIN must be >= 0 and <= COMMIT_DELAY_MAX!`, CONFIG.LOG_FILE);
        process.exit(1);
      }

      if (CONFIG.DAILY_LIMIT < 1 || CONFIG.MIN_COMMITS > CONFIG.DAILY_LIMIT || CONFIG.DAILY_LIMIT < CONFIG.MAX_COMMITS) {
        augEffects.logError(`COMMIT CORE ERROR: DAILY_LIMIT must be >= 1, >= MIN_COMMITS, and <= MAX_COMMITS!`, CONFIG.LOG_FILE);
        process.exit(1);
      }

      if (CONFIG.RETRY_ATTEMPTS < 1) {
        augEffects.logError(`RETRY CORE ERROR: RETRY_ATTEMPTS must be >= 1!`, CONFIG.LOG_FILE);
        process.exit(1);
      }
      if (CONFIG.RETRY_DELAY < 0) {
        augEffects.logError(`RETRY DELAY ERROR: RETRY_DELAY must be >= 0!`, CONFIG.LOG_FILE);
        process.exit(1);
      }
    } catch (error) {
      augEffects.logError('CONFIGURATION ABORTED: User terminated process', CONFIG.LOG_FILE);
      process.exit(0);
    }
  }

  await checkLock();
  await createLock();
  await Promise.all([initCommitTracker(), initGitRepo()]);
  await scheduleNextRun();
  await augEffects.logOperation('CHRONOS CORE ACTIVE: Bot awaits its next pulse!', CONFIG.LOG_FILE);
})();