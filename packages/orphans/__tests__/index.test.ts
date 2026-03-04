import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/orphans', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and detects orphan.ts', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    const orphanPaths = data.map((o: any) => o.filePath);
    expect(orphanPaths.some((p: string) => p.includes('orphan.ts'))).toBe(true);

    for (const orphan of data) {
      expect(orphan.size).toBeGreaterThanOrEqual(0);
      expect(orphan.extension).toBeTruthy();
    }
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty array for a project with no .ts files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-orphans-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('does not report index.ts as orphan (excluded by convention)', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const orphanPaths = data.map((o: any) => o.filePath);
    expect(orphanPaths.every((p: string) => !p.endsWith('/index.ts'))).toBe(true);
  });

  it('does not report spec/test files as orphans', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const orphanPaths = data.map((o: any) => o.filePath);
    expect(orphanPaths.every((p: string) => !p.endsWith('.spec.ts') && !p.endsWith('.test.ts'))).toBe(true);
  });

  it('does not report environment files as orphans', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const orphanPaths = data.map((o: any) => o.filePath);
    expect(orphanPaths.every((p: string) => !p.includes('/environments/'))).toBe(true);
  });

  it('does not report files re-exported via barrel (index.ts)', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const orphanPaths = data.map((o: any) => o.filePath);
    // helpers.ts is re-exported via utils/index.ts, which is imported in app.module.ts
    expect(orphanPaths.every((p: string) => !p.includes('helpers.ts'))).toBe(true);
  });

  it('does not report barrel index.ts files that are imported', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const orphanPaths = data.map((o: any) => o.filePath);
    // components/index.ts is imported by app.module.ts (from './components')
    expect(orphanPaths.every((p: string) => !p.endsWith('components/index.ts'))).toBe(true);
  });

  it('sorts orphans by size descending', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1].size).toBeGreaterThanOrEqual(data[i].size);
      }
    }
  });
});
