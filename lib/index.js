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
const { promisify } = require('util');
const { exec } = require('child_process');
const augEffects = require('./augEffects');
const execPromise = promisify(exec);
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
console.log(augEffects.format([[augEffects.COLORS.GREEN, 'Git Chronos starting...']]));