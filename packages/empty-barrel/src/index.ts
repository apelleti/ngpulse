import * as path from 'node:path';
import {
  scanFiles,
  readFileContent,
  getServices,
  createTable,
  colorize,
} from '@ngpulse/shared';
import type { GlobalOptions, EmptyBarrel } from '@ngpulse/shared';

function isEmptyScss(content: string): boolean {
  // Strip single-line comments
  let stripped = content.replace(/\/\/.*$/gm, '');
  // Strip multi-line comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  return stripped.trim().length === 0;
}

function isTrivialSpec(content: string): boolean {
  // Check if the spec has only a "should create" test with a simple toBeTruthy assertion
  const itBlocks = content.match(/it\s*\(/g);
  if (!itBlocks || itBlocks.length !== 1) return false;

  // Check that the single it() block is a "should create" or "should be created" test
  const shouldCreateMatch = content.match(
    /it\s*\(\s*['"]should (?:create|be created)['"]/,
  );
  if (!shouldCreateMatch) return false;

  // Check for minimal assertion patterns
  const hasTrivialAssertion =
    /expect\s*\(\s*(?:component|service|pipe|directive|guard)\s*\)\s*\.toBeTruthy\s*\(\s*\)/.test(content) ||
    /expect\s*\(\s*(?:component|service|pipe|directive|guard)\s*\)\s*\.toBeDefined\s*\(\s*\)/.test(content);

  return hasTrivialAssertion;
}

function isEmptyTemplate(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return true;

  // Check for placeholder patterns like <p>component works!</p>
  const placeholderRegex = /^<p>\s*\w[\w-]*\s+works!?\s*<\/p>$/i;
  if (placeholderRegex.test(trimmed)) return true;

  // Check for templates containing only <router-outlet></router-outlet>
  if (/^\s*<router-outlet\s*><\/router-outlet>\s*$/i.test(trimmed)) return true;

  // Check for templates containing only HTML comments
  const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (withoutComments.length === 0) return true;

  return false;
}

function colorForType(type: EmptyBarrel['type']): 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'gray' | 'white' {
  switch (type) {
    case 'empty-style':
      return 'magenta';
    case 'trivial-spec':
      return 'yellow';
    case 'empty-service':
      return 'red';
    case 'empty-template':
      return 'cyan';
    default:
      return 'white';
  }
}

export async function run(options: GlobalOptions): Promise<void> {
  if (options.verbose) console.error('Scanning for empty/boilerplate files...');
  const results: EmptyBarrel[] = [];

  // 1. Empty SCSS files
  const scssFiles = await scanFiles(options.root, ['**/*.scss']);
  for (const file of scssFiles) {
    let content: string;
    try {
      content = await readFileContent(file);
    } catch {
      continue;
    }
    if (isEmptyScss(content)) {
      results.push({
        filePath: path.relative(options.root, file),
        reason: 'Stylesheet is empty or contains only comments',
        type: 'empty-style',
      });
    }
  }

  // 2. Trivial spec files
  const specFiles = await scanFiles(options.root, ['**/*.spec.ts']);
  for (const file of specFiles) {
    let content: string;
    try {
      content = await readFileContent(file);
    } catch {
      continue;
    }
    if (isTrivialSpec(content)) {
      results.push({
        filePath: path.relative(options.root, file),
        reason: 'Spec only contains a trivial "should create" test',
        type: 'trivial-spec',
      });
    }
  }

  // 3. Empty services (no methods)
  const services = await getServices(options.root);
  for (const svc of services) {
    if (svc.methods.length === 0) {
      results.push({
        filePath: path.relative(options.root, svc.filePath),
        reason: `Service "${svc.name}" has no methods`,
        type: 'empty-service',
      });
    }
  }

  // 4. Empty templates
  const templateFiles = await scanFiles(options.root, ['**/*.component.html']);
  for (const file of templateFiles) {
    let content: string;
    try {
      content = await readFileContent(file);
    } catch {
      continue;
    }
    if (isEmptyTemplate(content)) {
      results.push({
        filePath: path.relative(options.root, file),
        reason: 'Template is empty or contains only placeholder content',
        type: 'empty-template',
      });
    }
  }

  // Sort by type then by file path
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.filePath.localeCompare(b.filePath);
  });

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(colorize('No empty or boilerplate files found.', 'green'));
    return;
  }

  const rows = results.map((r) => [
    r.filePath,
    colorize(r.type, colorForType(r.type)),
    r.reason,
  ]);

  console.log(createTable(['File', 'Type', 'Reason'], rows));
  console.log();

  // Summary by category
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  const summary = Object.entries(counts)
    .map(([type, count]) => `${colorize(String(count), 'yellow')} ${type}`)
    .join(', ');

  console.log(`Found ${colorize(String(results.length), 'yellow')} boilerplate file(s): ${summary}`);
}
