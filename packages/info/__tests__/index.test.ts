import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngpulse/info', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and returns expected structure', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    expect(data.versions.angular).toContain('18');
    expect(data.versions.typescript).toContain('5.5');
    expect(data.versions.node).toMatch(/^v?\d+/);

    // fixture has app, header, footer, sidebar, dashboard, users = 6 components
    expect(data.counts.components).toBeGreaterThanOrEqual(4);
    expect(data.counts.services).toBeGreaterThanOrEqual(2);
    expect(data.counts.pipes).toBeGreaterThanOrEqual(1);
    expect(data.counts.guards).toBeGreaterThanOrEqual(1);

    expect(typeof data.packageManager).toBe('string');
  });

  it('runs in text mode and shows box drawing', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });

  it('detects signal usage from header and dashboard components', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.signalUsage.filesWithSignals).toBeGreaterThanOrEqual(2);
  });

  it('detects lazy routes', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.lazyRoutes.lazy).toBeGreaterThanOrEqual(2);
    expect(data.lazyRoutes.totalRoutes).toBeGreaterThanOrEqual(2);
  });

  it('detects standalone ratio', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const data = JSON.parse(output.join('\n'));
    expect(data.standaloneRatio.standalone).toBeGreaterThanOrEqual(1);
    expect(data.standaloneRatio.total).toBeGreaterThanOrEqual(4);
  });

  it('throws on missing package.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-info-bad-'));
    fs.writeFileSync(path.join(tmpDir, 'angular.json'), '{"projects":{}}');
    try {
      await expect(run({ root: tmpDir, json: true, verbose: false })).rejects.toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
