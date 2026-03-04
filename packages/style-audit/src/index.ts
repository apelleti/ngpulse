import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface StyleIssue {
  file: string;
  line: number;
  type: 'ng-deep' | 'important' | 'no-host' | 'large-file';
  message: string;
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode } = options;

  const styleFiles = await scanFiles(root, ['**/*.scss', '**/*.css']);
  const issues: StyleIssue[] = [];

  for (const file of styleFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const lines = content.split('\n');

    // Check for ::ng-deep
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('::ng-deep')) {
        issues.push({
          file: relPath,
          line: i + 1,
          type: 'ng-deep',
          message: '::ng-deep is deprecated',
        });
      }
    }

    // Check for !important
    for (let i = 0; i < lines.length; i++) {
      if (/!important/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
        issues.push({
          file: relPath,
          line: i + 1,
          type: 'important',
          message: '!important usage',
        });
      }
    }

    // Check for styles outside :host (only in component styles)
    if (file.includes('.component.')) {
      const hasHost = content.includes(':host');
      const hasRules = /^\s*[.#\w[*].*\{/m.test(content);
      if (hasRules && !hasHost) {
        issues.push({
          file: relPath,
          line: 1,
          type: 'no-host',
          message: 'Styles without :host scope may leak to child components',
        });
      }
    }

    // Check for large files
    if (lines.length > 200) {
      issues.push({
        file: relPath,
        line: 1,
        type: 'large-file',
        message: `Large style file (${lines.length} lines)`,
      });
    }
  }

  issues.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const ngDeepCount = issues.filter((i) => i.type === 'ng-deep').length;
  const importantCount = issues.filter((i) => i.type === 'important').length;
  const noHostCount = issues.filter((i) => i.type === 'no-host').length;
  const largeCount = issues.filter((i) => i.type === 'large-file').length;

  if (jsonMode) {
    console.log(
      JSON.stringify({
        issues,
        summary: { ngDeep: ngDeepCount, important: importantCount, noHost: noHostCount, largeFiles: largeCount },
      }),
    );
    return;
  }

  if (issues.length === 0) {
    console.log(colorize('No style issues found \u2713', 'green'));
    return;
  }

  const typeColors: Record<string, 'red' | 'yellow' | 'cyan' | 'magenta'> = {
    'ng-deep': 'red',
    important: 'yellow',
    'no-host': 'cyan',
    'large-file': 'magenta',
  };

  console.log(
    createTable(
      ['File', 'Line', 'Type', 'Message'],
      issues.map((i) => [
        i.file,
        String(i.line),
        colorize(i.type, typeColors[i.type]),
        i.message,
      ]),
    ),
  );

  console.log(
    boxDraw(null, [
      `${colorize(String(ngDeepCount), 'red')} ::ng-deep  ${colorize(String(importantCount), 'yellow')} !important`,
      `${colorize(String(noHostCount), 'cyan')} no :host   ${colorize(String(largeCount), 'magenta')} large files`,
      `${issues.length} total issues`,
    ]),
  );
}
