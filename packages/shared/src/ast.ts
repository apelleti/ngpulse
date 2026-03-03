import { Project, SyntaxKind, type SourceFile, type ObjectLiteralExpression, type Expression } from 'ts-morph';
import type { ComponentMeta, ServiceMeta } from './types';
import { scanFiles } from './fs';

export function createProject(): Project {
  return new Project({ compilerOptions: { allowJs: true, strict: false } });
}

export async function getComponents(rootDir: string, project?: Project): Promise<ComponentMeta[]> {
  const files = await scanFiles(rootDir, ['**/*.component.ts']);
  const proj = project ?? createProject();
  const components: ComponentMeta[] = [];

  for (const filePath of files) {
    try {
      const sourceFile = proj.addSourceFileAtPath(filePath);
      const meta = extractComponentMeta(sourceFile, filePath);
      if (meta) components.push(meta);
    } catch {
      // skip files that can't be parsed
    }
  }

  return components;
}

export async function getServices(rootDir: string, project?: Project): Promise<ServiceMeta[]> {
  const files = await scanFiles(rootDir, ['**/*.service.ts']);
  const proj = project ?? createProject();
  const services: ServiceMeta[] = [];

  for (const filePath of files) {
    try {
      const sourceFile = proj.addSourceFileAtPath(filePath);
      const meta = extractServiceMeta(sourceFile, filePath);
      if (meta) services.push(meta);
    } catch {
      // skip files that can't be parsed
    }
  }

  return services;
}

function extractComponentMeta(sourceFile: SourceFile, filePath: string): ComponentMeta | null {
  const classes = sourceFile.getClasses();
  for (const cls of classes) {
    const decorator = cls.getDecorator('Component');
    if (!decorator) continue;
    const args = decorator.getArguments();
    if (args.length === 0) continue;

    const obj = args[0].asKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) continue;

    return {
      name: cls.getName() || 'Anonymous',
      selector: getPropString(obj, 'selector') || '',
      standalone: getPropBool(obj, 'standalone'),
      templateUrl: getPropString(obj, 'templateUrl') || undefined,
      styleUrls: getPropStringArray(obj, 'styleUrls').concat(
        getPropStringArray(obj, 'styleUrl'),
      ),
      filePath,
      inlineTemplate: !!getPropString(obj, 'template') && !getPropString(obj, 'templateUrl'),
      inlineStyles: getPropStringArray(obj, 'styles').length > 0,
    };
  }
  return null;
}

function extractServiceMeta(sourceFile: SourceFile, filePath: string): ServiceMeta | null {
  const classes = sourceFile.getClasses();
  for (const cls of classes) {
    const decorator = cls.getDecorator('Injectable');
    if (!decorator) continue;

    const methods = cls.getMethods().map((m) => m.getName());
    const args = decorator.getArguments();
    let providedIn: string | null = null;

    if (args.length > 0) {
      const obj = args[0].asKind(SyntaxKind.ObjectLiteralExpression);
      if (obj) {
        providedIn = getPropString(obj, 'providedIn');
      }
    }

    return {
      name: cls.getName() || 'Anonymous',
      filePath,
      methods,
      providedIn,
    };
  }
  return null;
}

function getPropInitializer(obj: ObjectLiteralExpression, name: string): Expression | undefined {
  const prop = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
  return prop?.getInitializer();
}

function getPropString(obj: ObjectLiteralExpression, name: string): string | null {
  const init = getPropInitializer(obj, name);
  if (!init) return null;
  return init.getText().replace(/^['"`]|['"`]$/g, '');
}

function getPropBool(obj: ObjectLiteralExpression, name: string): boolean {
  const init = getPropInitializer(obj, name);
  if (!init) return false;
  return init.getText() === 'true';
}

function getPropStringArray(obj: ObjectLiteralExpression, name: string): string[] {
  const init = getPropInitializer(obj, name);
  if (!init) return [];
  try {
    const arr = init.asKind(SyntaxKind.ArrayLiteralExpression);
    if (!arr) {
      // single string value (styleUrl: './foo.scss')
      const text = init.getText().replace(/^['"`]|['"`]$/g, '');
      return text ? [text] : [];
    }
    return arr.getElements().map((e: Expression) => e.getText().replace(/^['"`]|['"`]$/g, ''));
  } catch {
    return [];
  }
}
