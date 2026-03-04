import * as path from 'node:path';
import {
  scanFiles,
  readFileContent,
  createTable,
  colorize,
} from '@ngpulse/shared';
import type { GlobalOptions, DeadCssResult } from '@ngpulse/shared';

const PSEUDO_CLASSES = new Set([
  'hover', 'focus', 'active', 'visited', 'first-child', 'last-child',
  'nth-child', 'not', 'before', 'after', 'placeholder', 'disabled',
  'enabled', 'checked', 'invalid', 'valid', 'required', 'optional',
  'first-of-type', 'last-of-type', 'only-child', 'empty', 'root',
  'focus-within', 'focus-visible', 'is', 'where', 'has',
]);

function extractDeclaredClasses(scssContent: string): string[] {
  const classes = new Set<string>();

  // Remove single-line comments
  let content = scssContent.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove strings to avoid false matches
  content = content.replace(/'[^']*'/g, '""');
  content = content.replace(/"[^"]*"/g, '""');
  // Remove @extend references (these are usages, not declarations)
  content = content.replace(/@extend\s+\.[a-zA-Z_][\w-]*/g, '');

  // Match CSS class selectors: .className (possibly followed by braces, comma, pseudo-selector, etc.)
  // Careful to avoid matching color hex values like .5rem, or @extend .class
  const classRegex = /\.([a-zA-Z_][\w-]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    if (!PSEUDO_CLASSES.has(className)) {
      classes.add(className);
    }
  }

  return Array.from(classes);
}

function hasDynamicClassBinding(htmlContent: string): boolean {
  // [class]="expr" (not [class.x]="expr") indicates fully dynamic class assignment
  if (/\[class\]\s*=\s*"/.test(htmlContent)) return true;

  // [ngClass] with non-literal expressions (variables, ternaries, function calls) are too dynamic
  const ngClassRegex = /\[ngClass\]\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = ngClassRegex.exec(htmlContent)) !== null) {
    const value = match[1].trim();
    // Object literals, string literals, and array literals are safe to analyze
    if (/^[{[']/.test(value)) continue;
    // Everything else (variables, ternaries, function calls) is dynamic
    return true;
  }

  return false;
}

function extractUsedClasses(htmlContent: string): string[] {
  const classes = new Set<string>();

  // Match class="..." attribute values
  const classAttrRegex = /class\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = classAttrRegex.exec(htmlContent)) !== null) {
    const classValue = match[1];
    // Split by whitespace to get individual class names
    const classNames = classValue.trim().split(/\s+/);
    for (const cls of classNames) {
      if (cls.length > 0) {
        classes.add(cls);
      }
    }
  }

  // Match class='...' (single quotes)
  const classAttrSingleRegex = /class\s*=\s*'([^']*)'/gi;
  while ((match = classAttrSingleRegex.exec(htmlContent)) !== null) {
    const classValue = match[1];
    const classNames = classValue.trim().split(/\s+/);
    for (const cls of classNames) {
      if (cls.length > 0) {
        classes.add(cls);
      }
    }
  }

  // Match [class.className]="expr" bindings
  const classBindingRegex = /\[class\.([a-zA-Z_][\w-]*)\]/g;
  while ((match = classBindingRegex.exec(htmlContent)) !== null) {
    classes.add(match[1]);
  }

  // Match [ngClass] bindings: [ngClass]="{ 'class-name': condition }" or [ngClass]="'class-name'"
  const ngClassRegex = /\[ngClass\]\s*=\s*"([^"]*)"/gi;
  while ((match = ngClassRegex.exec(htmlContent)) !== null) {
    const ngClassValue = match[1];

    // Extract class names from object literal: { 'class-name': expr, className: expr }
    const objectKeyRegex = /['"]?([\w-]+)['"]?\s*:/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = objectKeyRegex.exec(ngClassValue)) !== null) {
      classes.add(keyMatch[1]);
    }

    // Extract class names from string literal: 'class1 class2'
    const stringLiteralRegex = /^'([^']*)'$/;
    const strMatch = ngClassValue.match(stringLiteralRegex);
    if (strMatch) {
      const classNames = strMatch[1].trim().split(/\s+/);
      for (const cls of classNames) {
        if (cls.length > 0) {
          classes.add(cls);
        }
      }
    }

    // Extract class names from array: ['class1', 'class2']
    const arrayItemRegex = /['"]([a-zA-Z_][\w-]*)['"]/g;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = arrayItemRegex.exec(ngClassValue)) !== null) {
      classes.add(arrMatch[1]);
    }
  }

  return Array.from(classes);
}

