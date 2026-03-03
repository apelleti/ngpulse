import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { run } from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/empty-barrel', () => {
  let output: string[];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => { output.push(args.map(String).join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('runs in JSON mode and detects boilerplate files', async () => {
    await run({ root: FIXTURES, json: true, verbose: false });
    const jsonOutput = output.join('\n');
    const data = JSON.parse(jsonOutput);

    // Should find at least:
    // - footer.component.scss (empty style)
    // - footer.component.html (empty template)
    // - empty.service.ts (empty service)
    expect(data.length).toBeGreaterThanOrEqual(3);

    const types = data.map((r: any) => r.type);
    expect(types).toContain('empty-style');
    expect(types).toContain('empty-template');
    expect(types).toContain('empty-service');

    // Verify empty service detection
    const emptyService = data.find((r: any) => r.type === 'empty-service');
    expect(emptyService.filePath).toContain('empty.service');
  });

  it('runs in text mode without error', async () => {
    await run({ root: FIXTURES, json: false, verbose: false });
    expect(output.length).toBeGreaterThan(0);
  });
});
