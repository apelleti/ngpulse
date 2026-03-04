import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/component-catalog', () => {
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

    const header = data.find((c: any) => c.name === 'HeaderComponent');
    expect(header.standalone).toBe(true);
    expect(header.selector).toBe('app-header');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty array for project with no components', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-cc-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects new dashboard and users components', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const names = data.map((c: any) => c.name);
    expect(names).toContain('DashboardComponent');
    expect(names).toContain('UsersComponent');
  });

  it('detects standalone property correctly', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const users = data.find((c: any) => c.name === 'UsersComponent');
    expect(users.standalone).toBe(true);
    const app = data.find((c: any) => c.name === 'AppComponent');
    expect(app.standalone).toBe(false);
  });
});
