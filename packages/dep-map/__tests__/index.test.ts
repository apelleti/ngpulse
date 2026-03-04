import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/dep-map', () => {
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

    const angularCore = data.find((d: any) => d.name === '@angular/core');
    expect(angularCore).toBeDefined();
    expect(angularCore.category).toBe('angular');

    const rxjs = data.find((d: any) => d.name === 'rxjs');
    expect(rxjs).toBeDefined();
    expect(rxjs.category).toBe('ecosystem');

    const ts = data.find((d: any) => d.name === 'typescript');
    expect(ts).toBeDefined();
    expect(ts.depType).toBe('devDependencies');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('handles minimal package.json with only one dep', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-dm-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test', dependencies: { '@angular/core': '^17.0.0' },
    }));
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data.length).toBe(1);
      expect(data[0].category).toBe('angular');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('classifies ecosystem deps correctly', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const ngrx = data.find((d: any) => d.name === '@ngrx/store');
    expect(ngrx).toBeDefined();
    expect(ngrx.category).toBe('ecosystem');
    const toastr = data.find((d: any) => d.name === 'ngx-toastr');
    expect(toastr).toBeDefined();
    expect(toastr.category).toBe('ecosystem');
  });

  it('throws on malformed package.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-dm-bad-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{ INVALID }');
    try {
      await expect(run({ root: tmpDir, json: true, verbose: false })).rejects.toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
