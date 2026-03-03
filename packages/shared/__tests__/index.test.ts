import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  scanFiles,
  readFileContent,
  parseAngularWorkspace,
  formatBytes,
  createTable,
  boxDraw,
  progressBar,
  findAngularRoot,
  fileExists,
  getProjectPaths,
  createProject,
  getComponents,
  getServices,
  colorize,
} from '../src/index';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

describe('@ngtk/shared', () => {
  it('scanFiles finds .ts files', async () => {
    const files = await scanFiles(FIXTURES, ['**/*.component.ts']);
    expect(files.length).toBeGreaterThan(0);
  });

  it('readFileContent reads a file', async () => {
    const content = await readFileContent(path.join(FIXTURES, 'package.json'));
    expect(content).toContain('demo-app');
  });

  it('readFileContent throws on nonexistent file', async () => {
    await expect(readFileContent('/nonexistent/file.ts')).rejects.toThrow();
  });

  it('parseAngularWorkspace parses angular.json', async () => {
    const ws = await parseAngularWorkspace(FIXTURES);
    expect(ws.projects).toHaveProperty('demo-app');
  });

  it('parseAngularWorkspace throws when no angular.json or project.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngtk-ws-'));
    try {
      await expect(parseAngularWorkspace(tmpDir)).rejects.toThrow('No angular.json');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('getProjectPaths returns source root paths', async () => {
    const ws = await parseAngularWorkspace(FIXTURES);
    const paths = getProjectPaths(ws);
    expect(paths).toContain('src');
  });

  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });

  it('createTable returns a string', () => {
    const result = createTable(['A', 'B'], [['1', '2']]);
    expect(result).toContain('1');
  });

  it('createTable handles empty rows', () => {
    const result = createTable(['A', 'B'], []);
    expect(typeof result).toBe('string');
  });

  it('boxDraw creates a box', () => {
    const result = boxDraw('Title', ['line1', 'line2']);
    expect(result).toContain('Title');
  });

  it('progressBar shows percentage', () => {
    const result = progressBar(50, 100);
    expect(result).toContain('50%');
  });

  it('progressBar handles zero total', () => {
    const result = progressBar(0, 0);
    expect(result).toContain('0%');
  });

  it('progressBar handles value > total (caps at 100%)', () => {
    const result = progressBar(150, 100);
    expect(result).toContain('100%');
  });

  it('findAngularRoot resolves fixtures directory', async () => {
    const root = await findAngularRoot(path.join(FIXTURES, 'src', 'app'));
    expect(root).toBe(FIXTURES);
  });

  it('fileExists returns true for existing file', () => {
    expect(fileExists(path.join(FIXTURES, 'package.json'))).toBe(true);
  });

  it('fileExists returns false for nonexistent file', () => {
    expect(fileExists('/nonexistent/file.ts')).toBe(false);
  });

  it('createProject returns a ts-morph Project', () => {
    const project = createProject();
    expect(project).toBeDefined();
    expect(typeof project.addSourceFileAtPath).toBe('function');
  });

  it('getComponents finds all component files', async () => {
    const components = await getComponents(FIXTURES);
    expect(components.length).toBeGreaterThanOrEqual(4);
    const names = components.map(c => c.name);
    expect(names).toContain('AppComponent');
    expect(names).toContain('HeaderComponent');
  });

  it('getServices finds all service files', async () => {
    const services = await getServices(FIXTURES);
    expect(services.length).toBeGreaterThanOrEqual(2);
    const names = services.map(s => s.name);
    expect(names).toContain('AuthService');
  });

  it('colorize wraps text with color', () => {
    const result = colorize('hello', 'red');
    expect(result).toContain('hello');
  });

  it('scanFiles returns empty for nonexistent patterns', async () => {
    const files = await scanFiles(FIXTURES, ['**/*.xyz']);
    expect(files).toEqual([]);
  });
});
