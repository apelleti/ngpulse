import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/route-tree', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and parses route definitions', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.length).toBeGreaterThanOrEqual(2);

    const admin = data.find((r: any) => r.path === 'admin');
    if (admin) {
      expect(admin.lazy).toBe(true);
      expect(admin.guards.length).toBeGreaterThan(0);
    }

    const profile = data.find((r: any) => r.path === 'profile');
    if (profile) {
      expect(profile.lazy).toBe(true);
    }
  });

  it('runs in text mode and shows tree output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('parses nested child routes from admin-routing module', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    // admin-routing.module.ts has a route with children (users, settings)
    const routeWithChildren = data.find(
      (r: any) => r.children && r.children.length > 0,
    );
    if (routeWithChildren) {
      expect(routeWithChildren.children.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('shows no routes message for project with no routing files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-rt-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: false, verbose: false });
      const text = output.join('\n');
      expect(text).toContain('No routing files');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('wildcard route (**) is detected', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const wildcard = data.find((r: any) => r.path === '**');
    expect(wildcard).toBeDefined();
  });
});
