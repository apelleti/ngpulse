import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/naming-check', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('detects naming violations in JSON mode', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(Array.isArray(data)).toBe(true);
    for (const v of data) {
      expect(v.file).toBeDefined();
      expect(v.rule).toBeDefined();
      expect(v.message).toBeDefined();
    }
  });

  it('detects Injectable without service suffix', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const fileSuffixViolations = data.filter((v: any) => v.rule === 'file-suffix');
    expect(fileSuffixViolations.length).toBeGreaterThan(0);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty for project with no TS files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-nc-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('AdminHelper is flagged as naming violation', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const adminViolation = data.find((v: any) => v.file.includes('AdminHelper'));
    expect(adminViolation).toBeDefined();
  });
});
