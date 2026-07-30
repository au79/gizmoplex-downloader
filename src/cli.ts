import { Command } from 'commander';
import { parseOptionalDelayRange, parsePositiveInteger } from './lib/options.js';
import type { CliOptions, Options } from './types.js';

export function parseOptions(argv = process.argv): Options {
  const program = new Command()
    .name('gizmoplex-downloader')
    .description('List purchased Gizmoplex transactions.')
    .option('--dry-run', 'show what would be downloaded without writing files', false)
    .option('-i, --interactive', 'select one transaction and choose videos interactively', false)
    .option('--clear-cache', 'clear cached video metadata at app launch', false)
    .option('--out <dirpath>', 'root directory for downloaded files', './gizmoplex-archive/')
    .option('--in-progress-plan <filepath>', 'path to the in-progress download plan')
    .option('--show-in-progress-plan', 'print the saved in-progress download plan and exit', false)
    .option('-y, --yes', 'skip the non-interactive download confirmation', false)
    .option('--delay <seconds>', 'random delay range between downloadable items, as min-max seconds')
    .option('--srt', 'select SRT subtitle files', false)
    .option('--vtt', 'select VTT subtitle files', false)
    .option('--timeout <ms>', 'request timeout in milliseconds', parsePositiveInteger, 30_000);

  program.parse(argv);
  const options = program.opts<CliOptions>();

  return { ...options, delay: parseOptionalDelayRange(options.delay, options.dryRun) };
}
