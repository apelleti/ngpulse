import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/dead-css', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and detects unused CSS classes', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    const appResult = data.find((r: any) => r.component === 'app');
    expect(appResult).toBeDefined();
    expect(appResult.unused).toContain('unused-class');

    const headerResult = data.find((r: any) => r.component === 'header');
    expect(headerResult).toBeDefined();
    expect(headerResult.unused).toContain('header-hidden');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns empty results for project with no component styles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-deadcss-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await run({ root: tmpDir, json: true, verbose: false });
      const data = JSON.parse(output.join('\n'));
      expect(data).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('does not report classes used via [class.x] bindings', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    // sidebar uses [class.collapsed]="isCollapsed"
    const sidebarResult = data.find((r: any) => r.component === 'sidebar');
    if (sidebarResult) {
      expect(sidebarResult.unused).not.toContain('collapsed');
    }
  });

  it('does not report pseudo-classes as dead CSS', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    for (const result of data) {
      expect(result.unused).not.toContain('hover');
      expect(result.unused).not.toContain('focus');
      expect(result.unused).not.toContain('active');
    }
  });

  it('detects dead CSS in dashboard component', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    const dashResult = data.find((r: any) => r.component === 'dashboard');
    if (dashResult) {
      expect(dashResult.unused).toContain('dead-panel');
      expect(dashResult.unused).toContain('unused-widget');
    }
  });

  it('sorts results by unused count descending', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1].unused.length).toBeGreaterThanOrEqual(data[i].unused.length);
      }
    }
  });
});
