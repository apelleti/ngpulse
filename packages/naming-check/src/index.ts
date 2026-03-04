import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GlobalOptions } from '@ngpulse/shared';
import {
  scanFiles,
  readFileContent,
  colorize,
  createTable,
  boxDraw,
  createProject,
  addSourceFiles,
  getClasses,
  getDecorator,
  getDecoratorProp,
} from '@ngpulse/shared';

interface NamingViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

interface DecoratorCheck {
  decorator: string;
  classSuffix: string;
}

const DECORATOR_CHECKS: DecoratorCheck[] = [
  { decorator: 'Component', classSuffix: 'Component' },
  { decorator: 'Injectable', classSuffix: 'Service' },
  { decorator: 'Pipe', classSuffix: 'Pipe' },
  { decorator: 'Directive', classSuffix: 'Directive' },
  { decorator: 'NgModule', classSuffix: 'Module' },
];

const FILE_SUFFIX_MAP: Record<string, string> = {
  Component: '.component.ts',
  Injectable: '.service.ts',
};

async function readPrefixFromAngularJson(root: string): Promise<string | null> {
  const angularJsonPath = path.join(root, 'angular.json');
  if (!fs.existsSync(angularJsonPath)) return null;
  try {
    const json = JSON.parse(await readFileContent(angularJsonPath));
    for (const proj of Object.values(json.projects || {}) as Record<string, unknown>[]) {
      const prefix = (proj as { prefix?: string }).prefix;
      if (prefix && typeof prefix === 'string') return prefix;
      const schematicsPrefix = (proj as { schematics?: Record<string, Record<string, string>> })
        ?.schematics?.['@schematics/angular:component']?.prefix;
      if (schematicsPrefix) return schematicsPrefix;
    }
  } catch { /* ignore */ }
  return null;
}

