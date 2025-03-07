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
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
  BLUE: '\x1b[34m'
};
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;
const format = (segments) => segments.map(([color, text]) => `${color}${text}${COLORS.RESET}`).join('');
const progressBar = (current, total) => {
  const length = 10;
  const filled = Math.round((current / total) * length);
  return format([[COLORS.CYAN, '['], [COLORS.YELLOW, '█'.repeat(filled)], [COLORS.RESET, '░'.repeat(length - filled)], [COLORS.CYAN, ']']]);
};
const highlight = (text) => text.replace(/(Synced|streamed)/gi, `${COLORS.BLUE}$1${COLORS.RESET}`);
const display = (message, type = 'info') => {
  const segments = type === 'error' ? [[COLORS.RED, '[-]'], [COLORS.RED, ` ${message}`]] : [[COLORS.CYAN, SPINNER[spinnerIndex++ % SPINNER.length]], [COLORS.GREEN, ` ${highlight(message)}`]];
  return format(segments);
};
const logToFile = async (message, logFile, type) => {
  if (!logFile) return;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  await appendFileAsync(logFile, `[${timestamp}] ${type.toUpperCase()}: ${message}\n`);
};
const logOperation = async (message, logFile) => {
  console.log(display(message));
  await logToFile(message, logFile, 'info');
};
const logError = async (message, logFile) => {
  console.log(display(message, 'error'));
  await logToFile(message, logFile, 'error');
};
const formatStartup = () => format([[COLORS.GREEN, 'Git Chronos: Starting at '], [COLORS.RESET, getTime()]]);
const getTime = () => new Date().toLocaleTimeString('en-US', { hour12: false });
module.exports = { format, display, logOperation, logError, progressBar, formatStartup, getTime, COLORS };