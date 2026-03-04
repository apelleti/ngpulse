import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const execFileAsync = promisify(execFile);

const CLI_PATH = path.resolve(__dirname, '../packages/cli/dist/index.js');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args], {
      cwd: FIXTURES_DIR,
      timeout: 30000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
  }
}

describe('ngpulse CLI E2E', () => {
  it('info exits 0 and shows component count', async () => {
    const { stdout, exitCode } = await runCli(['info']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Components:');
    expect(stdout).toContain('Components:');
    expect(stdout).toContain('16');
  });

  it('route-tree exits 0 and shows routes', async () => {
    const { stdout, exitCode } = await runCli(['route-tree']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('route(s)');
    expect(stdout).toContain('lazy-loaded');
    expect(stdout).toContain('guarded');
  });

  it('env-compare exits 0 and shows environment comparison', async () => {
    const { stdout, exitCode } = await runCli(['env-compare']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Environment File Comparison');
    expect(stdout).toContain('Missing Keys Summary');
  });

  it('dead-css exits 0 and finds unused classes', async () => {
    const { stdout, exitCode } = await runCli(['dead-css']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('unused CSS class(es)');
    expect(stdout).toContain('.unused-class');
  });

  it('orphans exits 0 and finds orphan files', async () => {
    const { stdout, exitCode } = await runCli(['orphans']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('orphan file(s)');
    expect(stdout).toContain('orphan.ts');
  });

  it('component-weight exits 0 and ranks components', async () => {
    const { stdout, exitCode } = await runCli(['component-weight']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Component Weight Ranking');
    expect(stdout).toContain('components found');
    expect(stdout).toContain('CartComponent');
  });

  it('dep-map exits 0 and shows dependencies', async () => {
    const { stdout, exitCode } = await runCli(['dep-map']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Dependency Map');
    expect(stdout).toContain('@angular/core');
    expect(stdout).toContain('angular');
    expect(stdout).toContain('ecosystem');
  });

  it('empty-barrel exits 0 and finds boilerplate', async () => {
    const { stdout, exitCode } = await runCli(['empty-barrel']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('boilerplate file(s)');
    expect(stdout).toContain('EmptyService');
  });

  it('component-catalog exits 0 and lists components', async () => {
    const { stdout, exitCode } = await runCli(['component-catalog']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('components');
    expect(stdout).toContain('standalone');
    expect(stdout).toContain('AppComponent');
    expect(stdout).toContain('NavbarComponent');
  });

  it('compat-matrix exits 0 and checks compatibility', async () => {
    const { stdout, exitCode } = await runCli(['compat-matrix']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Angular Stack');
    expect(stdout).toContain('v18');
  });

  it('debt-log exits 0 and shows debt items', async () => {
    const { stdout, exitCode } = await runCli(['debt-log']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('debt items');
    expect(stdout).toContain('TODO');
    expect(stdout).toContain('FIXME');
    expect(stdout).toContain('HACK');
  });

  it('--json flag produces valid JSON for info', async () => {
    const { stdout, exitCode } = await runCli(['info', '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toBeDefined();
  });

  // ===== New tools E2E =====

  it('input-output exits 0 and finds unused inputs', async () => {
    const { stdout, exitCode } = await runCli(['input-output']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('unused');
  });

  it('input-output --json returns structured data', async () => {
    const { stdout, exitCode } = await runCli(['input-output', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.summary).toBeDefined();
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it('circular-deps exits 0 and detects cycles', async () => {
    const { stdout, exitCode } = await runCli(['circular-deps']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('cycle');
  });

  it('circular-deps --json returns array of cycles', async () => {
    const { stdout, exitCode } = await runCli(['circular-deps', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('test-coverage exits 0 (with or without coverage file)', async () => {
    const { stdout, exitCode } = await runCli(['test-coverage']);
    expect(exitCode).toBe(0);
    // Either shows coverage data or a helpful message — both are valid
    expect(stdout.length).toBeGreaterThan(0);
    expect(stdout).toMatch(/coverage|Coverage|%|ng test/i);
  });

  it('test-coverage --json exits 0 and returns valid JSON', async () => {
    const { stdout, exitCode } = await runCli(['test-coverage', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    // Either structured coverage or error message — both are valid JSON
    expect(data).toBeDefined();
    if (data.error) {
      expect(data.error).toBe('no_coverage_file');
    } else {
      expect(data.files).toBeDefined();
      expect(data.total).toBeDefined();
    }
  });

  it('i18n-check exits 0 and reports missing markers', async () => {
    const { stdout, exitCode } = await runCli(['i18n-check']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('missing');
  });

  it('i18n-check --json returns array of issues', async () => {
    const { stdout, exitCode } = await runCli(['i18n-check', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].file).toBeDefined();
    expect(data[0].line).toBeGreaterThan(0);
  });

  it('migration-hints exits 0 and shows hints', async () => {
    const { stdout, exitCode } = await runCli(['migration-hints']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/high|medium|low/i);
  });

  it('migration-hints --json has priority field', async () => {
    const { stdout, exitCode } = await runCli(['migration-hints', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.length).toBeGreaterThan(0);
    expect(['high', 'medium', 'low']).toContain(data[0].priority);
  });

  it('signal-migrate exits 0 and finds candidates', async () => {
    const { stdout, exitCode } = await runCli(['signal-migrate']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('signal');
  });

  it('signal-migrate --json returns candidates', async () => {
    const { stdout, exitCode } = await runCli(['signal-migrate', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('naming-check exits 0 and reports violations', async () => {
    const { stdout, exitCode } = await runCli(['naming-check']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('violation');
  });

  it('naming-check --json returns violations array', async () => {
    const { stdout, exitCode } = await runCli(['naming-check', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].rule).toBeDefined();
  });

  it('style-audit exits 0 and finds ng-deep and !important', async () => {
    const { stdout, exitCode } = await runCli(['style-audit']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('ng-deep');
    expect(stdout).toContain('important');
  });

  it('style-audit --json has issues and summary', async () => {
    const { stdout, exitCode } = await runCli(['style-audit', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.issues).toBeDefined();
    expect(data.summary).toBeDefined();
  });

  it('hardcoded-secrets exits 0 and detects secrets', async () => {
    const { stdout, exitCode } = await runCli(['hardcoded-secrets']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('***');
  });

  it('hardcoded-secrets --json returns findings with redacted values', async () => {
    const { stdout, exitCode } = await runCli(['hardcoded-secrets', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    for (const f of data) {
      expect(f.value).toContain('***');
    }
  });

  it('report exits 0 and creates HTML file', async () => {
    const reportPath = path.join(FIXTURES_DIR, 'ngpulse-report.html');
    // Clean up any previous report
    try { fs.unlinkSync(reportPath); } catch { /* ok */ }
    const { stdout, exitCode } = await runCli(['report']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('ngpulse-report.html');
    expect(fs.existsSync(reportPath)).toBe(true);
    // Clean up
    fs.unlinkSync(reportPath);
  });

  it('report --json returns consolidated data', async () => {
    const { stdout, exitCode } = await runCli(['report', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data['info']).toBeDefined();
    expect(data['debt-log']).toBeDefined();
  });

  it('info --more shows file details', async () => {
    const { stdout, exitCode } = await runCli(['info', '--more']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('✓');
    expect(stdout).toContain('.component.ts');
  });
});
