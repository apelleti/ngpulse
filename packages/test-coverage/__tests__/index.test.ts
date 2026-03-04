import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const MOCK_COVERAGE = {
  total: {
    lines: { total: 500, covered: 350, skipped: 0, pct: 70 },
    statements: { total: 600, covered: 420, skipped: 0, pct: 70 },
    functions: { total: 100, covered: 75, skipped: 0, pct: 75 },
    branches: { total: 80, covered: 50, skipped: 0, pct: 62.5 },
  },
  '/home/fixtures/src/app/app.component.ts': {
    lines: { total: 10, covered: 9, skipped: 0, pct: 90 },
    statements: { total: 12, covered: 11, skipped: 0, pct: 91.67 },
    functions: { total: 3, covered: 3, skipped: 0, pct: 100 },
    branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
  },
  '/home/fixtures/src/app/services/auth.service.ts': {
    lines: { total: 20, covered: 10, skipped: 0, pct: 50 },
    statements: { total: 25, covered: 12, skipped: 0, pct: 48 },
    functions: { total: 5, covered: 2, skipped: 0, pct: 40 },
    branches: { total: 6, covered: 3, skipped: 0, pct: 50 },
  },
};

describe('@ngtk/test-coverage', () => {
  let output: string[];
  let tmpWithCoverage: string;
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
    tmpWithCoverage = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-tc-cov-'));
    fs.mkdirSync(path.join(tmpWithCoverage, 'coverage'));
    fs.writeFileSync(
      path.join(tmpWithCoverage, 'coverage', 'coverage-summary.json'),
      JSON.stringify(MOCK_COVERAGE),
    );
  });

  afterEach(() => {
    console.log = originalLog;
    fs.rmSync(tmpWithCoverage, { recursive: true });
  });

  it('parses coverage-summary.json in JSON mode', async () => {
    await run({ root: tmpWithCoverage, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.source).toBe('coverage/coverage-summary.json');
    expect(data.files.length).toBeGreaterThan(0);
    expect(data.total.totalPercent).toBeDefined();
  });

  it('runs in text mode without error', async () => {
    await run({ root: tmpWithCoverage, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('shows helpful message when no coverage file exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-tc-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data.error).toBe('no_coverage_file');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('coverage values are numeric percentages', async () => {
    await run({ root: tmpWithCoverage, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(typeof data.total.totalPercent).toBe('number');
    expect(data.total.totalPercent).toBeGreaterThanOrEqual(0);
    expect(data.total.totalPercent).toBeLessThanOrEqual(100);
  });

  it('files array has per-file coverage data', async () => {
    await run({ root: tmpWithCoverage, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const first = data.files[0];
    expect(first.file).toBeDefined();
    expect(typeof first.lines).toBe('number');
    expect(typeof first.percent).toBe('number');
  });
});