export async function run(options: GlobalOptions): Promise<void> {
  const styleFiles = await scanFiles(options.root, ['**/*.component.scss', '**/*.component.css']);
  if (options.verbose) console.error(`Scanning ${styleFiles.length} component style files...`);
  const results: DeadCssResult[] = [];

  for (const styleFile of styleFiles) {
    const styleContent = await readFileContent(styleFile);
    const declared = extractDeclaredClasses(styleContent);

    if (declared.length === 0) continue;

    // Find corresponding HTML template
    const htmlFile = styleFile.replace(/\.(?:scss|css)$/, '.html');
    let htmlContent: string;
    try {
      htmlContent = await readFileContent(htmlFile);
    } catch {
      htmlContent = ''; // No HTML template found — still check inline template
    }

    // Find corresponding TypeScript file for inline templates and dynamic class usage
    const tsFile = styleFile.replace(/\.(?:scss|css)$/, '.ts');
    let tsContent = '';
    try {
      tsContent = await readFileContent(tsFile);
    } catch { /* no TS file */ }

    // Extract inline template from TS file if present
    let inlineTemplateContent = '';
    if (tsContent) {
      // Match template: '...' or template: `...`
      const templateSingleMatch = tsContent.match(/template\s*:\s*'((?:[^'\\]|\\.)*)'/);
      const templateBacktickMatch = tsContent.match(/template\s*:\s*`([\s\S]*?)`/);
      if (templateBacktickMatch) {
        inlineTemplateContent = templateBacktickMatch[1];
      } else if (templateSingleMatch) {
        inlineTemplateContent = templateSingleMatch[1];
      }
    }

    const combinedHtml = htmlContent + '\n' + inlineTemplateContent;

    // Skip components with [class]="expr" binding — too dynamic to analyze
    if (hasDynamicClassBinding(combinedHtml)) continue;

    const used = extractUsedClasses(combinedHtml);

    // Detect classes added dynamically via classList.add or renderer.addClass in TS
    if (tsContent) {
      const classListAddRe = /classList\.add\s*\(\s*['"]([a-zA-Z_][\w-]*)['"]\s*\)/g;
      const rendererAddRe = /renderer\.addClass\s*\([^,]+,\s*['"]([a-zA-Z_][\w-]*)['"]\s*\)/g;
      let dm: RegExpExecArray | null;
      while ((dm = classListAddRe.exec(tsContent)) !== null) {
        used.push(dm[1]);
      }
      while ((dm = rendererAddRe.exec(tsContent)) !== null) {
        used.push(dm[1]);
      }
    }

    const usedSet = new Set(used);
    const unused = declared.filter((cls) => !usedSet.has(cls));

    if (unused.length === 0) continue;

    const ext = path.extname(styleFile);
    const componentName = path.basename(styleFile, '.component' + ext);

    results.push({
      component: componentName,
      filePath: path.relative(options.root, styleFile),
      declared,
      used: used.filter((cls) => new Set(declared).has(cls)),
      unused,
    });
  }

  // Sort by number of unused classes descending
  results.sort((a, b) => b.unused.length - a.unused.length);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(colorize('No dead CSS classes found.', 'green'));
    return;
  }

  // Summary table
  const rows = results.map((r) => [
    colorize(r.component, 'cyan'),
    String(r.declared.length),
    colorize(String(r.used.length), 'green'),
    colorize(String(r.unused.length), 'red'),
  ]);

  console.log(createTable(['Component', 'Declared', 'Used', 'Unused'], rows));
  console.log();

  // Detail: list unused classes per component
  for (const r of results) {
    console.log(
      colorize(r.component, 'cyan') +
      ` (${r.filePath}):`,
    );
    for (const cls of r.unused) {
      console.log(`  ${colorize('-', 'red')} .${cls}`);
    }
    console.log();
  }

  const totalUnused = results.reduce((sum, r) => sum + r.unused.length, 0);
  console.log(
    `Found ${colorize(String(totalUnused), 'red')} unused CSS class(es) ` +
    `across ${colorize(String(results.length), 'yellow')} component(s).`,
  );
}
