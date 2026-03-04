import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  type GlobalOptions,
  type ComponentMeta,
  scanFiles,
  readFileContent,
  readVersionFromDeps,
  createProject,
  getComponents,
  getServices,
  boxDraw,
  colorize,
  progressBar,
} from '@ngpulse/shared';

interface InfoData {
  project: { name: string; type: string };
  versions: {
    angular: string;
    angularInstalled: string | null;
    typescript: string;
    rxjs: string;
    node: string;
  };
  packageManager: string;
  buildTool: string;
  strictMode: boolean;
  zoneless: boolean;
  hasAngularMaterial: boolean;
  hasNx: boolean;
  httpClient: 'modern' | 'legacy' | 'none';
  counts: {
    components: number;
    services: number;
    pipes: number;
    directives: number;
    guards: number;
    interceptors: number;
    modules: number;
  };
  linesOfCode?: { ts: number; html: number; scss: number; total: number };
  standaloneRatio: { standalone: number; total: number; files: string[]; allFiles: string[] };
  onPushRatio?: { onPush: number; total: number; files: string[]; allFiles: string[] };
  injectRatio?: { inject: number; constructor: number; files: string[]; allFiles: string[] };
  signalUsage: { filesWithSignals: number; totalComponentsAndServices: number; files: string[]; allFiles: string[] };
  lazyRoutes: { lazy: number; totalRoutes: number; files: string[]; allFiles: string[] };
}

async function detectPackageManager(root: string, pkg: Record<string, unknown>): Promise<string> {
  if (typeof pkg['packageManager'] === 'string') return (pkg['packageManager'] as string).split('@')[0];
  const checks: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [lockfile, manager] of checks) {
    if (fs.existsSync(path.join(root, lockfile))) return manager;
  }
  return 'unknown';
}

async function detectBuildTool(root: string): Promise<string> {
  const angularJsonPath = path.join(root, 'angular.json');
  if (!fs.existsSync(angularJsonPath)) return 'unknown';
  try {
    const raw = await readFileContent(angularJsonPath);
    if (raw.includes('@angular-devkit/build-angular:application')) return 'esbuild';
    if (raw.includes('@angular-devkit/build-angular:browser')) return 'webpack';
    const json = JSON.parse(raw);
    for (const proj of Object.values(json.projects || {}) as Record<string, unknown>[]) {
      const builder: string = (proj as {architect?: {build?: {builder?: string}}, targets?: {build?: {executor?: string}}})?.architect?.build?.builder || (proj as {targets?: {build?: {executor?: string}}})?.targets?.build?.executor || '';
      if (builder.includes('esbuild') || builder.includes('application')) return 'esbuild';
      if (builder.includes('browser')) return 'webpack';
    }
  } catch { /* ignore */ }
  return 'unknown';
}

async function detectStrictMode(root: string): Promise<boolean> {
  for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    try {
      const json = JSON.parse(await readFileContent(p));
      if (json.compilerOptions?.strict === true) return true;
    } catch { /* ignore */ }
  }
  return false;
}

async function detectZoneless(root: string): Promise<boolean> {
  const files = await scanFiles(root, ['**/*.ts', '!**/*.spec.ts', '!**/*.d.ts']);
  for (const f of files) {
    try {
      const c = await readFileContent(f);
      if (c.includes('provideExperimentalZonelessChangeDetection') || c.includes('provideZonelessChangeDetection')) return true;
    } catch { /* skip */ }
  }
  return false;
}

function detectFromDeps(pkg: Record<string, unknown>, name: string): boolean {
  const all = { ...((pkg['dependencies'] as Record<string, string>) || {}), ...((pkg['devDependencies'] as Record<string, string>) || {}) };
  return name in all;
}

