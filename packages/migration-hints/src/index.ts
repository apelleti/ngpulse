import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface MigrationHint {
  file: string;
  line: number;
  priority: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'cyan'> = {
  high: 'red',
  medium: 'yellow',
  low: 'cyan',
};

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode, more } = options;

  const tsFiles = await scanFiles(root, ['**/*.ts']);
  const sourceFiles = tsFiles.filter(
    (f) => !f.endsWith('.spec.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
  );

  const hints: MigrationHint[] = [];

  for (const file of sourceFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // HIGH: NgModule components that could be standalone
      if (/@NgModule\s*\(/.test(line)) {
        const blockContent = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
        if (/declarations\s*:\s*\[/.test(blockContent)) {
          hints.push({
            file: relPath,
            line: lineNum,
            priority: 'high',
            message: 'NgModule with declarations could use standalone components',
            suggestion: 'Convert declared components to standalone and remove NgModule',
          });
        }
      }

      // HIGH: HttpClientModule usage
      if (/HttpClientModule/.test(line) && /import/.test(line)) {
        hints.push({
          file: relPath,
          line: lineNum,
          priority: 'high',
          message: 'HttpClientModule is legacy',
          suggestion: 'Replace with provideHttpClient() in providers',
        });
      }

      // MEDIUM: constructor injection
      if (/constructor\s*\(/.test(line)) {
        const ctorBlock = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        const injections = ctorBlock.match(
          /(?:private|protected|public|readonly)\s+\w+\s*:\s*\w+/g,
        );
        if (injections && injections.length > 0) {
          hints.push({
            file: relPath,
            line: lineNum,
            priority: 'medium',
            message: `Constructor injection (${injections.length} param${injections.length > 1 ? 's' : ''})`,
            suggestion: 'Migrate to inject() function',
          });
        }
      }

    }

    // MEDIUM: @Input() / @Output() decorators — group per file
    const inputCount = (content.match(/@Input\(\)/g) || []).length;
    const outputCount = (content.match(/@Output\(\)/g) || []).length;
    if (inputCount > 0 || outputCount > 0) {
      const parts: string[] = [];
      if (inputCount > 0) parts.push(`${inputCount} @Input()`);
      if (outputCount > 0) parts.push(`${outputCount} @Output()`);
      hints.push({
        file: relPath,
        line: 1,
        priority: 'medium',
        message: `${parts.join(' / ')} decorator${inputCount + outputCount > 1 ? 's' : ''} found`,
        suggestion: 'Migrate to input()/output() signal functions',
      });
    }
  }

  // Also scan HTML for ngModel usage
  const htmlFiles = await scanFiles(root, ['**/*.component.html']);
  for (const file of htmlFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (/\[\(ngModel\)\]/.test(lines[i])) {
        hints.push({
          file: relPath,
          line: i + 1,
          priority: 'low',
          message: 'ngModel usage — ensure FormsModule is imported',
          suggestion: 'Verify FormsModule import or migrate to reactive forms',
        });
      }
    }
  }

  // Deduplicate: keep only first occurrence of each (file, message) pair
  const seenHints = new Set<string>();
  const dedupedHints: MigrationHint[] = [];
  for (const hint of hints) {
    const key = `${hint.file}::${hint.message}`;
    if (!seenHints.has(key)) {
      seenHints.add(key);
      dedupedHints.push(hint);
    }
  }
  hints.length = 0;
  hints.push(...dedupedHints);

  hints.sort((a, b) => {
    const pri = { high: 0, medium: 1, low: 2 };
    return pri[a.priority] - pri[b.priority] || a.file.localeCompare(b.file);
  });

  if (jsonMode) {
    console.log(JSON.stringify(hints));
    return;
  }

  if (hints.length === 0) {
    console.log(colorize('No migration hints found — project is up to date \u2713', 'green'));
    return;
  }

  const headers = more
    ? ['Priority', 'File', 'Line', 'Message', 'Suggestion']
    : ['Priority', 'File', 'Line', 'Message'];

  const rows = hints.map((h) => {
    const row = [
      colorize(h.priority.toUpperCase(), PRIORITY_COLORS[h.priority]),
      h.file,
      String(h.line),
      h.message,
    ];
    if (more) row.push(h.suggestion);
    return row;
  });

  console.log(createTable(headers, rows));

  const high = hints.filter((h) => h.priority === 'high').length;
  const medium = hints.filter((h) => h.priority === 'medium').length;
  const low = hints.filter((h) => h.priority === 'low').length;

  console.log(
    boxDraw(null, [
      `${colorize(String(high), 'red')} high  ${colorize(String(medium), 'yellow')} medium  ${colorize(String(low), 'cyan')} low`,
      `${hints.length} total migration opportunities`,
    ]),
  );
}
