import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/hardcoded-secrets', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('detects hardcoded secrets in JSON mode', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.length).toBeGreaterThan(0);
    for (const finding of data) {
      expect(finding.file).toBeDefined();
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.type).toBeDefined();
    }
  });

  it('detects apiKey in api-config.ts', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const apiConfig = data.filter((f: any) => f.file.includes('api-config'));
    expect(apiConfig.length).toBeGreaterThan(0);
  });

  it('redacts secret values', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    for (const finding of data) {
      expect(finding.value).toContain('***');
    }
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns no findings for clean project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-hs-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false, more: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('finding type is one of the known categories', async () => {
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    const data = JSON.parse(output.join('\n'));
    const validTypes = ['api-key', 'token', 'password', 'secret', 'jwt', 'private-key', 'credential'];
    for (const f of data) {
      expect(validTypes.some(t => f.type.includes(t))).toBe(true);
    }
  });
});