async function detectHttpClient(root: string): Promise<'modern' | 'legacy' | 'none'> {
  const files = await scanFiles(root, ['**/*.ts', '!**/*.spec.ts', '!**/*.d.ts']);
  let modern = false, legacy = false;
  for (const f of files) {
    try {
      const c = await readFileContent(f);
      if (c.includes('provideHttpClient')) modern = true;
      if (c.includes('HttpClientModule')) legacy = true;
    } catch { /* skip */ }
  }
  if (modern) return 'modern';
  if (legacy) return 'legacy';
  return 'none';
}

async function detectInstalledAngularVersion(root: string): Promise<string | null> {
  const p = path.join(root, 'node_modules', '@angular', 'core', 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    const json = JSON.parse(await readFileContent(p));
    return json.version ?? null;
  } catch { return null; }
}

async function detectProjectInfo(root: string): Promise<{ name: string; type: string }> {
  const angularJsonPath = path.join(root, 'angular.json');
  if (fs.existsSync(angularJsonPath)) {
    try {
      const json = JSON.parse(await readFileContent(angularJsonPath));
      const projects = json.projects || {};
      const name = json.defaultProject || Object.keys(projects)[0];
      if (name) return { name, type: projects[name]?.projectType || 'application' };
    } catch { /* ignore */ }
  }
  try {
    const json = JSON.parse(await readFileContent(path.join(root, 'package.json')));
    return { name: json.name || path.basename(root), type: 'application' };
  } catch { /* ignore */ }
  return { name: path.basename(root), type: 'application' };
}

async function countLinesOfCode(root: string): Promise<{ ts: number; html: number; scss: number; total: number }> {
  const [tsFiles, htmlFiles, scssFiles] = await Promise.all([
    scanFiles(root, ['**/*.ts', '!**/*.spec.ts', '!**/*.d.ts']),
    scanFiles(root, ['**/*.html']),
    scanFiles(root, ['**/*.scss', '**/*.css']),
  ]);
  const countLines = async (files: string[]) => {
    let total = 0;
    for (const f of files) {
      try {
        const c = await readFileContent(f);
        total += c.split('\n').filter((l: string) => l.trim().length > 0).length;
      } catch { /* skip */ }
    }
    return total;
  };
  const [ts, html, scss] = await Promise.all([countLines(tsFiles), countLines(htmlFiles), countLines(scssFiles)]);
  return { ts, html, scss, total: ts + html + scss };
}

async function detectOnPushRatio(root: string, components: ComponentMeta[]): Promise<{ onPush: number; total: number; files: string[]; allFiles: string[] }> {
  let onPush = 0;
  const files: string[] = [];
  const allFiles = components.map(c => path.relative(root, c.filePath));
  for (const comp of components) {
    try {
      const c = await readFileContent(comp.filePath);
      if (c.includes('ChangeDetectionStrategy.OnPush')) {
        onPush++;
        files.push(path.relative(root, comp.filePath));
      }
    } catch { /* skip */ }
  }
  return { onPush, total: components.length, files, allFiles };
}

