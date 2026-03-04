import * as path from 'node:path';
import {
  type GlobalOptions,
  type ComponentMeta,
  getComponents,
  createTable,
  progressBar,
  colorize,
} from '@ngpulse/shared';

export async function run(options: GlobalOptions): Promise<void> {
  if (options.verbose) console.error('Scanning component files...');
  const components = await getComponents(options.root);
  if (options.verbose) console.error(`Found ${components.length} components.`);

  components.sort((a: ComponentMeta, b: ComponentMeta) =>
    a.name.localeCompare(b.name),
  );

  const standaloneCount = components.filter(
    (c: ComponentMeta) => c.standalone,
  ).length;
  const moduleBasedCount = components.length - standaloneCount;

  if (options.json) {
    console.log(JSON.stringify(components, null, 2));
    return;
  }

  const rows: string[][] = components.map((c: ComponentMeta) => {
    const standaloneLabel = c.standalone
      ? colorize('✓', 'green')
      : colorize('✗', 'red');
    const relativePath = path.relative(options.root, c.filePath);
    return [c.name, c.selector, standaloneLabel, relativePath];
  });

  const table = createTable(
    ['Name', 'Selector', 'Standalone', 'Path'],
    rows,
  );
  console.log(table);

  console.log('');
  const bar = progressBar(standaloneCount, components.length, 20, 'green');
  console.log(
    `${components.length} components: ${colorize(String(standaloneCount), 'green')} standalone, ${colorize(String(moduleBasedCount), 'yellow')} module-based`,
  );
  console.log(`Standalone ratio: ${bar}`);
}
