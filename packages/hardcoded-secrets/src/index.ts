import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface SecretFinding {
  file: string;
  line: number;
  type: string;
  value: string;
  lineContext?: string;
}

const SECRET_VAR_RE =
  /(?:api[_-]?key|token|secret|password|apikey|auth[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*['"`]([^'"`]{12,})['"`]/gi;

const JSON_SECRET_RE =
  /"(?:api[_-]?key|token|secret|password|apikey|auth[_-]?key)\s*"\s*:\s*"([^"]{16,})"/gi;

const NON_SECRET_RE = /^(Bearer|Authorization|Content-Type)$/;

function isLikelySecret(value: string): boolean {
  if (NON_SECRET_RE.test(value)) return false;
  // All lowercase letters without numbers/special chars — likely a label
  if (/^[a-z]+$/.test(value)) return false;
  // Only word chars and < 16 chars — too short for a real API key
  if (/^\w+$/.test(value) && value.length < 16) return false;
  return true;
}
const CRED_URL_RE = /https?:\/\/[^:]+:[^@]+@[^\s'"]+/g;
const PRIVATE_KEY_RE = /-----BEGIN\s+[\w\s]*PRIVATE KEY-----/;
const JWT_RE = /['"`](eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})['"`]/g;

function redact(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '***' + value.slice(-4);
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode, more } = options;

  const files = await scanFiles(root, ['**/*.ts', '**/*.html', '**/*.json', '**/*.env', '**/.env', '**/.env.*']);
  const sourceFiles = files.filter(
    (f) =>
      !f.endsWith('.spec.ts') &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.d.ts') &&
      !f.includes('node_modules') &&
      !f.includes('/dist/'),
  );

  const findings: SecretFinding[] = [];

  for (const file of sourceFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for secret-like variable assignments
      SECRET_VAR_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = SECRET_VAR_RE.exec(line)) !== null) {
        if (!isLikelySecret(m[1])) continue;
        findings.push({
          file: relPath,
          line: lineNum,
          type: 'hardcoded-secret',
          value: redact(m[1]),
          lineContext: line.trim().replace(m[1], redact(m[1])),
        });
      }

      // Check for URLs with credentials
      CRED_URL_RE.lastIndex = 0;
      while ((m = CRED_URL_RE.exec(line)) !== null) {
        findings.push({
          file: relPath,
          line: lineNum,
          type: 'url-credentials',
          value: redact(m[0]),
          lineContext: line.trim(),
        });
      }

      // Check for private key headers
      if (PRIVATE_KEY_RE.test(line)) {
        findings.push({
          file: relPath,
          line: lineNum,
          type: 'private-key',
          value: '-----BEGIN PRIVATE KEY-----',
          lineContext: line.trim(),
        });
      }

      // Check for JWT tokens
      JWT_RE.lastIndex = 0;
      while ((m = JWT_RE.exec(line)) !== null) {
        if (m[1].length > 100) {
          findings.push({
            file: relPath,
            line: lineNum,
            type: 'jwt-token',
            value: redact(m[1]),
            lineContext: line.trim().replace(m[1], redact(m[1])),
          });
        }
      }

      // Check for JSON-style key-value pairs in .json files
      if (file.endsWith('.json')) {
        JSON_SECRET_RE.lastIndex = 0;
        while ((m = JSON_SECRET_RE.exec(line)) !== null) {
          if (!isLikelySecret(m[1])) continue;
          findings.push({
            file: relPath,
            line: lineNum,
            type: 'hardcoded-secret',
            value: redact(m[1]),
            lineContext: line.trim().replace(m[1], redact(m[1])),
          });
        }
      }
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (jsonMode) {
    console.log(JSON.stringify(findings));
    return;
  }

  if (findings.length === 0) {
    console.log(colorize('No hardcoded secrets detected \u2713', 'green'));
    return;
  }

  const headers = more
    ? ['File', 'Line', 'Type', 'Value (redacted)', 'Context']
    : ['File', 'Line', 'Type', 'Value (redacted)'];

  const rows = findings.map((f) => {
    const row = [f.file, String(f.line), colorize(f.type, 'red'), f.value];
    if (more && f.lineContext) row.push(f.lineContext);
    return row;
  });

  console.log(createTable(headers, rows));

  console.log(
    boxDraw(null, [
      `${colorize(String(findings.length), 'red')} potential secret${findings.length !== 1 ? 's' : ''} found`,
      'Move secrets to environment variables or a secrets manager',
    ]),
  );
}
