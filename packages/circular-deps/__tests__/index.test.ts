import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/circular-deps', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('detects circular dependencies in JSON mode', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.length).toBeGreaterThan(0);
    // Should detect cycle-a.service.ts <-> cycle-b.service.ts
    const cycleFiles = data.flat();
    expect(cycleFiles.some((f: string) => f.includes('cycle-a.service'))).toBe(true);
    expect(cycleFiles.some((f: string) => f.includes('cycle-b.service'))).toBe(true);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns no cycles for empty project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-cd-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('reports the cycle chain in text mode', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    const text = output.join('\n');
    expect(text).toContain('→');
  });

  it('detects cycle involving cycle-a and cycle-b', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const allFiles = data.flat();
    expect(allFiles.some((f: string) => f.includes('cycle'))).toBe(true);
  });
});
