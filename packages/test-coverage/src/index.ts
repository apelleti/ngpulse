import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GlobalOptions } from '@ngpulse/shared';
import { colorize, createTable, boxDraw } from '@ngpulse/shared';

interface FileCoverage {
  file: string;
  lines: number;
  coveredLines: number;
  percent: number;
}

function parseLcov(content: string, root: string): FileCoverage[] {
  const results: FileCoverage[] = [];
  let currentFile = '';
  let lines = 0;
  let covered = 0;

  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      currentFile = path.relative(root, line.slice(3).trim());
      lines = 0;
      covered = 0;
    } else if (line.startsWith('DA:')) {
      const parts = line.slice(3).split(',');
      if (parts.length >= 2) {
        lines++;
        if (parseInt(parts[1], 10) > 0) covered++;
      }
    } else if (line.startsWith('end_of_record')) {
      if (currentFile) {
        results.push({
          file: currentFile,
          lines,
          coveredLines: covered,
          percent: lines > 0 ? Math.round((covered / lines) * 100) : 0,
        });
      }
    }
  }

  return results;
}

function parseCoverageSummary(
  content: string,
  root: string,
): FileCoverage[] {
  interface SummaryEntry {
    lines?: { total: number; covered: number; pct: number };
  }
  let data: Record<string, SummaryEntry>;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }

  const results: FileCoverage[] = [];
  for (const [filePath, entry] of Object.entries(data)) {
    if (filePath === 'total' || !entry.lines) continue;
    results.push({
      file: path.relative(root, filePath),
      lines: entry.lines.total,
      coveredLines: entry.lines.covered,
      percent: Math.round(entry.lines.pct),
    });
  }

  return results;
}

function coverageColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'yellow';
  return 'red';
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode } = options;

  const candidates = [
    { file: 'coverage/lcov.info', parser: 'lcov' as const },
    { file: 'coverage/coverage-summary.json', parser: 'json' as const },
  ];

  let results: FileCoverage[] = [];
  let foundFile = '';

  for (const { file, parser } of candidates) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      foundFile = file;
      results =
        parser === 'lcov' ? parseLcov(content, root) : parseCoverageSummary(content, root);
      break;
    }
  }

  if (!foundFile) {
    const message =
      'No coverage report found. Generate one with:\n  ng test --code-coverage\n\nLook for coverage/lcov.info or coverage/coverage-summary.json';
    if (jsonMode) {
      console.log(JSON.stringify({ error: 'no_coverage_file', message }));
    } else {
      console.log(colorize(message, 'yellow'));
    }
    return;
  }

  results.sort((a, b) => a.percent - b.percent);

  const totalLines = results.reduce((s, r) => s + r.lines, 0);
  const totalCovered = results.reduce((s, r) => s + r.coveredLines, 0);
  const totalPercent = totalLines > 0 ? Math.round((totalCovered / totalLines) * 100) : 0;

  if (jsonMode) {
    console.log(
      JSON.stringify({ source: foundFile, files: results, total: { totalLines, totalCovered, totalPercent } }),
    );
    return;
  }

  console.log(
    createTable(
      ['File', 'Lines', 'Covered', '%'],
      results.map((r) => [
        r.file,
        String(r.lines),
        String(r.coveredLines),
        colorize(`${r.percent}%`, coverageColor(r.percent)),
      ]),
    ),
  );

  console.log(
    boxDraw('Coverage Summary', [
      `Source: ${foundFile}`,
      `Files:  ${results.length}`,
      `Total:  ${colorize(`${totalPercent}%`, coverageColor(totalPercent))} (${totalCovered}/${totalLines} lines)`,
    ]),
  );
}
