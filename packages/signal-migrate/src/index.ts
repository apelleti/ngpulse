import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface SignalCandidate {
  component: string;
  filePath: string;
  property: string;
  current: string;
  suggested: string;
  kind: 'input' | 'property';
}

const INPUT_DECORATOR_RE =
  /@Input\(\s*(?:\{[^}]*\}\s*|['"`]\w+['"`]\s*)?\)\s+(\w+)\s*(?::\s*([^;=]+?))?(?:\s*=\s*([^;]+))?\s*;/g;
const SIMPLE_PROP_RE =
  /^\s+((?:public|protected|private)\s+)?(?:readonly\s+)?(\w+)\s*(?::\s*(\w[\w<>[\], |&?]*))?\s*=\s*([^;]+);/gm;

function extractInputCandidates(content: string): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];
  let m: RegExpExecArray | null;

  INPUT_DECORATOR_RE.lastIndex = 0;
  while ((m = INPUT_DECORATOR_RE.exec(content)) !== null) {
    const name = m[1];
    const type = m[2]?.trim();
    const defaultVal = m[3]?.trim();

    let current = `@Input() ${name}`;
    if (type) current += `: ${type}`;
    if (defaultVal) current += ` = ${defaultVal}`;

    let suggested: string;
    if (defaultVal) {
      suggested = type ? `${name} = input<${type}>(${defaultVal})` : `${name} = input(${defaultVal})`;
    } else {
      suggested = type ? `${name} = input<${type}>()` : `${name} = input()`;
    }

    candidates.push({
      component: '',
      filePath: '',
      property: name,
      current,
      suggested,
      kind: 'input',
    });
  }

  return candidates;
}

function extractPropertyCandidates(content: string): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];

  // Only look inside class bodies
  const classMatch = content.match(/class\s+\w+[^{]*\{/);
  if (!classMatch || classMatch.index === undefined) return candidates;

  const classStart = classMatch.index + classMatch[0].length;
  const classBody = content.slice(classStart);

  let m: RegExpExecArray | null;
  SIMPLE_PROP_RE.lastIndex = 0;
  while ((m = SIMPLE_PROP_RE.exec(classBody)) !== null) {
    const visibility = m[1]?.trim() || '';
    const name = m[2];
    const type = m[3]?.trim();
    const value = m[4]?.trim();

    // Skip injections, decorators, complex expressions
    if (!value) continue;
    if (value.includes('inject(')) continue;
    if (value.includes('input(') || value.includes('output(') || value.includes('signal(')) continue;
    if (value.includes('computed(') || value.includes('effect(')) continue;
    if (value.includes('new ')) continue;
    if (visibility === 'private') continue;

    // Only simple primitive values or arrays/objects
    const isSimple =
      /^['"`]/.test(value) ||
      /^\d/.test(value) ||
      /^(true|false|null|undefined)$/.test(value) ||
      /^\[/.test(value) ||
      /^\{/.test(value);
    if (!isSimple) continue;

    const prefix = visibility ? `${visibility} ` : '';
    const current = type ? `${prefix}${name}: ${type} = ${value}` : `${prefix}${name} = ${value}`;

    const suggested = type
      ? `${prefix}${name} = signal<${type}>(${value})`
      : `${prefix}${name} = signal(${value})`;

    candidates.push({
      component: '',
      filePath: '',
      property: name,
      current,
      suggested,
      kind: 'property',
    });
  }

  return candidates;
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode, more } = options;

  const tsFiles = await scanFiles(root, ['**/*.component.ts', '**/*.service.ts']);
  const candidates: SignalCandidate[] = [];

  for (const file of tsFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const baseName = path.basename(file).replace(/\.(component|service)\.ts$/, '');

    const inputs = extractInputCandidates(content);
    const props = extractPropertyCandidates(content);

    for (const c of [...inputs, ...props]) {
      c.component = baseName;
      c.filePath = relPath;
      candidates.push(c);
    }
  }

  candidates.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'input' ? -1 : 1;
    return a.component.localeCompare(b.component);
  });

  if (jsonMode) {
    console.log(JSON.stringify(candidates));
    return;
  }

  if (candidates.length === 0) {
    console.log(colorize('No signal migration candidates found \u2713', 'green'));
    return;
  }

  const headers = more
    ? ['Component', 'Property', 'Kind', 'Current', 'Suggested', 'File']
    : ['Component', 'Property', 'Kind', 'Suggested'];

  const rows = candidates.map((c) => {
    const row = [
      c.component,
      c.property,
      colorize(c.kind, c.kind === 'input' ? 'yellow' : 'cyan'),
    ];
    if (more) row.push(c.current);
    row.push(c.suggested);
    if (more) row.push(c.filePath);
    return row;
  });

  console.log(createTable(headers, rows));

  const inputCount = candidates.filter((c) => c.kind === 'input').length;
  const propCount = candidates.filter((c) => c.kind === 'property').length;

  console.log(
    boxDraw(null, [
      `${colorize(String(inputCount), 'yellow')} @Input() \u2192 input()`,
      `${colorize(String(propCount), 'cyan')} properties \u2192 signal()`,
      `${candidates.length} total candidates`,
    ]),
  );
}
