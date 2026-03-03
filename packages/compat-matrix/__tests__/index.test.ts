import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
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

    const core = data.find((e: any) => e.package === '@angular/core');
    expect(core).toBeDefined();
    expect(core.compatible).toBe(true);

    const ts = data.find((e: any) => e.package === 'typescript');
    expect(ts).toBeDefined();
    expect(ts.compatible).toBe(true);
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('handles unknown Angular version gracefully', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-compat-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test',
      dependencies: { '@angular/core': '^99.0.0' },
      devDependencies: { typescript: '~5.4.0' },
    }));
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data.length).toBeGreaterThan(0);
      // Unknown major should still return entries
      const core = data.find((e: any) => e.package === '@angular/core');
      expect(core).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects rxjs compatibility', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const rxjs = data.find((e: any) => e.package === 'rxjs');
    expect(rxjs).toBeDefined();
    expect(rxjs.compatible).toBe(true);
  });

  it('includes node version check', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const node = data.find((e: any) => e.package === 'node');
    expect(node).toBeDefined();
    expect(node.currentVersion).toMatch(/^\d+\.\d+/);
  });
});