function detectPrefix(selectors: string[]): string {
  if (selectors.length === 0) return 'app';
  const prefixes = new Map<string, number>();
  for (const sel of selectors) {
    const parts = sel.split('-');
    if (parts.length >= 2) {
      const prefix = parts[0];
      prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
    }
  }
  let bestPrefix = 'app';
  let bestCount = 0;
  for (const [prefix, count] of prefixes) {
    if (count > bestCount) {
      bestPrefix = prefix;
      bestCount = count;
    }
  }
  return bestPrefix;
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode } = options;

  const allTsFiles = await scanFiles(root, ['**/*.ts']);
  const tsFiles = allTsFiles.filter(
    (f) => !f.endsWith('.spec.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
  );

  const project = createProject();
  const sfList = addSourceFiles(project, tsFiles);
  const violations: NamingViolation[] = [];

  // Try to read prefix from angular.json first, then fall back to inference
  const angularJsonPrefix = await readPrefixFromAngularJson(root);

  // First pass: collect selectors from @Component classes to detect common prefix
  const selectors: string[] = [];
  for (const sf of sfList) {
    for (const cls of getClasses(sf)) {
      const compDec = getDecorator(cls, 'Component');
      if (!compDec) continue;
      const selectorVal = getDecoratorProp(compDec, 'selector');
      if (selectorVal) {
        selectors.push(selectorVal.replace(/^['"`]|['"`]$/g, ''));
      }
    }
  }
  const expectedPrefix = angularJsonPrefix ?? detectPrefix(selectors);

  // Second pass: check all files
  for (const sf of sfList) {
    const filePath = sf.getFilePath();
    const relPath = path.relative(root, filePath);
    const baseName = path.basename(filePath);

    for (const cls of getClasses(sf)) {
      const className = cls.getName() || '';

      // Check class suffix conventions based on decorators
      for (const check of DECORATOR_CHECKS) {
        const dec = getDecorator(cls, check.decorator);
        if (!dec) continue;

        // For @Injectable, skip guards and interceptors
        if (check.decorator === 'Injectable') {
          if (baseName.includes('guard') || baseName.includes('interceptor')) continue;
          // Check if it implements guard/interceptor interfaces
          const clsText = cls.getText();
          if (/implements\s+(?:CanActivate|CanActivateFn|HttpInterceptor)/.test(clsText)) continue;
          if (clsText.includes('HTTP_INTERCEPTORS')) continue;
        }

        if (!className.endsWith(check.classSuffix)) {
          // For file-suffix checks on specific suffixes
          const expectedSuffix = FILE_SUFFIX_MAP[check.decorator];
          if (expectedSuffix && !filePath.endsWith(expectedSuffix.replace('.ts', '').replace('.', '') + '.ts')) {
            // This is a file-suffix violation (e.g. @Component in non-.component.ts file)
          }

          violations.push({
            file: relPath,
            line: cls.getStartLineNumber(),
            rule: 'class-suffix',
            message: `Class "${className}" with @${check.decorator} should end with "${check.classSuffix}"`,
          });
        }
      }

      // Check component selector prefix
      const compDec = getDecorator(cls, 'Component');
      if (compDec) {
        const selectorVal = getDecoratorProp(compDec, 'selector');
        if (selectorVal) {
          const selector = selectorVal.replace(/^['"`]|['"`]$/g, '');
          if (!selector.startsWith(`${expectedPrefix}-`)) {
            violations.push({
              file: relPath,
              line: compDec.getStartLineNumber(),
              rule: 'selector-prefix',
              message: `Selector "${selector}" should start with "${expectedPrefix}-"`,
            });
          }
        }
      }
    }

    // Check file-suffix: @Component not in .component.ts, @Injectable not in .service.ts
    const isKnownSuffix = ['.component.ts', '.service.ts', '.pipe.ts', '.directive.ts', '.guard.ts'].some(s => filePath.endsWith(s));
    if (!isKnownSuffix) {
      for (const cls of getClasses(sf)) {
        if (getDecorator(cls, 'Component')) {
          violations.push({
            file: relPath,
            line: 1,
            rule: 'file-suffix',
            message: 'File with @Component should be named *.component.ts',
          });
        }
        if (getDecorator(cls, 'Injectable')) {
          if (!baseName.includes('guard') && !baseName.includes('interceptor')) {
            const clsText = cls.getText();
            if (!/implements\s+(?:CanActivate|CanActivateFn|HttpInterceptor)/.test(clsText) && !clsText.includes('HTTP_INTERCEPTORS')) {
              violations.push({
                file: relPath,
                line: 1,
                rule: 'file-suffix',
                message: 'File with @Injectable should be named *.service.ts',
              });
            }
          }
        }
      }
    }

    // Check kebab-case for file names (keep regex — appropriate for filenames)
    const nameWithoutExt = baseName.replace(/\.(component|service|pipe|directive|guard|module)\.ts$/, '').replace(/\.ts$/, '');
    if (/[A-Z]/.test(nameWithoutExt) || /_/.test(nameWithoutExt)) {
      violations.push({
        file: relPath,
        line: 1,
        rule: 'kebab-case',
        message: `Filename "${baseName}" should use kebab-case (e.g. "${nameWithoutExt.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.ts")`,
      });
    }
  }

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (jsonMode) {
    console.log(JSON.stringify(violations));
    return;
  }

  if (violations.length === 0) {
    console.log(colorize('All naming conventions are followed \u2713', 'green'));
    return;
  }

  console.log(
    createTable(
      ['File', 'Line', 'Rule', 'Message'],
      violations.map((v) => [
        v.file,
        String(v.line),
        colorize(v.rule, 'yellow'),
        v.message,
      ]),
    ),
  );

  console.log(
    boxDraw(null, [
      `${colorize(String(violations.length), 'yellow')} violation${violations.length !== 1 ? 's' : ''} found`,
      `Expected selector prefix: ${colorize(expectedPrefix + '-', 'cyan')}`,
    ]),
  );
}
