import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/compat-matrix', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and checks compatibility for Angular 17', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.length).toBeGreaterThan(0);

    // @angular/core should be present and compatible
    const core = data.find((e: any) => e.package === '@angular/core');
    expect(core).toBeDefined();
    expect(core.compatible).toBe(true);

    // TypeScript 5.4 is compatible with Angular 17
    const ts = data.find((e: any) => e.package === 'typescript');
    expect(ts).toBeDefined();
    expect(ts.compatible).toBe(true);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
