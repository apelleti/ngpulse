import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/component-weight', () => {
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

    // Should find at least 4 components (app, header, footer, sidebar)
    expect(data.length).toBeGreaterThanOrEqual(4);

    // Every component should have positive TS size
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
});
