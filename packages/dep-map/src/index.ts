import * as path from 'node:path';
import {
  type GlobalOptions,
  type DependencyInfo,
  readFileContent,
  createTable,
  colorize,
} from '@ngpulse/shared';

const ECOSYSTEM_PATTERNS = [
  /^rxjs$/,
  /^zone\.js$/,
  /^@ngrx\//,
  /^@rx-angular\//,
  /^ng-/,
  /^ngx-/,
];

function classifyCategory(name: string): DependencyInfo['category'] {
  if (name.startsWith('@angular/')) return 'angular';
  if (ECOSYSTEM_PATTERNS.some((pattern) => pattern.test(name))) return 'ecosystem';
  return 'generic';
}

type Color = 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'gray' | 'white';

function colorForCategory(category: DependencyInfo['category']): Color {
  switch (category) {
    case 'angular':
      return 'cyan';
    case 'ecosystem':
      return 'yellow';
    case 'generic':
      return 'gray';
  }
}

function parseDeps(
  deps: Record<string, string> | undefined,
  depType: DependencyInfo['depType'],
): DependencyInfo[] {
  if (!deps) return [];
  return Object.entries(deps).map(([name, version]) => ({
    name,
    version,
    depType,
    category: classifyCategory(name),
    deprecated: false,
  }));
}

export async function run(options: GlobalOptions): Promise<void> {
  const pkgPath = path.join(options.root, 'package.json');
  const pkgContent = await readFileContent(pkgPath);
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(pkgContent);
  } catch {
    throw new Error(`Invalid JSON in ${pkgPath}`);
  }

  if (options.verbose) console.error('Parsing package.json dependencies...');
  const allDeps: DependencyInfo[] = [
    ...parseDeps(pkg.dependencies, 'dependencies'),
    ...parseDeps(pkg.devDependencies, 'devDependencies'),
  ];
  if (options.verbose) console.error(`Found ${allDeps.length} dependencies.`);

  // Sort by category (angular first, then ecosystem, then generic), then by name
  const categoryOrder: Record<string, number> = {
    angular: 0,
    ecosystem: 1,
    generic: 2,
  };
  allDeps.sort((a, b) => {
    const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });

  if (options.json) {
    console.log(JSON.stringify(allDeps, null, 2));
    return;
  }

  if (allDeps.length === 0) {
    console.log('No dependencies found in package.json.');
    return;
  }

  const headers = ['Package', 'Version', 'Type', 'Category'];
  const rows: string[][] = allDeps.map((dep) => [
    dep.name,
    dep.version,
    dep.depType === 'dependencies' ? 'prod' : 'dev',
    colorize(dep.category, colorForCategory(dep.category)),
  ]);

  // Count by category
  const angularCount = allDeps.filter((d) => d.category === 'angular').length;
  const ecosystemCount = allDeps.filter((d) => d.category === 'ecosystem').length;
  const genericCount = allDeps.filter((d) => d.category === 'generic').length;

  console.log('');
  console.log(colorize('Dependency Map', 'cyan'));
  console.log(colorize(`${allDeps.length} total dependencies`, 'gray'));
  console.log('');
  console.log(createTable(headers, rows));
  console.log('');
  console.log(
    `  ${colorize('Angular:', 'cyan')} ${angularCount}` +
    `  ${colorize('Ecosystem:', 'yellow')} ${ecosystemCount}` +
    `  ${colorize('Generic:', 'gray')} ${genericCount}`,
  );

  if (options.verbose) {
    console.log('');
    console.log(
      colorize(
        '  Note: Deprecation detection requires npm registry access and is not yet implemented.',
        'gray',
      ),
    );
  }

  console.log('');
}
