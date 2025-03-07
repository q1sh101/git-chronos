// ===================================================================
// |> Terminal Effects for Git Chronos <|
// ===================================================================
// Professional terminal visuals for Git Chronos.
// Features: basic coloring, spinners, progress bars.
// Yellow for functional pauses, red for errors, green for success.
// Optimized for reliability with strict ANSI color management.

const { appendFile, stat } = require('fs');
const { promisify } = require('util');
const appendFileAsync = promisify(appendFile);
const statAsync = promisify(stat);

// ANSI color codes
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
};

// Spinner
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

// Centralized formatting with strict reset
const format = (segments) => {
  const result = segments.map(([color, text]) => `${color}${text}${COLORS.RESET}`).join('');
  return `${result}${COLORS.RESET}`; // Double reset for safety
};

// Progress bar with yellow fill
const progressBar = (current, total) => {
  const length = 10;
  const filled = Math.round((current / total) * length);
  return format([
    [COLORS.CYAN, '['],
    [COLORS.YELLOW, '█'.repeat(filled)],
    [COLORS.RESET, '░'.repeat(length - filled)],
    [COLORS.CYAN, ']'],
  ]);
};

// Highlight keywords
const highlight = (text) => {
  return text.replace(/(Synced|streamed|standby|control|terminated)/gi, `${COLORS.BLUE}$1${COLORS.RESET}`);
};

// Core display function
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

// Log to file
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

// Get current time
const getTime = () => new Date().toLocaleTimeString('en-US', { hour12: false });

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
  formatStartup: () => format([
    [COLORS.GREEN, 'Git Chronos: Starting at '],
    [COLORS.RESET, getTime()],
  ]),
  formatShutdown: () => format([
    [COLORS.GREEN, 'Git Chronos: Stopped at '],
    [COLORS.RESET, getTime()],
  ]),
  formatCommitProgress: (i, total) => {
    const progress = progressBar(i + 1, total);
    return format([
      [COLORS.CYAN, SPINNER[spinnerIndex]],
      [COLORS.GREEN, ` ${progress} Commit ${i + 1}/${total}...`],
    ]);
  },
  formatCommitSuccess: (i, total) => {
    const progress = progressBar(i, total);
    return format([
      [COLORS.CYAN, '[+]'],
      [COLORS.GREEN, ` ${progress} Commit ${i}/${total} `],
      [COLORS.BLUE, 'Synced'],
      [COLORS.RESET, ` at ${getTime()}`],
    ]);
  },
};