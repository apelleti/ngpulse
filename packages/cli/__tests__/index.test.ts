import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'ngtk.js');
const FIXTURES = path.resolve(__dirname, '../../../fixtures');

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.code ?? 1,
    };
  }
}

describe('@ngtk/cli', () => {
  it('--version returns the version from package.json', async () => {
    const { stdout } = await runCli(['-V']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help shows available commands', async () => {
    const { stdout } = await runCli(['--help']);
    expect(stdout).toContain('info');
    expect(stdout).toContain('dead-css');
    expect(stdout).toContain('debt-log');
  });

  it('--json flag is passed to commands (info)', async () => {
    const { stdout } = await runCli(['info', '--root', FIXTURES, '--json']);
    const data = JSON.parse(stdout);
    expect(data).toHaveProperty('versions');
    expect(data).toHaveProperty('counts');
  });

  it('nonexistent project root shows user-friendly error', async () => {
    const { stderr, exitCode } = await runCli(['info', '--root', '/nonexistent/project']);
    expect(stderr).toContain('Error');
    expect(exitCode).not.toBe(0);
  });

  it('wrapAction catches errors and shows user-friendly message', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-cli-'));
    try {
      // No angular.json, no package.json → should produce a clean error
      const { stderr, exitCode } = await runCli(['info', '--root', tmpDir]);
      expect(stderr).toContain('Error');
      expect(exitCode).not.toBe(0);
      // Should NOT contain a raw stack trace unless --verbose
      expect(stderr).not.toContain('at Object.');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('--verbose shows stack trace on error', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-cli-'));
    try {
      const { stderr } = await runCli(['info', '--root', tmpDir, '--verbose']);
      expect(stderr).toContain('Error');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
