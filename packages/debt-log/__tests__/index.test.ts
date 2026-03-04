import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/debt-log', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and detects TODO/FIXME/HACK comments', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.length).toBeGreaterThanOrEqual(3);

    const types = data.map((item: any) => item.type);
    expect(types).toContain('TODO');
    expect(types).toContain('FIXME');
    expect(types).toContain('HACK');

    for (const item of data) {
      expect(item.file).toBeTruthy();
      expect(item.line).toBeGreaterThan(0);
    }
  });

  it('runs in text mode and shows table output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty for project with no debt comments', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-debt-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    fs.writeFileSync(path.join(srcDir, 'clean.ts'), 'export const x = 42;');
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects TODO from helpers.ts fixture', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const helperTodo = data.find(
      (item: any) => item.file.includes('helpers.ts') && item.type === 'TODO',
    );
    expect(helperTodo).toBeDefined();
  });

  it('each debt item has a non-empty message', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    for (const item of data) {
      expect(item.message.length).toBeGreaterThan(0);
    }
  });

  it('handles directory with no .ts files gracefully', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-debt-empty-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
