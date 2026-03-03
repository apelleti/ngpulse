import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import {
  type GlobalOptions,
  type DebtItem,
  scanFiles,
  readFileContent,
  createTable,
  colorize,
} from '@ngtk/shared';

const execFileAsync = promisify(execFile);

const SINGLE_LINE_RE = /\/\/\s*(TODO|FIXME|HACK)\b:?\s*(.*)/i;
const BLOCK_COMMENT_RE = /\/\*\s*(TODO|FIXME|HACK)\b:?\s*(.*?)\*\//i;

function formatAge(unixTimestamp: number): string {
  const now = Date.now();
  const then = unixTimestamp * 1000;
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;

  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) return '1 year ago';
  return `${diffYears} years ago`;
}

interface BlameLineInfo {
  age?: string;
  author?: string;
}

function parseBlameOutput(output: string): Map<number, BlameLineInfo> {
  const result = new Map<number, BlameLineInfo>();
  let currentLine: number | undefined;
  let author: string | undefined;
  let authorTime: number | undefined;

  for (const blameLine of output.split('\n')) {
    // Header line: <hash> <orig-line> <final-line> [<num-lines>]
    const headerMatch = blameLine.match(/^[0-9a-f]{40}\s+\d+\s+(\d+)/);
    if (headerMatch) {
      // Save previous entry
      if (currentLine !== undefined) {
        result.set(currentLine, {
          age: authorTime !== undefined ? formatAge(authorTime) : undefined,
          author: author === 'Not Committed Yet' ? undefined : author,
        });
      }
      currentLine = parseInt(headerMatch[1], 10);
      author = undefined;
      authorTime = undefined;
    }
    if (blameLine.startsWith('author ')) {
      author = blameLine.slice('author '.length).trim();
    }
    if (blameLine.startsWith('author-time ')) {
      authorTime = parseInt(blameLine.slice('author-time '.length), 10);
    }
  }

  // Save last entry
  if (currentLine !== undefined) {
    result.set(currentLine, {
      age: authorTime !== undefined ? formatAge(authorTime) : undefined,
      author: author === 'Not Committed Yet' ? undefined : author,
    });
  }
  return result;
}

async function getBlameInfoForFile(
  filePath: string,
): Promise<Map<number, BlameLineInfo>> {
  try {
    const { stdout } = await execFileAsync(
      'git', ['blame', '--porcelain', filePath],
      { encoding: 'utf-8', timeout: 15000 },
    );
    return parseBlameOutput(stdout);
  } catch {
    // Not in a git repo or file not tracked
    return new Map();
  }
}

function truncate(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1) + '\u2026';
}

function ageToTimestamp(age: string | undefined): number {
  if (!age) return Infinity;
  // Parse age string back to approximate days for sorting (oldest first = smallest timestamp)
  const match = age.match(/^(\d+)\s+(day|month|year)s?\s+ago$/);
  if (!match) {
    if (age === 'today') return 0;
    if (age === '1 day ago') return 1;
    if (age === '1 month ago') return 30;
    if (age === '1 year ago') return 365;
    return Infinity;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'day':
      return value;
    case 'month':
      return value * 30;
    case 'year':
      return value * 365;
    default:
      return Infinity;
  }
}

export async function run(options: GlobalOptions): Promise<void> {
  const tsFiles = await scanFiles(options.root, [
    '**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ]);

  // Phase 1: Find all debt entries per file
  const filesWithDebt: {
    filePath: string;
    entries: { lineNumber: number; type: DebtItem['type']; message: string }[];
  }[] = [];

  for (const filePath of tsFiles) {
    let content: string;
    try {
      content = await readFileContent(filePath);
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const debtEntries: { lineNumber: number; type: DebtItem['type']; message: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      let match = SINGLE_LINE_RE.exec(line);
      if (!match) {
        match = BLOCK_COMMENT_RE.exec(line);
      }

      if (match) {
        const type = match[1].toUpperCase() as DebtItem['type'];
        const message = match[2].trim();
        debtEntries.push({ lineNumber, type, message });
      }
    }

    if (debtEntries.length > 0) {
      filesWithDebt.push({ filePath, entries: debtEntries });
    }
  }

  // Phase 2: Parallel git blame for all files with debt
  const blameMaps = await Promise.all(
    filesWithDebt.map(({ filePath }) => getBlameInfoForFile(filePath)),
  );

  // Phase 3: Merge debt entries with blame info
  const items: DebtItem[] = [];
  for (let i = 0; i < filesWithDebt.length; i++) {
    const { filePath, entries } = filesWithDebt[i];
    const blameMap = blameMaps[i];
    const relativePath = path.relative(options.root, filePath);

    for (const entry of entries) {
      const blame = blameMap.get(entry.lineNumber) ?? {};
      items.push({
        type: entry.type,
        message: entry.message,
        file: relativePath,
        line: entry.lineNumber,
        age: blame.age,
        author: blame.author,
      });
    }
  }

  // Sort by age: oldest first, undefined last
  items.sort((a, b) => {
    const aDays = ageToTimestamp(a.age);
    const bDays = ageToTimestamp(b.age);
    // Oldest first means highest day count first (descending), but Infinity goes last
    if (aDays === Infinity && bDays === Infinity) return 0;
    if (aDays === Infinity) return 1;
    if (bDays === Infinity) return -1;
    return bDays - aDays;
  });

  if (options.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log(colorize('No TODO/FIXME/HACK comments found.', 'green'));
    return;
  }

  const typeColors: Record<string, 'yellow' | 'red' | 'magenta'> = {
    TODO: 'yellow',
    FIXME: 'red',
    HACK: 'magenta',
  };

  const rows: string[][] = items.map((item: DebtItem) => [
    colorize(item.type, typeColors[item.type]),
    item.age ?? '\u2014',
    item.author ?? '\u2014',
    truncate(item.message, 50),
    `${item.file}:${item.line}`,
  ]);

  const table = createTable(
    ['Type', 'Age', 'Author', 'Message', 'Location'],
    rows,
  );
  console.log(table);

  // Summary counts
  const todoCount = items.filter((i) => i.type === 'TODO').length;
  const fixmeCount = items.filter((i) => i.type === 'FIXME').length;
  const hackCount = items.filter((i) => i.type === 'HACK').length;

  console.log('');
  console.log(
    `${items.length} debt items: ` +
      `${colorize(`${todoCount} TODO`, 'yellow')}, ` +
      `${colorize(`${fixmeCount} FIXME`, 'red')}, ` +
      `${colorize(`${hackCount} HACK`, 'magenta')}`,
  );
}
