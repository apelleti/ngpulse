import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
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

    // app.component.scss has an .unused-class not referenced in app.component.html
    const appResult = data.find((r: any) => r.component === 'app');
    expect(appResult).toBeDefined();
    expect(appResult.unused).toContain('unused-class');

    // header.component.scss has .header-hidden not used in template
    const headerResult = data.find((r: any) => r.component === 'header');
    expect(headerResult).toBeDefined();
    expect(headerResult.unused).toContain('header-hidden');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
