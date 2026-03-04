import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/migration-hints', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('detects migration opportunities in JSON mode', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.length).toBeGreaterThan(0);
    for (const hint of data) {
      expect(['high', 'medium', 'low']).toContain(hint.priority);
      expect(hint.file).toBeDefined();
      expect(hint.message).toBeDefined();
    }
  });

  it('detects constructor injection hints', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const ctorHints = data.filter((h: any) => h.message.includes('Constructor injection'));
    expect(ctorHints.length).toBeGreaterThan(0);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty for clean project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-mh-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('has suggestion field on each hint', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    for (const hint of data) {
      expect(hint.suggestion).toBeDefined();
      expect(hint.file).toBeDefined();
    }
  });
});
