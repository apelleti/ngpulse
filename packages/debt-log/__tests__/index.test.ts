import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/debt-log', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and detects TODO/FIXME/HACK comments', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    // Fixtures contain TODO, FIXME, HACK comments in services and interceptors
    expect(data.length).toBeGreaterThanOrEqual(3);

    const types = data.map((item: any) => item.type);
    expect(types).toContain('TODO');
    expect(types).toContain('FIXME');
    expect(types).toContain('HACK');

    // Every item should have file and line
    for (const item of data) {
      expect(item.file).toBeTruthy();
      expect(item.line).toBeGreaterThan(0);
    }
  });

  it('runs in text mode and shows table output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
