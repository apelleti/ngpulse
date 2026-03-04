import * as path from 'node:path';
import type { GlobalOptions, ClassDeclaration } from '@ngpulse/shared';
import {
  scanFiles,
  colorize,
  createTable,
  boxDraw,
  createProject,
  addSourceFiles,
  getClasses,
  getDecorator,
  getPropsWithDecorator,
} from '@ngpulse/shared';

interface SignalCandidate {
  component: string;
  filePath: string;
  property: string;
  current: string;
  suggested: string;
  kind: 'input' | 'property';
}

function extractInputCandidates(cls: ClassDeclaration): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];

  const inputProps = getPropsWithDecorator(cls, 'Input');
  for (const prop of inputProps) {
    const name = prop.getName();
    const typeNode = prop.getTypeNode();
    const type = typeNode ? typeNode.getText() : '';
    const initializer = prop.getInitializer();
    const defaultVal = initializer ? initializer.getText() : '';

    // Check if @Input({ required: true })
    const decorator = prop.getDecorator('Input')!;
    const args = decorator.getArguments();
    let isRequired = false;
    if (args.length > 0) {
      const argText = args[0].getText();
      if (argText.includes('required') && argText.includes('true')) {
        isRequired = true;
      }
    }

    let current = `@Input() ${name}`;
    if (type) current += `: ${type}`;
    if (defaultVal) current += ` = ${defaultVal}`;

    let suggested: string;
    if (isRequired) {
      suggested = type ? `${name} = input.required<${type}>()` : `${name} = input.required()`;
    } else if (defaultVal) {
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

function extractPropertyCandidates(cls: ClassDeclaration): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];
  const SKIP_CALLS = ['inject', 'input', 'output', 'signal', 'computed', 'effect', 'model'];

  for (const prop of cls.getProperties()) {
    // Skip properties with decorators (they're handled elsewhere)
    if (prop.getDecorators().length > 0) continue;

    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const name = prop.getName();
    const value = initializer.getText().trim();

    // Skip injections and existing signals
    if (SKIP_CALLS.some(fn => value.includes(`${fn}(`))) continue;
    if (value.includes('new ')) continue;

    // Skip private properties
    const scope = prop.getScope();
    if (scope === 'private') continue;

    // Only simple primitive values or arrays/objects
    const isSimple =
      /^['"`]/.test(value) ||
      /^\d/.test(value) ||
      /^(true|false|null|undefined)$/.test(value) ||
      /^\[/.test(value) ||
      /^\{/.test(value);
    if (!isSimple) continue;

    const typeNode = prop.getTypeNode();
    const type = typeNode ? typeNode.getText() : '';
    const visibility = scope && scope !== 'public' ? `${scope} ` : '';

    const current = type ? `${visibility}${name}: ${type} = ${value}` : `${visibility}${name} = ${value}`;
    const suggested = type
      ? `${visibility}${name} = signal<${type}>(${value})`
      : `${visibility}${name} = signal(${value})`;

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
  const project = createProject();
  const sourceFiles = addSourceFiles(project, tsFiles);
  const candidates: SignalCandidate[] = [];

  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath();
    const relPath = path.relative(root, filePath);
    const baseName = path.basename(filePath).replace(/\.(component|service)\.ts$/, '');

    for (const cls of getClasses(sf)) {
      // Only process Angular classes (with @Component or @Directive or @Injectable)
      const isAngular = getDecorator(cls, 'Component') || getDecorator(cls, 'Directive') || getDecorator(cls, 'Injectable');

      const inputs = isAngular ? extractInputCandidates(cls) : [];
      const props = isAngular ? extractPropertyCandidates(cls) : [];

      for (const c of [...inputs, ...props]) {
        c.component = baseName;
        c.filePath = relPath;
        candidates.push(c);
      }
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
