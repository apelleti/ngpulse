import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/orphans', () => {
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

    // The fixture has an explicit orphan.ts file
    const orphanPaths = data.map((o: any) => o.filePath);
    expect(orphanPaths.some((p: string) => p.includes('orphan.ts'))).toBe(true);

    // Every orphan should have size and extension
    for (const orphan of data) {
      expect(orphan.size).toBeGreaterThanOrEqual(0);
      expect(orphan.extension).toBeTruthy();
    }
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
