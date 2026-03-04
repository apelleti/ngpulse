import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');
const REPORT_PATH = path.join(FIXTURES, 'ngpulse-report.html');

function cleanup() {
  if (fs.existsSync(REPORT_PATH)) fs.unlinkSync(REPORT_PATH);
}

async function captureLog(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lines;
}

describe('@ngpulse/report', () => {
  afterEach(cleanup);

  it('generates an HTML report file', async () => {
    await captureLog(() => run({ root: FIXTURES, json: false, verbose: false, more: false }));

    expect(fs.existsSync(REPORT_PATH)).toBe(true);
    const html = fs.readFileSync(REPORT_PATH, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('ngpulse Report');
    expect(html).toContain('Health Indicators');
    expect(html).toContain('demo-app');
  });

  it('HTML contains key sections', async () => {
    // Generate independently — no dependency on test ordering
    await captureLog(() => run({ root: FIXTURES, json: false, verbose: false, more: false }));

    const html = fs.readFileSync(REPORT_PATH, 'utf-8');
    expect(html).toContain('Standalone');
    expect(html).toContain('Signals');
    expect(html).toContain('Lazy Routes');
    expect(html).toContain('Technical Debt');
    expect(html).toContain('Compatibility Matrix');
  });

  it('JSON mode returns consolidated data', async () => {
    const lines = await captureLog(() => run({ root: FIXTURES, json: true, verbose: false, more: false }));

    const data = JSON.parse(lines.join('\n'));
    expect(data['info']).toBeDefined();
    expect(data['debt-log']).toBeDefined();
    expect(data['orphans']).toBeDefined();
    expect(data['dead-css']).toBeDefined();
    expect(data['circular-deps']).toBeDefined();
    expect(data['hardcoded-secrets']).toBeDefined();
    expect(data['compat-matrix']).toBeDefined();
  });
});
