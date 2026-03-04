import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import {
  SyntaxKind,
  scanFiles,
  readFileContent,
  colorize,
  boxDraw,
  createProject,
  addSourceFiles,
} from '@ngpulse/shared';

const TS_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.json']);

interface PathAliases {
  paths: Record<string, string[]>;
  baseUrl: string | null;
}

async function loadPathAliases(root: string): Promise<PathAliases> {
  const result: PathAliases = { paths: {}, baseUrl: null };

  for (const name of ['tsconfig.base.json', 'tsconfig.json']) {
    const filePath = path.join(root, name);
    try {
      const content = await readFileContent(filePath);
      const json = JSON.parse(content);
      const opts = json.compilerOptions || {};
      if (opts.baseUrl && !result.baseUrl) {
        result.baseUrl = opts.baseUrl;
      }
      if (opts.paths) {
        Object.assign(result.paths, opts.paths);
      }
    } catch {
      // file not found or invalid JSON — skip
    }
  }

  return result;
}

function resolveImport(
  fromFile: string,
  importPath: string,
  knownFiles: Set<string>,
  root: string,
  aliases: PathAliases,
): string | null {
  // Relative imports
  if (importPath.startsWith('.')) {
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, importPath);
    const ext = path.extname(resolved);
    if (!ext || !TS_EXTENSIONS.has(ext)) {
      const withExt = resolved + '.ts';
      if (knownFiles.has(withExt)) return withExt;
      const indexFallback = resolved + '/index.ts';
      if (knownFiles.has(indexFallback)) return indexFallback;
      return withExt;
    }
    return resolved;
  }

  // Check path aliases
  for (const [pattern, targets] of Object.entries(aliases.paths)) {
    const starIdx = pattern.indexOf('*');
    if (starIdx >= 0) {
      const prefix = pattern.slice(0, starIdx);
      if (importPath.startsWith(prefix)) {
        const rest = importPath.slice(prefix.length);
        for (const target of targets) {
          const resolvedTarget = target.replace('*', rest);
          const baseDir = aliases.baseUrl
            ? path.resolve(root, aliases.baseUrl)
            : root;
          const fullPath = path.resolve(baseDir, resolvedTarget);
          const ext = path.extname(fullPath);
          if (!ext || !TS_EXTENSIONS.has(ext)) {
            if (knownFiles.has(fullPath + '.ts')) return fullPath + '.ts';
            if (knownFiles.has(fullPath + '/index.ts')) return fullPath + '/index.ts';
          } else if (knownFiles.has(fullPath)) {
            return fullPath;
          }
        }
      }
    } else if (pattern === importPath) {
      for (const target of targets) {
        const baseDir = aliases.baseUrl
          ? path.resolve(root, aliases.baseUrl)
          : root;
        const fullPath = path.resolve(baseDir, target);
        const ext = path.extname(fullPath);
        if (!ext || !TS_EXTENSIONS.has(ext)) {
          if (knownFiles.has(fullPath + '.ts')) return fullPath + '.ts';
          if (knownFiles.has(fullPath + '/index.ts')) return fullPath + '/index.ts';
        } else if (knownFiles.has(fullPath)) {
          return fullPath;
        }
      }
    }
  }

  // Try resolving from baseUrl
  if (aliases.baseUrl) {
    const baseDir = path.resolve(root, aliases.baseUrl);
    const resolved = path.resolve(baseDir, importPath);
    const ext = path.extname(resolved);
    if (!ext || !TS_EXTENSIONS.has(ext)) {
      if (knownFiles.has(resolved + '.ts')) return resolved + '.ts';
      if (knownFiles.has(resolved + '/index.ts')) return resolved + '/index.ts';
    } else if (knownFiles.has(resolved)) {
      return resolved;
    }
  }

  // Non-relative, non-alias import (external package) — skip
  return null;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push([...stack.slice(cycleStart), node]);
      }
      return;
    }

    inStack.add(node);
    stack.push(node);

    for (const dep of graph.get(node) || []) {
      dfs(dep);
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
}

function deduplicateCycles(cycles: string[][]): string[][] {
  const seen = new Set<string>();
  const unique: string[][] = [];

  for (const cycle of cycles) {
    const nodes = cycle.slice(0, -1);
    const minIdx = nodes.indexOf(nodes.reduce((a, b) => (a < b ? a : b)));
    const normalized = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)].join(' -> ');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(cycle);
    }
  }

  return unique;
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode, more } = options;

  const files = await scanFiles(root, ['**/*.ts']);
  const tsFiles = files.filter(
    (f) => !f.endsWith('.spec.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
  );

  const knownFiles = new Set(tsFiles);
  const aliases = await loadPathAliases(root);
  const graph = new Map<string, string[]>();
  const importLines = new Map<string, Map<string, number>>();

  // Use ts-morph to extract imports via AST
  const project = createProject();
  const sourceFiles = addSourceFiles(project, tsFiles);

  for (const sf of sourceFiles) {
    const file = sf.getFilePath();
    const deps: string[] = [];
    const fileImportLines = new Map<string, number>();

    for (const imp of sf.getImportDeclarations()) {
      const importPath = imp.getModuleSpecifierValue();
      const resolved = resolveImport(file, importPath, knownFiles, root, aliases);
      if (resolved) {
        deps.push(resolved);
        fileImportLines.set(resolved, imp.getStartLineNumber());
      }
    }

    // Also handle dynamic imports: import('...')
    sf.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.CallExpression) {
        const text = node.getText();
        const dynamicMatch = text.match(/^import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (dynamicMatch) {
          const resolved = resolveImport(file, dynamicMatch[1], knownFiles, root, aliases);
          if (resolved) {
            deps.push(resolved);
            fileImportLines.set(resolved, node.getStartLineNumber());
          }
        }
      }
    });

    graph.set(file, deps);
    importLines.set(file, fileImportLines);
  }

  const rawCycles = findCycles(graph);
  const cycles = deduplicateCycles(rawCycles);

  if (jsonMode) {
    const jsonCycles = cycles.map((c) => c.map((f) => path.relative(root, f)));
    console.log(JSON.stringify(jsonCycles));
    return;
  }

  if (cycles.length === 0) {
    console.log(colorize('No circular dependencies found \u2713', 'green'));
    return;
  }

  const lines: string[] = [];
  for (let i = 0; i < cycles.length; i++) {
    if (more) {
      const parts: string[] = [];
      for (let j = 0; j < cycles[i].length - 1; j++) {
        const from = cycles[i][j];
        const to = cycles[i][j + 1];
        const lineNum = importLines.get(from)?.get(to);
        const relFrom = path.relative(root, from);
        parts.push(lineNum ? `${relFrom}:${lineNum}` : relFrom);
      }
      parts.push(path.relative(root, cycles[i][cycles[i].length - 1]));
      lines.push(`${colorize(`Cycle ${i + 1}:`, 'yellow')} ${parts.join(colorize(' \u2192 ', 'red'))}`);
    } else {
      const chain = cycles[i].map((f) => path.relative(root, f)).join(colorize(' \u2192 ', 'red'));
      lines.push(`${colorize(`Cycle ${i + 1}:`, 'yellow')} ${chain}`);
    }
  }

  console.log(boxDraw(null, lines));
}
