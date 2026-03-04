import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/component-weight', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and returns component weights', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.length).toBeGreaterThanOrEqual(4);

    for (const component of data) {
      expect(component.tsSize).toBeGreaterThan(0);
      expect(component.totalSize).toBeGreaterThan(0);
      expect(component.name).toBeTruthy();
    }
  });

  it('runs in text mode and shows table output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns message for project with no components', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-cw-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const text = output.join('\n');
      expect(text).toContain('No');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('totalSize is sum of tsSize + templateSize + styleSize', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    for (const c of data) {
      expect(c.totalSize).toBe(c.tsSize + c.templateSize + c.styleSize);
    }
  });
});
