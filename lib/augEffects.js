// ===================================================================
// |> Terminal Effects for Git Chronos <|
// ===================================================================
// Professional terminal visuals for Git Chronos.
// Features: basic coloring, spinners, progress bars.
// Yellow for functional pauses, red for errors, green for success.
const { appendFile, stat } = require('fs');
const { promisify } = require('util');
const appendFileAsync = promisify(appendFile);
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  CYAN: '\x1b[36m'
};
const SPINNER = ['⠋', '⠙', '⠹'];
let spinnerIndex = 0;
const format = (segments) => segments.map(([color, text]) => `${color}${text}${COLORS.RESET}`).join('');
const display = (message, type = 'info') => {
  const segments = type === 'error' ? [[COLORS.RED, '[-]'], [COLORS.RED, ` ${message}`]] : [[COLORS.CYAN, SPINNER[spinnerIndex++ % SPINNER.length]], [COLORS.GREEN, ` ${message}`]];
  return format(segments);
};
const logOperation = async (message, logFile) => console.log(display(message));
module.exports = { format, display, logOperation, COLORS };