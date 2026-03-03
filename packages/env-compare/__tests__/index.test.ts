import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
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

    // Should find all 4 environment files (including environment.default.ts)
    expect(data.files.length).toBe(4);

    expect(data.keys).toContain('production');
    expect(data.keys).toContain('apiUrl');

    const prodMissing = data.missing.find(
      (m: any) => m.fileName === 'environment.prod.ts',
    );
    expect(prodMissing).toBeDefined();
    expect(prodMissing.missingKeys).toContain('debug');

    expect(data.keys).toContain('stagingOnly');
  });

  it('runs in text mode and shows table output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    const text = output.join('\n');
    expect(text).toContain('Environment File Comparison');
    expect(output.length).toBeGreaterThan(0);
  });

  it('reports no files when project has no environment*.ts', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-env-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: false, verbose: false });
      const text = output.join('\n');
      expect(text).toContain('No environment');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('handles env file with only 2 keys', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-env-'));
    const srcDir = path.join(tmpDir, 'src', 'environments');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    fs.writeFileSync(
      path.join(srcDir, 'environment.ts'),
      'export const environment = { apiUrl: "http://localhost", debug: true };',
    );
    fs.writeFileSync(
      path.join(srcDir, 'environment.prod.ts'),
      'export const environment = { apiUrl: "https://api.prod.com" };',
    );
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data.files.length).toBe(2);
      expect(data.keys).toContain('apiUrl');
      expect(data.keys).toContain('debug');
      const prodMissing = data.missing.find((m: any) => m.fileName === 'environment.prod.ts');
      expect(prodMissing).toBeDefined();
      expect(prodMissing.missingKeys).toContain('debug');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('matrix correctly maps each key presence per file', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    // production should be present in all files
    expect(data.matrix['production']['environment.ts']).toBe(true);
    expect(data.matrix['production']['environment.prod.ts']).toBe(true);
    expect(data.matrix['production']['environment.staging.ts']).toBe(true);
    // stagingOnly should only be in staging
    expect(data.matrix['stagingOnly']['environment.staging.ts']).toBe(true);
    expect(data.matrix['stagingOnly']['environment.ts']).toBe(false);
    expect(data.matrix['stagingOnly']['environment.prod.ts']).toBe(false);
  });
});
