import * as path from 'node:path';
import {
  type GlobalOptions,
  type ComponentWeight,
  scanFiles,
  getFileSize,
  createTable,
  colorize,
  formatBytes,
} from '@ngpulse/shared';

async function findAssociatedFile(
  componentPath: string,
  extensions: string[],
): Promise<{ filePath: string; size: number } | null> {
  const dir = path.dirname(componentPath);
  const baseName = path.basename(componentPath, '.component.ts');

  for (const ext of extensions) {
    const candidate = path.join(dir, `${baseName}.component.${ext}`);
    try {
      const size = await getFileSize(candidate);
      return { filePath: candidate, size };
    } catch {
      // file doesn't exist, try next extension
    }
  }
  return null;
}

async function analyzeComponents(root: string): Promise<ComponentWeight[]> {
  const componentFiles = await scanFiles(root, ['**/*.component.ts']);
  const weights: ComponentWeight[] = [];

  for (const filePath of componentFiles) {
    const tsSize = await getFileSize(filePath);

    const templateResult = await findAssociatedFile(filePath, ['html']);
    const templateSize = templateResult?.size ?? 0;

    const styleResult = await findAssociatedFile(filePath, ['scss', 'css', 'sass', 'less']);
    const styleSize = styleResult?.size ?? 0;

    const totalSize = tsSize + templateSize + styleSize;

    // Derive a component name from file path
    const baseName = path.basename(filePath, '.component.ts');
    const name = baseName
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
      + 'Component';

    weights.push({
      name,
      filePath,
      tsSize,
      templateSize,
      styleSize,
      totalSize,
    });
  }

  // Sort by total size descending
  weights.sort((a, b) => b.totalSize - a.totalSize);
  return weights;
}

export async function run(options: GlobalOptions): Promise<void> {
  if (options.verbose) console.error('Analyzing component weights...');
  const weights = await analyzeComponents(options.root);
  if (options.verbose) console.error(`Found ${weights.length} components.`);

  if (weights.length === 0) {
    console.log('No *.component.ts files found.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(weights, null, 2));
    return;
  }

  const headers = ['#', 'Component', 'TypeScript', 'Template', 'Style', 'Total'];

  const rows: string[][] = weights.map((w, i) => [
    String(i + 1),
    w.name,
    formatBytes(w.tsSize),
    w.templateSize > 0 ? formatBytes(w.templateSize) : colorize('-', 'gray'),
    w.styleSize > 0 ? formatBytes(w.styleSize) : colorize('-', 'gray'),
    colorize(formatBytes(w.totalSize), 'cyan'),
  ]);

  // Summary row
  const totalTs = weights.reduce((sum, w) => sum + w.tsSize, 0);
  const totalTemplate = weights.reduce((sum, w) => sum + w.templateSize, 0);
  const totalStyle = weights.reduce((sum, w) => sum + w.styleSize, 0);
  const totalAll = weights.reduce((sum, w) => sum + w.totalSize, 0);
  const count = weights.length;

  rows.push([
    '',
    colorize('TOTAL', 'yellow'),
    colorize(formatBytes(totalTs), 'yellow'),
    colorize(formatBytes(totalTemplate), 'yellow'),
    colorize(formatBytes(totalStyle), 'yellow'),
    colorize(formatBytes(totalAll), 'yellow'),
  ]);

  rows.push([
    '',
    colorize('AVG', 'gray'),
    colorize(formatBytes(Math.round(totalTs / count)), 'gray'),
    colorize(formatBytes(Math.round(totalTemplate / count)), 'gray'),
    colorize(formatBytes(Math.round(totalStyle / count)), 'gray'),
    colorize(formatBytes(Math.round(totalAll / count)), 'gray'),
  ]);

  console.log('');
  console.log(colorize('Component Weight Ranking', 'cyan'));
  console.log(colorize(`${count} components found`, 'gray'));
  console.log('');
  console.log(createTable(headers, rows));
  console.log('');
}
