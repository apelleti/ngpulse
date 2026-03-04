import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');
const REPORT_PATH = path.join(FIXTURES, 'ngpulse-report.html');

function cleanup() {
  if (fs.existsSync(REPORT_PATH)) fs.unlinkSync(REPORT_PATH);
}

describe('@ngpulse/report', () => {
  let output: string[];
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
    cleanup();
  });

  it('generates an HTML report file', async () => {
    output = [];
    console.log = (...args: unknown[]) => { output.push(args.map(String).join(' ')); };
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    console.log = originalLog;

    expect(fs.existsSync(REPORT_PATH)).toBe(true);
    const html = fs.readFileSync(REPORT_PATH, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('ngpulse Report');
    expect(html).toContain('Health Indicators');
    expect(html).toContain('demo-app');
  });

  it('HTML contains key sections', async () => {
    output = [];
    console.log = (...args: unknown[]) => { output.push(args.map(String).join(' ')); };
    await run({ root: FIXTURES, json: false, verbose: false, more: false });
    console.log = originalLog;

    const html = fs.readFileSync(REPORT_PATH, 'utf-8');
    expect(html).toContain('Standalone');
    expect(html).toContain('Signals');
    expect(html).toContain('Lazy Routes');
    expect(html).toContain('Technical Debt');
    expect(html).toContain('Compatibility Matrix');
  });

  it('JSON mode returns consolidated data', async () => {
    output = [];
    console.log = (...args: unknown[]) => { output.push(args.map(String).join(' ')); };
    await run({ root: FIXTURES, json: true, verbose: false, more: false });
    console.log = originalLog;

    const data = JSON.parse(output.join('\n'));
    expect(data['info']).toBeDefined();
    expect(data['debt-log']).toBeDefined();
    expect(data['orphans']).toBeDefined();
    expect(data['dead-css']).toBeDefined();
    expect(data['circular-deps']).toBeDefined();
    expect(data['hardcoded-secrets']).toBeDefined();
    expect(data['compat-matrix']).toBeDefined();
  });
});
