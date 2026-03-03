import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/env-compare', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and detects correct keys and missing entries', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    // Should find all 3 environment files
    expect(data.files.length).toBe(3);

    // Should detect common keys across all files
    expect(data.keys).toContain('production');
    expect(data.keys).toContain('apiUrl');

    // environment.prod.ts should be missing keys that others have
    const prodMissing = data.missing.find(
      (m: any) => m.fileName === 'environment.prod.ts',
    );
    expect(prodMissing).toBeDefined();
    expect(prodMissing.missingKeys).toContain('debug');

    // staging has stagingOnly which others don't
    expect(data.keys).toContain('stagingOnly');
  });

  it('runs in text mode and shows table output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    const text = output.join('\n');
    expect(text).toContain('Environment File Comparison');
    expect(output.length).toBeGreaterThan(0);
  });
});
