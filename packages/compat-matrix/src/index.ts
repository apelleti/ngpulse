import * as path from 'node:path';
import {
  type GlobalOptions,
  type CompatEntry,
  readFileContent,
  readVersionFromDeps,
  createTable,
  colorize,
} from '@ngpulse/shared';

interface VersionRange {
  min: number[];
  max: number[];
}

interface CompatRule {
  typescript: VersionRange;
  rxjs: VersionRange;
  node: VersionRange;
}

// Known buggy patch versions per Angular major
const BUGGY_PATCHES: Record<number, string[]> = {
  17: ['17.0.0', '17.0.1'],
  18: ['18.0.0'],
  21: ['21.0.0'],
};

const COMPAT_MATRIX: Record<number, CompatRule> = {
  15: {
    typescript: { min: [4, 8], max: [4, 9] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [14, 20], max: [18, 99] },
  },
  16: {
    typescript: { min: [4, 9], max: [5, 1] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [16, 14], max: [20, 99] },
  },
  17: {
    typescript: { min: [5, 2], max: [5, 4] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [18, 13], max: [22, 99] },
  },
  18: {
    typescript: { min: [5, 4], max: [5, 6] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [18, 19], max: [22, 99] },
  },
  19: {
    typescript: { min: [5, 5], max: [5, 7] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [18, 19], max: [22, 99] },
  },
  20: {
    typescript: { min: [5, 7], max: [5, 8] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [18, 19], max: [22, 99] },
  },
  21: {
    typescript: { min: [5, 7], max: [5, 9] },
    rxjs: { min: [7, 4], max: [7, 99] },
    node: { min: [18, 19], max: [22, 99] },
  },
};

function parseVersion(version: string): number[] {
  const cleaned = version.replace(/^[~^>=<\s]+/, '');
  const parts = cleaned.split('.').map((p) => parseInt(p, 10));
  return parts.filter((n) => !isNaN(n));
}

function getMajor(version: string): number {
  const parts = parseVersion(version);
  return parts[0] ?? 0;
}

function isInRange(version: string, range: VersionRange): boolean {
  const parts = parseVersion(version);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;

  const aboveMin =
    major > range.min[0] ||
    (major === range.min[0] && minor >= range.min[1]);
  const belowMax =
    major < range.max[0] ||
    (major === range.max[0] && minor <= range.max[1]);

  return aboveMin && belowMax;
}

function formatRange(range: VersionRange): string {
  return `${range.min[0]}.${range.min[1]} - ${range.max[0]}.${range.max[1]}`;
}

export async function run(options: GlobalOptions): Promise<void> {
  const pkgPath = path.join(options.root, 'package.json');
  const pkgContent = await readFileContent(pkgPath);
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgContent);
  } catch {
    throw new Error(`Invalid JSON in ${pkgPath}`);
  }

  const versions: Record<string, string> = {
    '@angular/core': readVersionFromDeps(pkg, '@angular/core'),
    typescript: readVersionFromDeps(pkg, 'typescript'),
    rxjs: readVersionFromDeps(pkg, 'rxjs'),
    'zone.js': readVersionFromDeps(pkg, 'zone.js'),
    '@angular/cli': readVersionFromDeps(pkg, '@angular/cli'),
  };

  if (versions['@angular/core'] === 'not found') {
    if (options.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log(colorize('No @angular/core found in package.json.', 'yellow'));
    }
    return;
  }

  const angularMajor = getMajor(versions['@angular/core']);
  if (options.verbose) console.error(`Detected Angular v${angularMajor}, checking compatibility...`);
  const rule = COMPAT_MATRIX[angularMajor];

  const entries: CompatEntry[] = [];

  if (!rule) {
    // Unknown Angular version — report all as unknown
    for (const [name, version] of Object.entries(versions)) {
      entries.push({
        package: name,
        currentVersion: version,
        compatible: version !== 'not found',
      });
    }
  } else {
    // Angular/core itself is always "compatible" with its own matrix entry
    entries.push({
      package: '@angular/core',
      currentVersion: versions['@angular/core'],
      compatible: true,
    });

    // TypeScript check
    const tsCompatible = isInRange(versions['typescript'], rule.typescript);
    entries.push({
      package: 'typescript',
      currentVersion: versions['typescript'],
      compatible: tsCompatible,
      recommended: tsCompatible
        ? undefined
        : formatRange(rule.typescript),
    });

    // RxJS check
    const rxjsCompatible = isInRange(versions['rxjs'], rule.rxjs);
    entries.push({
      package: 'rxjs',
      currentVersion: versions['rxjs'],
      compatible: rxjsCompatible,
      recommended: rxjsCompatible
        ? undefined
        : formatRange(rule.rxjs),
    });

    // zone.js — report version without strict range checking
    entries.push({
      package: 'zone.js',
      currentVersion: versions['zone.js'],
      compatible: versions['zone.js'] !== 'not found',
    });

    // @angular/cli — should match @angular/core major version
    const cliMajor = getMajor(versions['@angular/cli']);
    const cliCompatible =
      versions['@angular/cli'] !== 'not found' &&
      cliMajor === angularMajor;
    entries.push({
      package: '@angular/cli',
      currentVersion: versions['@angular/cli'],
      compatible: cliCompatible,
      recommended: cliCompatible
        ? undefined
        : `^${angularMajor}.0.0`,
    });

    // Node.js runtime check
    const nodeVersion = process.version.replace(/^v/, '');
    const nodeCompatible = isInRange(nodeVersion, rule.node);
    entries.push({
      package: 'node',
      currentVersion: nodeVersion,
      compatible: nodeCompatible,
      recommended: nodeCompatible
        ? undefined
        : formatRange(rule.node),
    });
  }

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  // Header: current stack versions
  console.log('');
  console.log(colorize(`Angular Stack — v${angularMajor} detected`, 'cyan'));
  console.log('');
  for (const [name, version] of Object.entries(versions)) {
    console.log(`  ${colorize(name + ':', 'white')} ${version}`);
  }
  console.log(`  ${colorize('node:', 'white')} ${process.version}`);
  console.log('');

  // Compatibility table
  const rows: string[][] = entries.map((e: CompatEntry) => [
    e.package,
    e.currentVersion,
    e.compatible ? colorize('✓', 'green') : colorize('✗', 'red'),
    e.recommended ?? '—',
  ]);

  const table = createTable(
    ['Package', 'Current', 'Compatible', 'Recommended'],
    rows,
  );
  console.log(table);

  // Check for known buggy patch versions
  const angularRaw = versions['@angular/core'].replace(/^[~^>=<\s]+/, '');
  const buggyList = BUGGY_PATCHES[angularMajor];
  if (buggyList && buggyList.includes(angularRaw)) {
    console.log('');
    console.log(
      colorize(
        `⚠ ${angularRaw} is a known buggy patch version. Consider upgrading to the latest patch.`,
        'yellow',
      ),
    );
  }

  const incompatible = entries.filter((e: CompatEntry) => !e.compatible);
  if (incompatible.length > 0) {
    console.log('');
    console.log(
      colorize(
        `⚠ ${incompatible.length} incompatible package(s) detected.`,
        'yellow',
      ),
    );
    for (const entry of incompatible) {
      if (entry.recommended) {
        console.log(
          `  ${colorize('→', 'yellow')} ${entry.package}: upgrade to ${colorize(entry.recommended, 'green')}`,
        );
      }
    }
    console.log('');
    console.log(
      `Run ${colorize('ng update', 'cyan')} to migrate Angular packages to compatible versions.`,
    );
  }
}
