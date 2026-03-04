import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { findAngularRoot, colorize } from '@ngpulse/shared';
import type { GlobalOptions } from '@ngpulse/shared';

let pkgJson: { version: string };
try {
  pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
} catch {
  console.error('Error: could not read CLI package.json');
  process.exit(1);
}

const program = new Command();

program
  .name('ngtk')
  .description('Diagnose, analyze, and maintain Angular projects from the terminal')
  .version(pkgJson.version, '-V, --version');

// Global options helper
function globalOpts(cmd: Command): Command {
  return cmd
    .option('-r, --root <path>', 'Angular project root', process.cwd())
    .option('--json', 'Output as JSON', false)
    .option('-v, --verbose', 'Verbose output', false)
    .option('-m, --more', 'Show file details for each indicator', false);
}

interface RawOptions {
  root: string;
  json: boolean;
  verbose: boolean;
  more: boolean;
}

async function getOptions(opts: RawOptions): Promise<GlobalOptions> {
  const root = await findAngularRoot(opts.root);
  return { root, json: opts.json || false, verbose: opts.verbose || false, more: opts.more || false };
}

function wrapAction(fn: (opts: RawOptions) => Promise<void>): (opts: RawOptions) => Promise<void> {
  return async (opts: RawOptions) => {
    try {
      await fn(opts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(colorize(`Error: ${message}`, 'red'));
      if (opts.verbose && err instanceof Error && err.stack) {
        console.error(colorize(err.stack, 'gray'));
      }
      process.exitCode = 1;
    }
  };
}

// Register all 11 commands
// 1. info
globalOpts(
  program.command('info').description('Neofetch-style Angular project dashboard')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/info');
  await run(await getOptions(opts));
}));

// 2. env-compare
globalOpts(
  program.command('env-compare').alias('env').description('Comparateur d\'environnements Angular')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/env-compare');
  await run(await getOptions(opts));
}));

// 3. component-weight
globalOpts(
  program.command('component-weight').alias('cw').description('Rank components by total file weight')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/component-weight');
  await run(await getOptions(opts));
}));

// 4. dep-map
globalOpts(
  program.command('dep-map').alias('deps').description('Map and categorize all dependencies')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/dep-map');
  await run(await getOptions(opts));
}));

// 5. orphans
globalOpts(
  program.command('orphans').description('Find unreferenced .ts/.html/.scss files')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/orphans');
  await run(await getOptions(opts));
}));

// 6. empty-barrel
globalOpts(
  program.command('empty-barrel').alias('eb').description('Detect empty stylesheets, trivial specs, empty services')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/empty-barrel');
  await run(await getOptions(opts));
}));

// 7. dead-css
globalOpts(
  program.command('dead-css').alias('dc').description('Find unused CSS classes per component')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/dead-css');
  await run(await getOptions(opts));
}));

// 8. route-tree
globalOpts(
  program.command('route-tree').alias('rt').description('Print the route tree as ASCII with guards and lazy markers')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/route-tree');
  await run(await getOptions(opts));
}));

// 9. component-catalog
globalOpts(
  program.command('component-catalog').alias('cc').description('List all components with metadata')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/component-catalog');
  await run(await getOptions(opts));
}));

// 10. compat-matrix
globalOpts(
  program.command('compat-matrix').alias('compat').description('Check Angular/TypeScript/RxJS/Node compatibility')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/compat-matrix');
  await run(await getOptions(opts));
}));

// 11. debt-log
globalOpts(
  program.command('debt-log').alias('debt').description('Aggregate TODO/FIXME/HACK comments with git blame')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/debt-log');
  await run(await getOptions(opts));
}));

// 12. input-output
globalOpts(
  program.command('input-output').alias('io').description('Audit @Input/@Output usage across components')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/input-output');
  await run(await getOptions(opts));
}));

// 13. circular-deps
globalOpts(
  program.command('circular-deps').alias('cd').description('Detect circular import dependencies')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/circular-deps');
  await run(await getOptions(opts));
}));

// 14. test-coverage
globalOpts(
  program.command('test-coverage').alias('tc').description('Show test coverage summary from reports')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/test-coverage');
  await run(await getOptions(opts));
}));

// 15. i18n-check
globalOpts(
  program.command('i18n-check').alias('i18n').description('Find missing i18n markers in templates')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/i18n-check');
  await run(await getOptions(opts));
}));

// 16. migration-hints
globalOpts(
  program.command('migration-hints').alias('mig').description('List Angular migration opportunities')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/migration-hints');
  await run(await getOptions(opts));
}));

// 17. signal-migrate
globalOpts(
  program.command('signal-migrate').alias('sig').description('Find signal() migration candidates')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/signal-migrate');
  await run(await getOptions(opts));
}));

// 18. naming-check
globalOpts(
  program.command('naming-check').alias('nc').description('Check Angular naming conventions')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/naming-check');
  await run(await getOptions(opts));
}));

// 19. style-audit
globalOpts(
  program.command('style-audit').alias('sa').description('Audit stylesheets for ng-deep, !important, etc.')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/style-audit');
  await run(await getOptions(opts));
}));

// 20. hardcoded-secrets
globalOpts(
  program.command('hardcoded-secrets').alias('secrets').description('Scan for hardcoded API keys, tokens, passwords')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngpulse/hardcoded-secrets');
  await run(await getOptions(opts));
}));

program.parse();
