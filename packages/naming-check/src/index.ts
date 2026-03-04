import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface NamingViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

interface FileCheck {
  suffix: string;
  classSuffix: string;
  classRe: RegExp;
  type: string;
}

const FILE_CHECKS: FileCheck[] = [
  { suffix: '.component.ts', classSuffix: 'Component', classRe: /class\s+(\w+)/, type: 'Component' },
  { suffix: '.service.ts', classSuffix: 'Service', classRe: /class\s+(\w+)/, type: 'Service' },
  { suffix: '.pipe.ts', classSuffix: 'Pipe', classRe: /class\s+(\w+)/, type: 'Pipe' },
  { suffix: '.directive.ts', classSuffix: 'Directive', classRe: /class\s+(\w+)/, type: 'Directive' },
  { suffix: '.guard.ts', classSuffix: 'Guard', classRe: /class\s+(\w+)/, type: 'Guard' },
];

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

  const violations: NamingViolation[] = [];

  // First pass: collect selectors to detect common prefix
  const selectors: string[] = [];
  for (const file of tsFiles) {
    if (!file.endsWith('.component.ts')) continue;
    const content = await readFileContent(file);
    const selectorMatch = content.match(/selector\s*:\s*['"`]([^'"`]+)['"`]/);
    if (selectorMatch) selectors.push(selectorMatch[1]);
  }
  const expectedPrefix = detectPrefix(selectors);

  // Second pass: check all files
  for (const file of tsFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const lines = content.split('\n');

    // Check class naming conventions
    for (const check of FILE_CHECKS) {
      if (!file.endsWith(check.suffix)) continue;

      for (let i = 0; i < lines.length; i++) {
        const classMatch = lines[i].match(check.classRe);
        if (classMatch) {
          const className = classMatch[1];
          if (!className.endsWith(check.classSuffix)) {
            violations.push({
              file: relPath,
              line: i + 1,
              rule: 'class-suffix',
              message: `Class "${className}" in ${check.suffix} file should end with "${check.classSuffix}"`,
            });
          }
        }
      }
    }

    // Check component selector prefix
    if (file.endsWith('.component.ts')) {
      const selectorMatch = content.match(/selector\s*:\s*['"`]([^'"`]+)['"`]/);
      if (selectorMatch) {
        const selector = selectorMatch[1];
        if (!selector.startsWith(`${expectedPrefix}-`)) {
          const line =
            lines.findIndex((l) => l.includes(selectorMatch[0])) + 1;
          violations.push({
            file: relPath,
            line,
            rule: 'selector-prefix',
            message: `Selector "${selector}" should start with "${expectedPrefix}-"`,
          });
        }
      }
    }

    // Check file naming: .component.ts should exist for classes with @Component
    if (!FILE_CHECKS.some((c) => file.endsWith(c.suffix))) {
      if (/@Component\s*\(/.test(content)) {
        violations.push({
          file: relPath,
          line: 1,
          rule: 'file-suffix',
          message: 'File with @Component should be named *.component.ts',
        });
      }
      const baseName = path.basename(file);
      if (
        /@Injectable\s*\(/.test(content) &&
        !baseName.includes('guard') &&
        !baseName.includes('interceptor') &&
        !/implements\s+CanActivate/.test(content) &&
        !/implements\s+CanActivateFn/.test(content) &&
        !content.includes('HTTP_INTERCEPTORS') &&
        !/implements\s+HttpInterceptor/.test(content)
      ) {
        violations.push({
          file: relPath,
          line: 1,
          rule: 'file-suffix',
          message: 'File with @Injectable should be named *.service.ts',
        });
      }
    }

    // Check kebab-case for Angular artifact files
    const baseName = path.basename(file);
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
