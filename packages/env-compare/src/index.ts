import * as path from 'node:path';
import {
  type GlobalOptions,
  scanFiles,
  readFileContent,
  createTable,
  colorize,
} from '@ngpulse/shared';

interface EnvFileKeys {
  filePath: string;
  fileName: string;
  keys: Set<string>;
}

interface EnvMatrix {
  allKeys: string[];
  files: { fileName: string; filePath: string }[];
  matrix: Record<string, Record<string, boolean>>;
}

function removeNestedBlocks(content: string): string {
  let result = '';
  let depth = 0;
  for (const ch of content) {
    if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
    } else if (depth === 0) {
      result += ch;
    }
  }
  return result;
}

const STRIP_SINGLE_QUOTES = /'(?:[^'\\]|\\.)*'/g;
const STRIP_DOUBLE_QUOTES = /"(?:[^"\\]|\\.)*"/g;
const STRIP_TEMPLATE_LITERALS = /`(?:[^`\\]|\\.)*`/g;

function stripStringLiterals(content: string): string {
  return content
    .replace(STRIP_SINGLE_QUOTES, "''")
    .replace(STRIP_DOUBLE_QUOTES, '""')
    .replace(STRIP_TEMPLATE_LITERALS, '``');
}

function extractObjectKeys(content: string): string[] {
  const keys: string[] = [];

  // Match the exported environment object, supporting:
  // 1. `export const environment = { ... }`
  // 2. `export const environment: SomeType = { ... }`
  // 3. `export default { ... }`
  let objectMatch = content.match(
    /export\s+const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*\{([\s\S]*?)\};/,
  );
  if (!objectMatch) {
    // Fallback: match without trailing semicolon (e.g. some formatters omit it)
    objectMatch = content.match(
      /export\s+const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*\{([\s\S]*)\}/,
    );
  }
  if (!objectMatch) {
    objectMatch = content.match(
      /export\s+default\s+\{([\s\S]*?)\};/,
    );
  }
  if (!objectMatch) {
    objectMatch = content.match(
      /export\s+default\s+\{([\s\S]*)\}/,
    );
  }
  if (!objectMatch) return keys;

  const body = objectMatch[1];

  // Strip string literals first to avoid false matches from string content
  const sanitized = stripStringLiterals(body);

  // Strip nested objects/arrays so we only extract top-level keys
  const topLevel = removeNestedBlocks(sanitized);

  // Match key-value pairs: key: value, or 'key': value, or "key": value
  // Handles keys followed by colons (standard object literal syntax)
  const keyRegex = /(?:^|,|\n)\s*(['"]?)(\w+)\1\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(topLevel)) !== null) {
    keys.push(match[2]);
  }

  return keys;
}

async function parseEnvFiles(root: string): Promise<EnvFileKeys[]> {
  // Scan recursively — works for both standard Angular and Nx multi-project workspaces
  const envFiles = await scanFiles(root, ['**/environment*.ts']);
  const results: EnvFileKeys[] = [];

  for (const filePath of envFiles) {
    let content: string;
    try {
      content = await readFileContent(filePath);
    } catch {
      continue;
    }
    const keys = extractObjectKeys(content);
    results.push({
      filePath,
      fileName: path.basename(filePath),
      keys: new Set(keys),
    });
  }

  // Sort by filename for consistent output
  results.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return results;
}

function buildMatrix(envFiles: EnvFileKeys[]): EnvMatrix {
  const allKeysSet = new Set<string>();
  for (const env of envFiles) {
    for (const key of env.keys) {
      allKeysSet.add(key);
    }
  }
  const allKeys = Array.from(allKeysSet).sort();

  const files = envFiles.map((e) => ({
    fileName: e.fileName,
    filePath: e.filePath,
  }));

  const matrix: Record<string, Record<string, boolean>> = {};
  for (const key of allKeys) {
    matrix[key] = {};
    for (const env of envFiles) {
      matrix[key][env.fileName] = env.keys.has(key);
    }
  }

  return { allKeys, files, matrix };
}

function buildMissingSummary(
  envMatrix: EnvMatrix,
): { fileName: string; missingKeys: string[] }[] {
  const summary: { fileName: string; missingKeys: string[] }[] = [];
  for (const file of envMatrix.files) {
    const missing = envMatrix.allKeys.filter(
      (key) => !envMatrix.matrix[key][file.fileName],
    );
    if (missing.length > 0) {
      summary.push({ fileName: file.fileName, missingKeys: missing });
    }
  }
  return summary;
}

export async function run(options: GlobalOptions): Promise<void> {
  const envFiles = await parseEnvFiles(options.root);
  if (options.verbose) console.error(`Found ${envFiles.length} environment file(s).`);

  if (envFiles.length === 0) {
    console.log('No environment*.ts files found.');
    return;
  }

  const envMatrix = buildMatrix(envFiles);

  if (options.json) {
    const jsonOutput = {
      files: envMatrix.files,
      keys: envMatrix.allKeys,
      matrix: envMatrix.matrix,
      missing: buildMissingSummary(envMatrix),
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Build table
  const fileNames = envMatrix.files.map((f) => f.fileName);
  const headers = ['Key', ...fileNames];

  const rows: string[][] = envMatrix.allKeys.map((key) => {
    const cells = envMatrix.files.map((file) => {
      const present = envMatrix.matrix[key][file.fileName];
      return present ? colorize('\u2713', 'green') : colorize('\u2717', 'red');
    });
    return [key, ...cells];
  });

  console.log('');
  console.log(colorize('Environment File Comparison', 'cyan'));
  console.log('');
  console.log(createTable(headers, rows));

  // Summary of missing keys per file
  const missingSummary = buildMissingSummary(envMatrix);
  if (missingSummary.length > 0) {
    console.log('');
    console.log(colorize('Missing Keys Summary', 'yellow'));
    console.log('');
    for (const entry of missingSummary) {
      console.log(
        `  ${colorize(entry.fileName, 'red')}: missing ${colorize(String(entry.missingKeys.length), 'red')} key(s)`,
      );
      for (const key of entry.missingKeys) {
        console.log(`    - ${key}`);
      }
    }
  } else {
    console.log('');
    console.log(colorize('All environment files have the same keys.', 'green'));
  }

  console.log('');
}
