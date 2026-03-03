import * as path from 'node:path';
import {
  type GlobalOptions,
  type ComponentMeta,
  scanFiles,
  readFileContent,
  createProject,
  getComponents,
  getServices,
  boxDraw,
  colorize,
  progressBar,
} from '@ngtk/shared';

interface InfoData {
  versions: {
    angular: string;
    typescript: string;
    rxjs: string;
    node: string;
  };
  packageManager: string;
  counts: {
    components: number;
    services: number;
    pipes: number;
    directives: number;
    guards: number;
    interceptors: number;
    modules: number;
  };
  standaloneRatio: { standalone: number; total: number };
  signalUsage: { filesWithSignals: number; totalTsFiles: number };
  lazyRoutes: { lazy: number; totalRoutes: number };
}

async function detectPackageManager(root: string): Promise<string> {
  const checks: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];
  for (const [lockfile, manager] of checks) {
    const files = await scanFiles(root, [lockfile]);
    if (files.length > 0) return manager;
  }
  return 'unknown';
}

function readVersionFromDeps(pkg: Record<string, any>, dep: string): string {
  return (
    pkg.dependencies?.[dep] ||
    pkg.devDependencies?.[dep] ||
    'not found'
  );
}

async function countSignalUsage(root: string): Promise<{ filesWithSignals: number; totalTsFiles: number }> {
  const tsFiles = await scanFiles(root, ['**/*.ts', '!**/*.spec.ts', '!**/*.d.ts']);
  let filesWithSignals = 0;
  const signalPatterns = [/\bsignal\s*\(/, /\bcomputed\s*\(/, /\beffect\s*\(/];

  for (const filePath of tsFiles) {
    try {
      const content = await readFileContent(filePath);
      const hasSignal = signalPatterns.some((pattern) => pattern.test(content));
      if (hasSignal) filesWithSignals++;
    } catch {
      // skip unreadable files
    }
  }

  return { filesWithSignals, totalTsFiles: tsFiles.length };
}

async function countLazyRoutes(root: string): Promise<{ lazy: number; totalRoutes: number }> {
  const routingFiles = await scanFiles(root, [
    '**/*routing*.ts',
    '**/*routes*.ts',
    '**/*.routes.ts',
  ]);

  let lazyCount = 0;
  let totalRouteEntries = 0;

  for (const filePath of routingFiles) {
    try {
      const content = await readFileContent(filePath);
      const pathMatches = content.match(/path\s*:/g);
      if (pathMatches) totalRouteEntries += pathMatches.length;

      const loadComponentMatches = content.match(/loadComponent\s*:/g);
      const loadChildrenMatches = content.match(/loadChildren\s*:/g);
      if (loadComponentMatches) lazyCount += loadComponentMatches.length;
      if (loadChildrenMatches) lazyCount += loadChildrenMatches.length;
    } catch {
      // skip unreadable files
    }
  }

  return { lazy: lazyCount, totalRoutes: totalRouteEntries };
}

async function gatherInfoData(options: GlobalOptions): Promise<InfoData> {
  const pkgPath = path.join(options.root, 'package.json');
  const pkgContent = await readFileContent(pkgPath);
  const pkg = JSON.parse(pkgContent);

  const angularVersion = readVersionFromDeps(pkg, '@angular/core');
  const typescriptVersion = readVersionFromDeps(pkg, 'typescript');
  const rxjsVersion = readVersionFromDeps(pkg, 'rxjs');
  const nodeVersion = process.version;

  const packageManager = await detectPackageManager(options.root);

  const project = createProject();
  const components = await getComponents(options.root, project);
  const services = await getServices(options.root, project);

  const pipes = await scanFiles(options.root, ['**/*.pipe.ts']);
  const directives = await scanFiles(options.root, ['**/*.directive.ts']);
  const guards = await scanFiles(options.root, ['**/*.guard.ts']);
  const interceptors = await scanFiles(options.root, ['**/*.interceptor.ts']);
  const modules = await scanFiles(options.root, ['**/*.module.ts']);

  const standaloneCount = components.filter((c: ComponentMeta) => c.standalone).length;

  const signalUsage = await countSignalUsage(options.root);
  const lazyRoutes = await countLazyRoutes(options.root);

  return {
    versions: {
      angular: angularVersion,
      typescript: typescriptVersion,
      rxjs: rxjsVersion,
      node: nodeVersion,
    },
    packageManager,
    counts: {
      components: components.length,
      services: services.length,
      pipes: pipes.length,
      directives: directives.length,
      guards: guards.length,
      interceptors: interceptors.length,
      modules: modules.length,
    },
    standaloneRatio: { standalone: standaloneCount, total: components.length },
    signalUsage,
    lazyRoutes,
  };
}

export async function run(options: GlobalOptions): Promise<void> {
  const data = await gatherInfoData(options);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const lines: string[] = [];

  // Versions section
  lines.push('');
  lines.push(colorize('  Versions', 'cyan'));
  lines.push(`    ${colorize('Angular:', 'green')}      ${data.versions.angular}`);
  lines.push(`    ${colorize('TypeScript:', 'green')}   ${data.versions.typescript}`);
  lines.push(`    ${colorize('RxJS:', 'green')}         ${data.versions.rxjs}`);
  lines.push(`    ${colorize('Node:', 'green')}         ${data.versions.node}`);
  lines.push(`    ${colorize('Pkg Manager:', 'green')}  ${data.packageManager}`);

  // Counts section
  lines.push('');
  lines.push(colorize('  Artifact Counts', 'cyan'));
  lines.push(`    ${colorize('Components:', 'yellow')}    ${data.counts.components}`);
  lines.push(`    ${colorize('Services:', 'yellow')}      ${data.counts.services}`);
  lines.push(`    ${colorize('Pipes:', 'yellow')}          ${data.counts.pipes}`);
  lines.push(`    ${colorize('Directives:', 'yellow')}    ${data.counts.directives}`);
  lines.push(`    ${colorize('Guards:', 'yellow')}         ${data.counts.guards}`);
  lines.push(`    ${colorize('Interceptors:', 'yellow')}  ${data.counts.interceptors}`);
  lines.push(`    ${colorize('Modules:', 'yellow')}       ${data.counts.modules}`);

  // Progress indicators
  lines.push('');
  lines.push(colorize('  Health Indicators', 'cyan'));

  const standaloneBar = progressBar(
    data.standaloneRatio.standalone,
    data.standaloneRatio.total,
  );
  lines.push(
    `    ${colorize('Standalone:', 'magenta')}   ${standaloneBar}  (${data.standaloneRatio.standalone}/${data.standaloneRatio.total})`,
  );

  const signalBar = progressBar(
    data.signalUsage.filesWithSignals,
    data.signalUsage.totalTsFiles,
  );
  lines.push(
    `    ${colorize('Signals:', 'magenta')}      ${signalBar}  (${data.signalUsage.filesWithSignals}/${data.signalUsage.totalTsFiles} files)`,
  );

  const lazyBar = progressBar(data.lazyRoutes.lazy, data.lazyRoutes.totalRoutes);
  lines.push(
    `    ${colorize('Lazy Routes:', 'magenta')}  ${lazyBar}  (${data.lazyRoutes.lazy}/${data.lazyRoutes.totalRoutes} routes)`,
  );

  lines.push('');

  const box = boxDraw('ngtk — Angular Project Info', lines);
  console.log(box);
}
