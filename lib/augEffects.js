// ===================================================================
// |> Terminal Effects for Git Chronos <|
// ===================================================================
// Professional terminal visuals for Git Chronos.
// Features: basic coloring, spinners, progress bars.
// Yellow for functional pauses, red for errors, green for success.
// Optimized for reliability with strict ANSI color management.

const { createInterface } = require('readline');
const { appendFile, stat } = require('fs');
const { promisify } = require('util');
const appendFileAsync = promisify(appendFile);
const statAsync = promisify(stat);

// =======================
// |> ANSI Color Codes <|
// =======================
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m'
};

// ===============================
// |> Spinner Animation System <|
// ===============================
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

// ========================
// |> Formatting Engine <|
// ========================
const format = (segments) => {
  const result = segments.map(([color, text]) => `${color}${text}${COLORS.RESET}`).join('');
  return `${result}${COLORS.RESET}`;
};

// =========================
// |> Highlight Keywords <|
// =========================
// Highlights specific keywords in the terminal output for better readability
const highlight = (text) => text.replace(/(Synced|streamed|standby|control|terminated)/gi, `${COLORS.BLUE}$1${COLORS.RESET}`);

// ============================
// |> Core Display Function <|
// ============================
// Handles all terminal output with proper formatting and highlighting
const display = (message, type = 'info') => {
  const highlighted = highlight(message);
  const segments = [];
  switch (type) {
    case 'success':
      segments.push([COLORS.CYAN, SPINNER[spinnerIndex]], [COLORS.GREEN, `  ${highlighted}`]);
      break;
    case 'error':
      segments.push([COLORS.RED, '[-]'], [COLORS.RED, `  ${highlighted}`]);
      break;
    case 'warning':
      segments.push([COLORS.YELLOW, '[!]'], [COLORS.YELLOW, `  ${highlighted}`]);
      break;
    case 'info':
    default:
      segments.push([COLORS.CYAN, SPINNER[spinnerIndex]], [COLORS.GREEN, ` ${highlighted}`]);
      break;
  }
  spinnerIndex = (spinnerIndex + 1) % SPINNER.length;
  return format(segments);
};

// ====================================
// |> Progress Visualization System <|
// ====================================
const progressBar = (current, total) => {
  const length = 10;
  const filled = Math.round((current / total) * length);
  return format([
    [COLORS.CYAN, '['],
    [COLORS.YELLOW, '█'.repeat(filled)],
    [COLORS.RESET, '░'.repeat(length - filled)],
    [COLORS.CYAN, ']']
  ]);
};