async function detectInjectRatio(root: string): Promise<{ inject: number; constructor: number; files: string[]; allFiles: string[] }> {
  const scanned = await scanFiles(root, [
    '**/*.component.ts', '**/*.service.ts', '**/*.guard.ts', '**/*.interceptor.ts',
    '!**/*.spec.ts',
  ]);
  let injectCount = 0, constructorCount = 0;
  const injectFiles: string[] = [];
  for (const f of scanned) {
    try {
      const c = await readFileContent(f);
      const hasInject = /\binject\s*\(/.test(c) && /@angular\/core/.test(c);
      const hasConstructorDI = /constructor\s*\([^)]*:\s*[A-Z]/.test(c);
      if (hasInject) { injectCount++; injectFiles.push(path.relative(root, f)); }
      else if (hasConstructorDI) constructorCount++;
    } catch { /* skip */ }
  }
  return { inject: injectCount, constructor: constructorCount, files: injectFiles, allFiles: scanned.map(f => path.relative(root, f)) };
}

async function countSignalUsage(root: string): Promise<{ filesWithSignals: number; totalComponentsAndServices: number; files: string[]; allFiles: string[] }> {
  const scanned = await scanFiles(root, [
    '**/*.component.ts', '**/*.service.ts',
    '!**/*.spec.ts', '!**/*.d.ts',
  ]);
  let filesWithSignals = 0;
  const signalFiles: string[] = [];
  for (const f of scanned) {
    try {
      const c = await readFileContent(f);
      if (!/@angular\/core/.test(c)) continue;
      if (/\bsignal\s*\(/.test(c) || /\bcomputed\s*\(/.test(c)) {
        filesWithSignals++;
        signalFiles.push(path.relative(root, f));
      }
    } catch { /* skip */ }
  }
  return { filesWithSignals, totalComponentsAndServices: scanned.length, files: signalFiles, allFiles: scanned.map(f => path.relative(root, f)) };
}

async function countLazyRoutes(root: string): Promise<{ lazy: number; totalRoutes: number; files: string[]; allFiles: string[] }> {
  const routeFiles = await scanFiles(root, [
    '**/*routing*.ts', '**/*routes*.ts', '**/*.routes.ts', '**/app.config.ts',
  ]);
  let lazy = 0, total = 0;
  const lazyFiles: string[] = [];
  for (const f of routeFiles) {
    try {
      const c = await readFileContent(f);
      total += (c.match(/path\s*:/g) || []).length;
      const fileLazy = (c.match(/loadComponent\s*:/g) || []).length + (c.match(/loadChildren\s*:/g) || []).length;
      if (fileLazy > 0) lazyFiles.push(path.relative(root, f));
      lazy += fileLazy;
    } catch { /* skip */ }
  }
  return { lazy: Math.min(lazy, total), totalRoutes: total, files: lazyFiles, allFiles: routeFiles.map(f => path.relative(root, f)) };
}

async function gatherInfoData(options: GlobalOptions): Promise<InfoData> {
  const pkgContent = await readFileContent(path.join(options.root, 'package.json'));
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(pkgContent); }
  catch { throw new Error(`Invalid JSON in package.json`); }

  const [projectInfo, packageManager, buildTool, strictMode, zoneless, httpClient, angularInstalled] = await Promise.all([
    detectProjectInfo(options.root),
    detectPackageManager(options.root, pkg),
    detectBuildTool(options.root),
    detectStrictMode(options.root),
    detectZoneless(options.root),
    detectHttpClient(options.root),
    detectInstalledAngularVersion(options.root),
  ]);

  const project = createProject();
  const [components, services] = await Promise.all([
    getComponents(options.root, project),
    getServices(options.root, project),
  ]);

  const [pipes, directives, guards, interceptors, modules] = await Promise.all([
    scanFiles(options.root, ['**/*.pipe.ts']),
    scanFiles(options.root, ['**/*.directive.ts']),
    scanFiles(options.root, ['**/*.guard.ts']),
    scanFiles(options.root, ['**/*.interceptor.ts']),
    scanFiles(options.root, ['**/*.module.ts']),
  ]);

  const [signalUsage, lazyRoutes] = await Promise.all([
    countSignalUsage(options.root),
    countLazyRoutes(options.root),
  ]);

  let linesOfCode: InfoData['linesOfCode'];
  let onPushRatio: InfoData['onPushRatio'];
  let injectRatio: InfoData['injectRatio'];

  if (options.more) {
    [linesOfCode, onPushRatio, injectRatio] = await Promise.all([
      countLinesOfCode(options.root),
      detectOnPushRatio(options.root, components),
      detectInjectRatio(options.root),
    ]);
  }

  const standaloneCount = components.filter((c: ComponentMeta) => c.standalone).length;

  return {
    project: projectInfo,
    versions: {
      angular: readVersionFromDeps(pkg, '@angular/core'),
      angularInstalled,
      typescript: readVersionFromDeps(pkg, 'typescript'),
      rxjs: readVersionFromDeps(pkg, 'rxjs'),
      node: process.version,
    },
    packageManager,
    buildTool,
    strictMode,
    zoneless,
    hasAngularMaterial: detectFromDeps(pkg, '@angular/material') || detectFromDeps(pkg, '@angular/cdk'),
    hasNx: fs.existsSync(path.join(options.root, 'nx.json')),
    httpClient,
    counts: {
      components: components.length,
      services: services.length,
      pipes: pipes.length,
      directives: directives.length,
      guards: guards.length,
      interceptors: interceptors.length,
      modules: modules.length,
    },
    linesOfCode,
    standaloneRatio: { standalone: standaloneCount, total: components.length, files: components.filter((c: ComponentMeta) => c.standalone).map((c: ComponentMeta) => path.relative(options.root, c.filePath)), allFiles: components.map((c: ComponentMeta) => path.relative(options.root, c.filePath)) },
    onPushRatio,
    injectRatio,
    signalUsage,
    lazyRoutes,
  };
}

function yn(val: boolean): string {
  return val ? colorize('yes', 'green') : colorize('no', 'red');
}

function httpClientLabel(val: 'modern' | 'legacy' | 'none'): string {
  if (val === 'modern') return colorize('provideHttpClient', 'green');
  if (val === 'legacy') return colorize('HttpClientModule', 'yellow');
  return colorize('none', 'red');
}

export async function run(options: GlobalOptions): Promise<void> {
  if (options.verbose) console.error('Gathering project info...');
  const data = await gatherInfoData(options);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const lines: string[] = [];

  // Project
  lines.push('');
  lines.push(colorize('  Project', 'cyan'));
  lines.push(`    ${colorize('Name:', 'green')}         ${data.project.name}`);
  lines.push(`    ${colorize('Type:', 'green')}         ${data.project.type}`);

  // Versions
  lines.push('');
  lines.push(colorize('  Versions', 'cyan'));
  const angularDisplay = data.versions.angularInstalled
    ? `${data.versions.angular} ${colorize(`(installed: ${data.versions.angularInstalled})`, 'white')}`
    : data.versions.angular;
  lines.push(`    ${colorize('Angular:', 'green')}      ${angularDisplay}`);
  lines.push(`    ${colorize('TypeScript:', 'green')}   ${data.versions.typescript}`);
  lines.push(`    ${colorize('RxJS:', 'green')}         ${data.versions.rxjs}`);
  lines.push(`    ${colorize('Node:', 'green')}         ${data.versions.node}`);
  lines.push(`    ${colorize('Pkg Manager:', 'green')}  ${data.packageManager}`);
  lines.push(`    ${colorize('Build Tool:', 'green')}   ${data.buildTool}`);

  if (options.more) {
    // Config
    lines.push('');
    lines.push(colorize('  Configuration', 'cyan'));
    lines.push(`    ${colorize('Strict Mode:', 'green')}  ${yn(data.strictMode)}`);
    lines.push(`    ${colorize('Zoneless:', 'green')}     ${yn(data.zoneless)}`);
    lines.push(`    ${colorize('HttpClient:', 'green')}   ${httpClientLabel(data.httpClient)}`);
    lines.push(`    ${colorize('Material:', 'green')}     ${yn(data.hasAngularMaterial)}`);
    lines.push(`    ${colorize('NX:', 'green')}           ${yn(data.hasNx)}`);

    // Lines of code
    lines.push('');
    lines.push(colorize('  Lines of Code', 'cyan'));
    const padLoc = (n: number) => String(n).padStart(5);
    lines.push(`    ${colorize('TypeScript:', 'yellow')}  ${padLoc(data.linesOfCode!.ts)}`);
    lines.push(`    ${colorize('HTML:      ', 'yellow')}  ${padLoc(data.linesOfCode!.html)}`);
    lines.push(`    ${colorize('SCSS:      ', 'yellow')}  ${padLoc(data.linesOfCode!.scss)}`);
    lines.push(`    ${colorize('Total:     ', 'yellow')}  ${padLoc(data.linesOfCode!.total)}`);
  }

  // Counts
  lines.push('');
  lines.push(colorize('  Artifact Counts', 'cyan'));
  const pad = (n: number) => String(n).padStart(4);
  lines.push(`    ${colorize('Components:  ', 'yellow')} ${pad(data.counts.components)}`);
  lines.push(`    ${colorize('Services:    ', 'yellow')} ${pad(data.counts.services)}`);
  lines.push(`    ${colorize('Pipes:       ', 'yellow')} ${pad(data.counts.pipes)}`);
  lines.push(`    ${colorize('Directives:  ', 'yellow')} ${pad(data.counts.directives)}`);
  lines.push(`    ${colorize('Guards:      ', 'yellow')} ${pad(data.counts.guards)}`);
  lines.push(`    ${colorize('Interceptors:', 'yellow')} ${pad(data.counts.interceptors)}`);
  lines.push(`    ${colorize('Modules:     ', 'yellow')} ${pad(data.counts.modules)}`);

  // Health indicators
  lines.push('');
  lines.push(colorize('  Health Indicators', 'cyan'));

  const standaloneBar = progressBar(data.standaloneRatio.standalone, data.standaloneRatio.total, 20, 'greenBright');
  const signalBar     = progressBar(data.signalUsage.filesWithSignals, data.signalUsage.totalComponentsAndServices, 20, 'green');
  const lazyBar       = progressBar(data.lazyRoutes.lazy, data.lazyRoutes.totalRoutes, 20, 'darkGreen');

  const pushFiles = (matchFiles: string[], allFiles: string[]) => {
    const matchSet = new Set(matchFiles);
    for (const f of allFiles) {
      if (matchSet.has(f)) {
        lines.push(`      ${colorize('✓', 'green')} ${f}`);
      } else {
        lines.push(`      ${colorize('·', 'white')} ${colorize(f, 'white')}`);
      }
    }
  };

  lines.push(`    ${colorize('Standalone:  ', 'magenta')} ${standaloneBar}  (${data.standaloneRatio.standalone}/${data.standaloneRatio.total})`);
  if (options.more) pushFiles(data.standaloneRatio.files, data.standaloneRatio.allFiles);

  lines.push(`    ${colorize('Signals:     ', 'magenta')} ${signalBar}  (${data.signalUsage.filesWithSignals}/${data.signalUsage.totalComponentsAndServices} files)`);
  if (options.more) pushFiles(data.signalUsage.files, data.signalUsage.allFiles);

  lines.push(`    ${colorize('Lazy Routes: ', 'magenta')} ${lazyBar}  (${data.lazyRoutes.lazy}/${data.lazyRoutes.totalRoutes} routes)`);
  if (options.more) pushFiles(data.lazyRoutes.files, data.lazyRoutes.allFiles);

  if (options.more) {
    const onPushBar   = progressBar(data.onPushRatio!.onPush, data.onPushRatio!.total, 20, 'greenBright');
    const injectTotal = data.injectRatio!.inject + data.injectRatio!.constructor;
    const injectBar   = progressBar(data.injectRatio!.inject, injectTotal, 20, 'green');
    lines.push(`    ${colorize('OnPush:      ', 'magenta')} ${onPushBar}  (${data.onPushRatio!.onPush}/${data.onPushRatio!.total})`);
    pushFiles(data.onPushRatio!.files, data.onPushRatio!.allFiles);
    lines.push(`    ${colorize('inject():    ', 'magenta')} ${injectBar}  (${data.injectRatio!.inject}/${injectTotal} files)`);
    pushFiles(data.injectRatio!.files, data.injectRatio!.allFiles);
  }

  lines.push('');

  console.log(boxDraw(null, lines));
}
