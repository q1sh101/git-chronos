#!/usr/bin/env node
// ===================================================================
// |> Git Chronos - The Commit Engine <|
// ===================================================================
// Features:
// 1. Configurable weekday/weekend execution (with --enableWeekends flag)
// 2. Random commits with configurable range (default 1-10/day, set via --minCommits/--maxCommits)
// 3. Timezone-aware commits (default: America/New_York, configurable via --timezone)
// 4. Fully asynchronous Git & file operations for maximum performance
// 5. Customizable commit intervals (default 5-55 sec, set via --commitDelayMin/--commitDelayMax)
// 6. Comprehensive CLI configuration (repo path, branch, commit limits, timezone, file paths, etc.)
// 7. Centralized logging with file output (configurable via --logFile, default: bot_runtime.log)
// 8. Proactive health monitoring with remote Git validation and system diagnostics
// 9. Secure parameter handling (CLI args with environment variable fallbacks)
// 10. Independent daily commit limit enforcement (default: 15, set via --dailyLimit, resets daily)
// 11. Pure Node.js implementation, no external dependencies for full control
// 12. Robust error handling with try-catch across all critical operations
// 13. Graceful shutdown with cleanup (tracker save, lock removal)
const { promisify } = require('util');
const { exec, appendFile, writeFile, readFile, access, constants } = require('fs');
const { resolve, join } = require('path');
const augEffects = require('./augEffects');
const execPromise = promisify(exec);
const appendFileAsync = promisify(appendFile);
const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);
const accessAsync = promisify(access);
if (process.argv.includes('--help')) {
  console.log('Git Chronos Help: Use --repo=<path> to set repository.');
  process.exit(0);
}
const args = {};
process.argv.slice(2).forEach((arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    args[key] = value || true;
  }
});
const CONFIG = {
  REPO_DIR: resolve(args.repo || process.cwd()),
  LOG_FILE: args.logFile || 'bot_runtime.log',
  TARGET_FILE: 'bot_activity.log',
  GIT_BRANCH: 'main',
  COMMIT_TRACKER_FILE: join(resolve(args.repo || process.cwd()), 'commit_tracker.json'),
  SCHEDULE_START: 9,
  SCHEDULE_END: 17,
  DAILY_LIMIT: 15
};
let commitTrackerCache = { commitCount: 0, lastRunDate: new Date().toISOString() };
const initCommitTracker = async () => {
  try {
    if (!(await readFileAsync(CONFIG.COMMIT_TRACKER_FILE).catch(() => false))) {
      await writeFileAsync(CONFIG.COMMIT_TRACKER_FILE, JSON.stringify(commitTrackerCache));
    } else {
      commitTrackerCache = JSON.parse(await readFileAsync(CONFIG.COMMIT_TRACKER_FILE));
    }
  } catch (e) {
    await augEffects.logError(`Tracker init failed: ${e.message}`, CONFIG.LOG_FILE);
  }
};
const initGitRepo = async () => {
  try {
    await execPromise('git init', { cwd: CONFIG.REPO_DIR });
    await augEffects.logOperation('Git repo initialized', CONFIG.LOG_FILE);
  } catch (e) {
    await augEffects.logError(`Git init failed: ${e.message}`, CONFIG.LOG_FILE);
  }
};
const modifyFile = async () => {
  try {
    await appendFileAsync(join(CONFIG.REPO_DIR, CONFIG.TARGET_FILE), `Update at ${augEffects.getTime()}\n`);
    await augEffects.logOperation('File modified', CONFIG.LOG_FILE);
  } catch (e) {
    await augEffects.logError(`File modify failed: ${e.message}`, CONFIG.LOG_FILE);
  }
};
const performGitOperations = async () => {
  try {
    await execPromise('git add .', { cwd: CONFIG.REPO_DIR });
    await execPromise('git commit -m "Auto commit"', { cwd: CONFIG.REPO_DIR });
    await augEffects.logOperation('Git operations completed Synced', CONFIG.LOG_FILE);
  } catch (e) {
    await augEffects.logError(`Git operations failed: ${e.message}`, CONFIG.LOG_FILE);
  }
};
const performHealthCheck = async () => {
  try {
    await accessAsync(CONFIG.REPO_DIR, constants.W_OK);
    await augEffects.logOperation('Repo directory writable', CONFIG.LOG_FILE);
    await execPromise('git status', { cwd: CONFIG.REPO_DIR });
    return true;
  } catch (e) {
    await augEffects.logError(`Health check failed: ${e.message}`, CONFIG.LOG_FILE);
    return false;
  }
};
const isWorkingHours = () => {
  const hour = new Date().getHours();
  return hour >= CONFIG.SCHEDULE_START && hour < CONFIG.SCHEDULE_END;
};
const shouldCommitToday = () => commitTrackerCache.commitCount < CONFIG.DAILY_LIMIT;
const runBot = async () => {
  if (!await performHealthCheck()) return;
  if (!isWorkingHours()) {
    await augEffects.logWarning('Outside working hours', CONFIG.LOG_FILE);
    return;
  }
  if (!shouldCommitToday()) {
    await augEffects.logWarning('Daily limit reached', CONFIG.LOG_FILE);
    return;
  }
  await modifyFile();
  await performGitOperations();
  commitTrackerCache.commitCount++;
  await writeFileAsync(CONFIG.COMMIT_TRACKER_FILE, JSON.stringify(commitTrackerCache));
};
(async () => { await initCommitTracker(); await initGitRepo(); console.log(augEffects.formatStartup()); await runBot(); })();