import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/input-output', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('detects inputs and outputs in JSON mode', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.entries.length).toBeGreaterThan(0);
    expect(data.summary).toBeDefined();
    expect(data.summary.totalInputs).toBeGreaterThan(0);
  });

  it('identifies unused inputs/outputs', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const unused = data.entries.filter((e: any) => !e.used);
    expect(unused.length).toBeGreaterThan(0);
    expect(unused.some((e: any) => e.name === 'subtitle' || e.name === 'resized')).toBe(true);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty for project with no components', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-io-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data.entries).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
