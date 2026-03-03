import { Command } from 'commander';
import { findAngularRoot, colorize } from '@ngtk/shared';
import type { GlobalOptions } from '@ngtk/shared';

const program = new Command();

program
  .name('ngtk')
  .description('Angular Toolkit CLI — diagnostiquer, analyser et maintenir les projets Angular')
  .version('0.1.0');

// Global options helper
function globalOpts(cmd: Command): Command {
  return cmd
    .option('-r, --root <path>', 'Angular project root', process.cwd())
    .option('--json', 'Output as JSON', false)
    .option('-v, --verbose', 'Verbose output', false);
}

async function getOptions(opts: any): Promise<GlobalOptions> {
  const root = await findAngularRoot(opts.root);
  return { root, json: opts.json || false, verbose: opts.verbose || false };
}

function wrapAction(fn: (opts: any) => Promise<void>): (opts: any) => Promise<void> {
  return async (opts: any) => {
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
  program.command('info').description('Dashboard neofetch-style du projet Angular')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/info');
  await run(await getOptions(opts));
}));

// 2. env-compare
globalOpts(
  program.command('env-compare').alias('env').description('Comparateur d\'environnements Angular')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/env-compare');
  await run(await getOptions(opts));
}));

// 3. component-weight
globalOpts(
  program.command('component-weight').alias('cw').description('Classement composants par poids fichier')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/component-weight');
  await run(await getOptions(opts));
}));

// 4. dep-map
globalOpts(
  program.command('dep-map').alias('deps').description('Cartographie des dépendances')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/dep-map');
  await run(await getOptions(opts));
}));

// 5. orphans
globalOpts(
  program.command('orphans').description('Fichiers .ts/.html/.scss non référencés')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/orphans');
  await run(await getOptions(opts));
}));

// 6. empty-barrel
globalOpts(
  program.command('empty-barrel').alias('eb').description('Fichiers boilerplate inutiles')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/empty-barrel');
  await run(await getOptions(opts));
}));

// 7. dead-css
globalOpts(
  program.command('dead-css').alias('dc').description('CSS mort par composant')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/dead-css');
  await run(await getOptions(opts));
}));

// 8. route-tree
globalOpts(
  program.command('route-tree').alias('rt').description('Arbre ASCII des routes Angular')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/route-tree');
  await run(await getOptions(opts));
}));

// 9. component-catalog
globalOpts(
  program.command('component-catalog').alias('cc').description('Catalogue des composants Angular')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/component-catalog');
  await run(await getOptions(opts));
}));

// 10. compat-matrix
globalOpts(
  program.command('compat-matrix').alias('compat').description('Matrice de compatibilité Angular')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/compat-matrix');
  await run(await getOptions(opts));
}));

// 11. debt-log
globalOpts(
  program.command('debt-log').alias('debt').description('Agrégateur TODO/FIXME/HACK')
).action(wrapAction(async (opts) => {
  const { run } = await import('@ngtk/debt-log');
  await run(await getOptions(opts));
}));

program.parse();
