import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/route-tree', () => {
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

    // Fixture has multiple routes
    expect(data.length).toBeGreaterThanOrEqual(2);

    const paths = data.map((r: any) => r.path);

    // Admin route should be lazy and guarded
    const admin = data.find((r: any) => r.path === 'admin');
    if (admin) {
      expect(admin.lazy).toBe(true);
      expect(admin.guards.length).toBeGreaterThan(0);
    }

    // Profile route should be lazy
    const profile = data.find((r: any) => r.path === 'profile');
    if (profile) {
      expect(profile.lazy).toBe(true);
    }
  });

  it('runs in text mode and shows tree output', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
