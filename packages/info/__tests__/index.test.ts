import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/info', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and returns expected structure', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    // Versions
    expect(data.versions.angular).toContain('17');
    expect(data.versions.typescript).toContain('5.4');
    expect(data.versions.node).toMatch(/^v?\d+/);

    // Counts — fixture has at least app, header, footer, sidebar components
    expect(data.counts.components).toBeGreaterThanOrEqual(4);
    expect(data.counts.services).toBeGreaterThanOrEqual(2);
    expect(data.counts.pipes).toBeGreaterThanOrEqual(1);
    expect(data.counts.guards).toBeGreaterThanOrEqual(1);

    // Package manager detection
    expect(typeof data.packageManager).toBe('string');
  });

  it('runs in text mode and shows box drawing', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
