import * as path from 'node:path';
import {
  scanFiles,
  readFileContent,
  getFileSize,
  createTable,
  formatBytes,
  colorize,
} from '@ngtk/shared';
import type { GlobalOptions, OrphanFile } from '@ngtk/shared';

const EXCLUDED_BASENAMES = new Set([
  'main.ts',
  'polyfills.ts',
]);

function isExcluded(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (EXCLUDED_BASENAMES.has(basename)) return true;
  if (basename.endsWith('.spec.ts')) return true;
  if (basename.endsWith('.test.ts')) return true;
  if (filePath.includes('/environments/')) return true;
  return false;
}

function resolveImportPath(importStr: string, fromFile: string): string {
  if (!importStr.startsWith('.')) return importStr;
  const dir = path.dirname(fromFile);
  return path.resolve(dir, importStr);
}

function extractReferences(content: string, filePath: string): Set<string> {
  const refs = new Set<string>();

  // Match ES import statements: import ... from '...'
  const importRegex = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = resolveImportPath(importPath, filePath);
      refs.add(resolved);
      // Also add with common extensions since imports often omit them
      refs.add(resolved + '.ts');
      refs.add(resolved + '.js');
      // Handle directory index imports
      refs.add(path.join(resolved, 'index.ts'));
      refs.add(path.join(resolved, 'index.js'));
    }
  }

  // Match dynamic imports: import('...')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = resolveImportPath(importPath, filePath);
      refs.add(resolved);
      refs.add(resolved + '.ts');
      refs.add(resolved + '.js');
    }
  }

  // Match templateUrl references: templateUrl: '...'
  const templateUrlRegex = /templateUrl\s*:\s*['"]([^'"]+)['"]/g;
  while ((match = templateUrlRegex.exec(content)) !== null) {
    const refPath = match[1];
    const resolved = resolveImportPath(refPath, filePath);
    refs.add(resolved);
  }

  // Match styleUrls references: styleUrls: ['...']
  const styleUrlsRegex = /styleUrls\s*:\s*\[([^\]]*)\]/g;
  while ((match = styleUrlsRegex.exec(content)) !== null) {
    const urlsContent = match[1];
    const urlRegex = /['"]([^'"]+)['"]/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlRegex.exec(urlsContent)) !== null) {
      const resolved = resolveImportPath(urlMatch[1], filePath);
      refs.add(resolved);
    }
  }

  // Match styleUrl (singular): styleUrl: '...'
  const styleUrlRegex = /styleUrl\s*:\s*['"]([^'"]+)['"]/g;
  while ((match = styleUrlRegex.exec(content)) !== null) {
    const resolved = resolveImportPath(match[1], filePath);
    refs.add(resolved);
  }

  // Match re-export statements: export { ... } from '...' and export * from '...'
  const reExportRegex = /export\s+(?:\{[\s\S]*?\}|\*)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = resolveImportPath(importPath, filePath);
      refs.add(resolved);
      refs.add(resolved + '.ts');
      refs.add(resolved + '.js');
      refs.add(path.join(resolved, 'index.ts'));
      refs.add(path.join(resolved, 'index.js'));
    }
  }

  // Match require() calls
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = resolveImportPath(importPath, filePath);
      refs.add(resolved);
      refs.add(resolved + '.ts');
      refs.add(resolved + '.js');
    }
  }

  return refs;
}

export async function run(options: GlobalOptions): Promise<void> {
  const allFiles = await scanFiles(options.root, [
    '**/*.ts',
    '**/*.html',
    '**/*.scss',
  ]);

  // Filter out excluded files
  const candidateFiles = allFiles.filter((f) => !isExcluded(f));

  // Read all .ts files to build reference set
  const tsFiles = allFiles.filter((f) => f.endsWith('.ts'));
  const allRefs = new Set<string>();
  const referencedBasenames = new Set<string>();

  for (const tsFile of tsFiles) {
    const content = await readFileContent(tsFile);
    const refs = extractReferences(content, tsFile);
    for (const ref of refs) {
      allRefs.add(ref);
      // Store basename for loose matching (handles barrel re-exports)
      referencedBasenames.add(path.basename(ref));
    }
  }

  // Determine orphans
  const orphans: OrphanFile[] = [];
  for (const file of candidateFiles) {
    const ext = path.extname(file);
    let isReferenced = false;

    // Check by absolute path match
    if (allRefs.has(file)) {
      isReferenced = true;
    }

    // For .ts files: check if basename (with or without extension) is referenced
    if (!isReferenced && ext === '.ts') {
      const basename = path.basename(file);
      const basenameNoExt = path.basename(file, '.ts');
      if (referencedBasenames.has(basename) || referencedBasenames.has(basenameNoExt)) {
        isReferenced = true;
      }
    }

    // For .html/.scss files: check if the path or basename is referenced
    if (!isReferenced && (ext === '.html' || ext === '.scss')) {
      const basename = path.basename(file);
      if (referencedBasenames.has(basename)) {
        isReferenced = true;
      }
    }

    if (!isReferenced) {
      const size = await getFileSize(file);
      orphans.push({
        filePath: path.relative(options.root, file),
        size,
        extension: ext,
      });
    }
  }

  // Sort by size descending
  orphans.sort((a, b) => b.size - a.size);

  if (options.json) {
    console.log(JSON.stringify(orphans, null, 2));
    return;
  }

  if (orphans.length === 0) {
    console.log(colorize('No orphan files found.', 'green'));
    return;
  }

  const totalSize = orphans.reduce((sum, o) => sum + o.size, 0);
  const rows = orphans.map((o) => [
    o.filePath,
    colorize(o.extension, 'yellow'),
    formatBytes(o.size),
  ]);

  console.log(createTable(['File', 'Extension', 'Size'], rows));
  console.log();
  console.log(
    `Found ${colorize(String(orphans.length), 'yellow')} orphan file(s). ` +
    `Total recoverable size: ${colorize(formatBytes(totalSize), 'cyan')}`,
  );
}
