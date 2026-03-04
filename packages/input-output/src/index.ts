import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import { scanFiles, readFileContent, colorize, createTable, boxDraw } from '@ngpulse/shared';

interface InputOutputEntry {
  component: string;
  filePath: string;
  name: string;
  kind: 'input' | 'output';
  used: boolean;
}

const INPUT_RE = /@Input\(\s*(?:['"`](\w+)['"`]\s*)?\)\s+(\w+)/g;
const OUTPUT_RE = /@Output\(\s*(?:['"`](\w+)['"`]\s*)?\)\s+(\w+)/g;
const SIGNAL_INPUT_RE = /(\w+)\s*=\s*input(?:<[^>]+>)?\s*\(/g;
const SIGNAL_OUTPUT_RE = /(\w+)\s*=\s*output(?:<[^>]+>)?\s*\(/g;

function extractInputsOutputs(content: string): { name: string; kind: 'input' | 'output' }[] {
  const results: { name: string; kind: 'input' | 'output' }[] = [];
  let m: RegExpExecArray | null;

  INPUT_RE.lastIndex = 0;
  while ((m = INPUT_RE.exec(content)) !== null) {
    results.push({ name: m[1] || m[2], kind: 'input' });
  }

  OUTPUT_RE.lastIndex = 0;
  while ((m = OUTPUT_RE.exec(content)) !== null) {
    results.push({ name: m[1] || m[2], kind: 'output' });
  }

  SIGNAL_INPUT_RE.lastIndex = 0;
  while ((m = SIGNAL_INPUT_RE.exec(content)) !== null) {
    results.push({ name: m[1], kind: 'input' });
  }

  SIGNAL_OUTPUT_RE.lastIndex = 0;
  while ((m = SIGNAL_OUTPUT_RE.exec(content)) !== null) {
    results.push({ name: m[1], kind: 'output' });
  }

  return results;
}

const HTML_STANDARD_ATTRS = new Set([
  'type', 'class', 'href', 'id', 'style', 'value', 'name', 'src', 'alt',
  'title', 'disabled', 'placeholder', 'hidden', 'for', 'action', 'method',
  'target', 'rel', 'media', 'lang',
]);

function isUsedInTemplate(name: string, kind: 'input' | 'output', templates: string[]): boolean {
  for (const tpl of templates) {
    if (kind === 'input') {
      // [inputName]="..."
      if (new RegExp(`\\[${name}\\]\\s*=`).test(tpl)) return true;
      // Static attribute inputName="..." — only if not a standard HTML attribute
      if (!HTML_STANDARD_ATTRS.has(name) && new RegExp(`\\b${name}\\s*=\\s*"`, 'i').test(tpl)) return true;
    } else {
      // (outputName)="..."
      if (new RegExp(`\\(${name}\\)\\s*=`).test(tpl)) return true;
    }
  }
  return false;
}

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode, more } = options;

  const tsFiles = await scanFiles(root, ['**/*.component.ts']);
  const htmlFiles = await scanFiles(root, ['**/*.html']);

  const templates: string[] = [];
  for (const f of htmlFiles) {
    templates.push(await readFileContent(f));
  }

  const entries: InputOutputEntry[] = [];

  for (const tsFile of tsFiles) {
    const content = await readFileContent(tsFile);
    const componentName = path.basename(tsFile, '.component.ts');
    const ios = extractInputsOutputs(content);

    for (const io of ios) {
      entries.push({
        component: componentName,
        filePath: path.relative(root, tsFile),
        name: io.name,
        kind: io.kind,
        used: isUsedInTemplate(io.name, io.kind, templates),
      });
    }
  }

  entries.sort((a, b) => {
    if (a.used !== b.used) return a.used ? 1 : -1;
    return a.component.localeCompare(b.component);
  });

  const totalInputs = entries.filter((e) => e.kind === 'input').length;
  const totalOutputs = entries.filter((e) => e.kind === 'output').length;
  const unusedInputs = entries.filter((e) => e.kind === 'input' && !e.used).length;
  const unusedOutputs = entries.filter((e) => e.kind === 'output' && !e.used).length;

  if (jsonMode) {
    console.log(
      JSON.stringify({
        entries,
        summary: { totalInputs, totalOutputs, unusedInputs, unusedOutputs },
      }),
    );
    return;
  }

  if (entries.length === 0) {
    console.log(colorize('No @Input() or @Output() decorators found.', 'green'));
    return;
  }

  const headers = more
    ? ['Component', 'Name', 'Kind', 'Used', 'File']
    : ['Component', 'Name', 'Kind', 'Used'];

  const rows = entries.map((e) => {
    const usedStr = e.used ? colorize('yes', 'green') : colorize('NO', 'red');
    const row = [e.component, e.name, e.kind, usedStr];
    if (more) row.push(e.filePath);
    return row;
  });

  console.log(createTable(headers, rows));
  console.log(
    boxDraw(null, [
      `Inputs:  ${totalInputs} total, ${colorize(String(unusedInputs), unusedInputs > 0 ? 'yellow' : 'green')} unused`,
      `Outputs: ${totalOutputs} total, ${colorize(String(unusedOutputs), unusedOutputs > 0 ? 'yellow' : 'green')} unused`,
    ]),
  );
}
