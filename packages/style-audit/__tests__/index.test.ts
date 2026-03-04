import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/style-audit', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('detects style issues in JSON mode', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.issues.length).toBeGreaterThan(0);
    expect(data.summary).toBeDefined();
  });

  it('detects ::ng-deep usage', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const ngDeep = data.issues.filter((i: any) => i.type === 'ng-deep');
    expect(ngDeep.length).toBeGreaterThan(0);
  });

  it('detects !important usage', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const important = data.issues.filter((i: any) => i.type === 'important');
    expect(important.length).toBeGreaterThan(0);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns no issues for empty project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-sa-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data.issues).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
