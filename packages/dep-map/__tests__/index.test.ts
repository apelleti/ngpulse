import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/dep-map', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and categorizes dependencies', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.length).toBeGreaterThan(0);

    // Check Angular deps are categorized correctly
    const angularCore = data.find((d: any) => d.name === '@angular/core');
    expect(angularCore).toBeDefined();
    expect(angularCore.category).toBe('angular');

    // Check ecosystem dep
    const rxjs = data.find((d: any) => d.name === 'rxjs');
    expect(rxjs).toBeDefined();
    expect(rxjs.category).toBe('ecosystem');

    // Check typescript is dev dep
    const ts = data.find((d: any) => d.name === 'typescript');
    expect(ts).toBeDefined();
    expect(ts.depType).toBe('devDependencies');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