// =============================
// |> Logging Infrastructure <|
// =============================
const logToFile = async (message, logFile, type = 'info') => {
  if (!logFile) return;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const cleanMessage = message.replace(/\x1b\[\d+m/g, '');
  const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${cleanMessage}\n`;
  try {
    if (!(await statAsync(logFile).catch(() => false))) {
      await appendFileAsync(logFile, '');
    }
    await appendFileAsync(logFile, logEntry);
  } catch (error) {
    console.error(format([[COLORS.RED, '[-]'], [COLORS.RED, ` LOG ERROR: ${error.message}`]]));
  }
};

// =============================================
// |> Interactive Configuration Module 
// =============================================
// Step-by-step configuration wizard with default value support
// Maintains original visual style while adding user guidance
const interactiveConfig = async (currentConfig) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.clear();
    console.log(format([[COLORS.GREEN, `
║  ██████╗ ██╗████████╗   ██████╗██╗  ██╗██████╗  ██████╗ ███╗   ██║ ██████╗ ███████╗
║ ██╔════╝ ██║╚══██╔══╝  ██╔════╝██║  ██║██╔══██╗██╔═══██╗████╗  ██║██╔═══██╗██╔════╝
║ ██║  ███╗██║   ██║     ██║     ███████║██████╔╝██║   ██║██╔██╗ ██║██║   ██║███████╗
║ ██║   ██║██║   ██║     ██║     ██╔══██║██╔══██╗██║   ██║██║╚██╗██║██║   ██║╚════██║
║ ╚██████╔╝██║   ██║     ╚██████╗██║  ██║██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝███████║
║  ╚═════╝ ╚═╝   ╚═╝      ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝
║      `]]));
    console.log(format([[COLORS.GREEN, '║ Git Chronos Configuration: ']]));
    console.log(format([[COLORS.GREEN, '║ Enter values or press ENTER for defaults :']]));
    console.log(format([[COLORS.GREEN, '╚══════════════════════════════════════════════════']]));

    // Core prompt sequence
    const prompts = [
      {
        question: 'Repository Path',
        default: currentConfig.REPO_DIR,
        key: 'repo'
      },
      {
        question: 'Git Branch',
        default: currentConfig.GIT_BRANCH,
        key: 'branch'
      },
      {
        question: 'Minimum Random Commits',
        default: currentConfig.MIN_COMMITS?.toString() || '1',
        key: 'minCommits',
        validate: Number
      },
      {
        question: 'Maximum Random Commits',
        default: currentConfig.MAX_COMMITS?.toString() || '10',
        key: 'maxCommits',
        validate: Number
      },
      {
        question: 'Daily Commit Limit',
        default: currentConfig.DAILY_LIMIT?.toString() || '15',
        key: 'dailyLimit',
        validate: Number
      },
      {
        question: 'Schedule Start Hour (0-23)',
        default: currentConfig.SCHEDULE_START?.toString() || '9',
        key: 'scheduleStart',
        validate: (v) => !isNaN(v) && Number(v) >= 0 && Number(v) <= 23
      },
      {
        question: 'Schedule End Hour (0-23)',
        default: currentConfig.SCHEDULE_END?.toString() || '17',
        key: 'scheduleEnd',
        validate: (v) => !isNaN(v) && Number(v) >= 0 && Number(v) <= 23
      },
      {
        question: 'Enable Weekend Mode (yes/no)',
        default: currentConfig.ENABLE_WEEKENDS ? 'yes' : 'no',
        key: 'enableWeekends',
        transform: (v) => v.toLowerCase() === 'yes'
      },
      {
        question: 'Timezone',
        default: currentConfig.TIMEZONE,
        key: 'timezone'
      },
      {
        question: 'Minimum Commit Delay (ms)',
        default: currentConfig.COMMIT_DELAY_MIN?.toString() || '1000',
        key: 'commitDelayMin',
        validate: Number
      },
      {
        question: 'Maximum Commit Delay (ms)',
        default: currentConfig.COMMIT_DELAY_MAX?.toString() || '5000',
        key: 'commitDelayMax',
        validate: Number
      },
      // {
      //   question: 'Target File',
      //   default: currentConfig.TARGET_FILE,
      //   key: 'targetFile'
      // },
      // {
      //   question: 'Commit Tracker File Path',
      //   default: currentConfig.COMMIT_TRACKER_FILE,
      //   key: 'commitTrackerFile'
      // },
      // {
      //   question: 'Lock File Path',
      //   default: currentConfig.LOCK_FILE,
      //   key: 'lockFile'
      // },
      // {
      //   question: 'Log File Path',
      //   default: currentConfig.LOG_FILE,
      //   key: 'logFile'
      // },
      // {
      //   question: 'Retry Attempts for Git Operations',
      //   default: currentConfig.RETRY_ATTEMPTS?.toString() || '3',
      //   key: 'retryAttempts',
      //   validate: Number
      // },
      // {
      //   question: 'Retry Delay (ms)',
      //   default: currentConfig.RETRY_DELAY?.toString() || '5000',
      //   key: 'retryDelay',
      //   validate: Number
      // }
    ];

    const config = {};
    for (const prompt of prompts) {
      const formattedPrompt = format([
        [COLORS.CYAN, `${prompt.question} `],
        [COLORS.YELLOW, `[${prompt.default}]: `]
      ]);

      const answer = await new Promise((resolve) => {
        rl.question(formattedPrompt, (input) => {
          const trimmedInput = input.trim();
          const displayValue = trimmedInput === '' ? prompt.default : trimmedInput;

          // Move cursor up and rewrite line with selected value
          process.stdout.moveCursor(0, -1); // Move up from new line
          process.stdout.cursorTo(0);
          process.stdout.clearLine(0);
          process.stdout.write(`${formattedPrompt}${displayValue}\n`);

          resolve(trimmedInput);
        });
      });

      const finalValue = answer === '' ? prompt.default : answer;
      config[prompt.key] = prompt.validate
        ? (prompt.validate(finalValue) ? finalValue : prompt.default)
        : (prompt.transform ? prompt.transform(finalValue) : finalValue);
    }

    return config;
  } finally {
    rl.close();
  }
};

// =========================
// |> Exported Interface <|
// =========================
// Maintains original exports with added configuration capability
module.exports = {
  logOperation: async (message, logFile) => {
    console.log(display(message, 'success'));
    await logToFile(message, logFile, 'info');
  },
  logError: async (message, logFile) => {
    console.log(display(message, 'error'));
    await logToFile(message, logFile, 'error');
  },
  logWarning: async (message, logFile) => {
    console.log(display(message, 'warning'));
    await logToFile(message, logFile, 'warn');
  },
  formatStartup: () => format([[COLORS.GREEN, 'Git Chronos: Starting Chronos Sequence']]),
  formatShutdown: () => format([[COLORS.GREEN, 'Git Chronos: Chronos Flow Terminated']]),
  formatCommitProgress: (i, total) => format([
    [COLORS.CYAN, SPINNER[spinnerIndex]],
    [COLORS.GREEN, ` ${progressBar(i + 1, total)} Commit ${i + 1}/${total}...`]
  ]),
  formatCommitSuccess: (i, total) => format([
    [COLORS.CYAN, '[+]'],
    [COLORS.GREEN, ` ${progressBar(i, total)} Commit ${i}/${total} `],
    [COLORS.BLUE, 'Synced'],
    [COLORS.RESET, ` ${new Date().toLocaleTimeString()}`]
  ]),
  interactiveConfig // NEW EXPORT
};