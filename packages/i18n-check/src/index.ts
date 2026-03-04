import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface I18nIssue {
  file: string;
  line: number;
  text: string;
  type: 'missing-i18n' | 'missing-i18n-attr';
}

const TECHNICAL_ATTRS = new Set([
  'class', 'id', 'style', 'href', 'src', 'routerlink', 'routerlinkactive',
  'ngclass', 'ngstyle', 'ngif', 'ngfor', 'ngswitch', 'ngswitchcase',
  'formcontrolname', 'formgroupname', 'name', 'type', 'role', 'tabindex',
  'data-testid', 'hidden', 'disabled', 'readonly',
]);

const INTERPOLATION_ONLY_RE = /^\s*(\{\{[^}]*\}\}\s*)+$/;

function isHumanReadable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (INTERPOLATION_ONLY_RE.test(trimmed)) return false;
  if (trimmed.length < 2) return false;
  return (trimmed.match(/[a-zA-Z]/g) || []).length >= 2;
}

function normalizeMultiLineTags(content: string): string {
  // Pre-pass: join lines that are continuations of an open tag
  // A line is a continuation if the previous line has an unclosed < tag
  const lines = content.split('\n');
  const normalized: string[] = [];
  let pending = '';

  for (const line of lines) {
    pending += (pending ? ' ' : '') + line;
    // Count unmatched < and > to determine if tag is still open
    const opens = (pending.match(/</g) || []).length;
    const closes = (pending.match(/>/g) || []).length;
    if (opens <= closes) {
      normalized.push(pending);
      pending = '';
    }
  }
  if (pending) normalized.push(pending);

  return normalized.join('\n');
}

function analyzeTemplate(content: string, filePath: string, root: string): I18nIssue[] {
  const issues: I18nIssue[] = [];
  const relPath = path.relative(root, filePath);

  // Normalize multi-line tags so attributes spanning multiple lines are on one line
  const normalizedContent = normalizeMultiLineTags(content);
  const lines = normalizedContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for text content between tags that lacks i18n
    const textMatch = line.match(/>([^<]+)</);
    if (textMatch) {
      const text = textMatch[1].trim();
      if (isHumanReadable(text)) {
        // Check if the opening tag has i18n attribute (wider window: N-3 to N)
        const prevContent = lines.slice(Math.max(0, i - 3), i + 1).join(' ');
        if (!/ i18n[=> \t]/.test(prevContent) && !/ i18n"/.test(prevContent)) {
          issues.push({ file: relPath, line: lineNum, text, type: 'missing-i18n' });
        }
      }
    }

    // Check for attributes with human-readable text that lack i18n-*
    const attrMatches = line.matchAll(/(\w[\w-]*)\s*=\s*"([^"]+)"/g);
    for (const m of attrMatches) {
      const attr = m[1].toLowerCase();
      if (TECHNICAL_ATTRS.has(attr)) continue;
      if (attr.startsWith('i18n') || attr.startsWith('[') || attr.startsWith('(')) continue;
      if (attr.startsWith('ng') || attr.startsWith('*ng')) continue;

      const value = m[2];
      if (
        (attr === 'placeholder' || attr === 'title' || attr === 'alt' || attr === 'label' || attr === 'aria-label') &&
        isHumanReadable(value)
      ) {
        const i18nAttr = `i18n-${attr}`;
        if (!line.includes(i18nAttr)) {
          issues.push({ file: relPath, line: lineNum, text: `${attr}="${value}"`, type: 'missing-i18n-attr' });
        }
      }
    }
  }

  return issues;
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode } = options;

  const htmlFiles = await scanFiles(root, ['**/*.component.html', '**/*.html']);
  const allIssues: I18nIssue[] = [];

  for (const file of htmlFiles) {
    const content = await readFileContent(file);
    allIssues.push(...analyzeTemplate(content, file, root));
  }

  allIssues.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (jsonMode) {
    console.log(JSON.stringify(allIssues));
    return;
  }

  if (allIssues.length === 0) {
    console.log(colorize('All text nodes have i18n markers \u2713', 'green'));
    return;
  }

  const rows = allIssues.map((issue) => [
    issue.file,
    String(issue.line),
    issue.type === 'missing-i18n' ? colorize('text', 'yellow') : colorize('attr', 'cyan'),
    issue.text.length > 40 ? issue.text.slice(0, 37) + '...' : issue.text,
  ]);

  console.log(createTable(['File', 'Line', 'Type', 'Text'], rows));
  console.log(
    boxDraw(null, [
      `${colorize(String(allIssues.length), 'yellow')} missing i18n markers in ${new Set(allIssues.map((i) => i.file)).size} files`,
    ]),
  );
}
