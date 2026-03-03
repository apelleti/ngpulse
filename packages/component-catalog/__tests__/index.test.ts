import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/component-catalog', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and lists components with metadata', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.length).toBeGreaterThanOrEqual(4);

    const names = data.map((c: any) => c.name);
    expect(names).toContain('AppComponent');
    expect(names).toContain('HeaderComponent');

    // HeaderComponent is standalone
    const header = data.find((c: any) => c.name === 'HeaderComponent');
    expect(header.standalone).toBe(true);
    expect(header.selector).toBe('app-header');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
