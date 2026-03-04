import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';
import {
  scanFiles,
  readFileContent,
  colorize,
  createTable,
  boxDraw,
  createProject,
  addSourceFiles,
  getClasses,
  getDecorator,
  getDecoratorProp,
  getPropsWithDecorator,
  getConstructorParams,
} from '@ngpulse/shared';

interface MigrationHint {
  file: string;
  line: number;
  priority: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'cyan'> = {
  high: 'red',
  medium: 'yellow',
  low: 'cyan',
};

export async function run(options: GlobalOptions): Promise<void> {
  const { root, json: jsonMode, more } = options;

  const tsFiles = await scanFiles(root, ['**/*.ts']);
  const sourceFiles = tsFiles.filter(
    (f) => !f.endsWith('.spec.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
  );

  const project = createProject();
  const sfList = addSourceFiles(project, sourceFiles);
  const hints: MigrationHint[] = [];

  for (const sf of sfList) {
    const filePath = sf.getFilePath();
    const relPath = path.relative(root, filePath);

    for (const cls of getClasses(sf)) {
      // HIGH: NgModule with declarations
      const ngModuleDec = getDecorator(cls, 'NgModule');
      if (ngModuleDec) {
        const declProp = getDecoratorProp(ngModuleDec, 'declarations');
        if (declProp && declProp !== '[]') {
          hints.push({
            file: relPath,
            line: ngModuleDec.getStartLineNumber(),
            priority: 'high',
            message: 'NgModule with declarations could use standalone components',
            suggestion: 'Convert declared components to standalone and remove NgModule',
          });
        }
      }

      // HIGH: HttpClientModule import (check in NgModule imports or direct import)
      if (ngModuleDec) {
        const importsProp = getDecoratorProp(ngModuleDec, 'imports');
        if (importsProp && importsProp.includes('HttpClientModule')) {
          hints.push({
            file: relPath,
            line: ngModuleDec.getStartLineNumber(),
            priority: 'high',
            message: 'HttpClientModule is legacy',
            suggestion: 'Replace with provideHttpClient() in providers',
          });
        }
      }

      // Also detect HttpClientModule in file-level imports
      for (const imp of sf.getImportDeclarations()) {
        const namedImports = imp.getNamedImports().map(n => n.getName());
        if (namedImports.includes('HttpClientModule')) {
          hints.push({
            file: relPath,
            line: imp.getStartLineNumber(),
            priority: 'high',
            message: 'HttpClientModule is legacy',
            suggestion: 'Replace with provideHttpClient() in providers',
          });
        }
      }

      // MEDIUM: Constructor injection
      const params = getConstructorParams(cls);
      const typedParams = params.filter(p => {
        const typeNode = p.getTypeNode();
        return typeNode && /^[A-Z]/.test(typeNode.getText());
      });
      if (typedParams.length > 0) {
        const ctor = cls.getConstructors()[0];
        hints.push({
          file: relPath,
          line: ctor ? ctor.getStartLineNumber() : cls.getStartLineNumber(),
          priority: 'medium',
          message: `Constructor injection (${typedParams.length} param${typedParams.length > 1 ? 's' : ''})`,
          suggestion: 'Migrate to inject() function',
        });
      }

      // MEDIUM: @Input() / @Output() decorators
      const inputProps = getPropsWithDecorator(cls, 'Input');
      const outputProps = getPropsWithDecorator(cls, 'Output');
      if (inputProps.length > 0 || outputProps.length > 0) {
        const parts: string[] = [];
        if (inputProps.length > 0) parts.push(`${inputProps.length} @Input()`);
        if (outputProps.length > 0) parts.push(`${outputProps.length} @Output()`);
        hints.push({
          file: relPath,
          line: 1,
          priority: 'medium',
          message: `${parts.join(' / ')} decorator${inputProps.length + outputProps.length > 1 ? 's' : ''} found`,
          suggestion: 'Migrate to input()/output() signal functions',
        });
      }
    }
  }

  // Also scan HTML for ngModel usage
  const htmlFiles = await scanFiles(root, ['**/*.component.html']);
  for (const file of htmlFiles) {
    const content = await readFileContent(file);
    const relPath = path.relative(root, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (/\[\(ngModel\)\]/.test(lines[i])) {
        hints.push({
          file: relPath,
          line: i + 1,
          priority: 'low',
          message: 'ngModel usage — ensure FormsModule is imported',
          suggestion: 'Verify FormsModule import or migrate to reactive forms',
        });
      }
    }
  }

  // Deduplicate: keep only first occurrence of each (file, message) pair
  const seenHints = new Set<string>();
  const dedupedHints: MigrationHint[] = [];
  for (const hint of hints) {
    const key = `${hint.file}::${hint.message}`;
    if (!seenHints.has(key)) {
      seenHints.add(key);
      dedupedHints.push(hint);
    }
  }
  hints.length = 0;
  hints.push(...dedupedHints);

  hints.sort((a, b) => {
    const pri = { high: 0, medium: 1, low: 2 };
    return pri[a.priority] - pri[b.priority] || a.file.localeCompare(b.file);
  });

  if (jsonMode) {
    console.log(JSON.stringify(hints));
    return;
  }

  if (hints.length === 0) {
    console.log(colorize('No migration hints found — project is up to date \u2713', 'green'));
    return;
  }

  const headers = more
    ? ['Priority', 'File', 'Line', 'Message', 'Suggestion']
    : ['Priority', 'File', 'Line', 'Message'];

  const rows = hints.map((h) => {
    const row = [
      colorize(h.priority.toUpperCase(), PRIORITY_COLORS[h.priority]),
      h.file,
      String(h.line),
      h.message,
    ];
    if (more) row.push(h.suggestion);
    return row;
  });

  console.log(createTable(headers, rows));

  const high = hints.filter((h) => h.priority === 'high').length;
  const medium = hints.filter((h) => h.priority === 'medium').length;
  const low = hints.filter((h) => h.priority === 'low').length;

  console.log(
    boxDraw(null, [
      `${colorize(String(high), 'red')} high  ${colorize(String(medium), 'yellow')} medium  ${colorize(String(low), 'cyan')} low`,
      `${hints.length} total migration opportunities`,
    ]),
  );
}
