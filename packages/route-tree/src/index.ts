import {
  scanFiles,
  readFileContent,
  colorize,
} from '@ngpulse/shared';
import type { GlobalOptions, RouteNode } from '@ngpulse/shared';

function parseRouteObjects(content: string): RouteNode[] {
  // Remove single-line comments
  let cleaned = content.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  const routes: RouteNode[] = [];

  // Find route array start positions using bracket counting instead of lazy regex
  // (lazy regex fails when route objects contain nested brackets like canActivate: [...])
  const startRegex = /(?:Routes\s*=\s*\[|routes\s*[:=]\s*(?:Routes\s*=\s*)?\[|provideRouter\s*\(\s*\[)/g;
  let startMatch: RegExpExecArray | null;

  while ((startMatch = startRegex.exec(cleaned)) !== null) {
    // The [ is the last character of the match
    const openIdx = startMatch.index + startMatch[0].length - 1;
    const arrayContent = extractMatchingBracket(cleaned, openIdx);
    if (arrayContent) {
      const parsed = parseRouteArray(arrayContent);
      routes.push(...parsed);
    }
  }

  return routes;
}

function parseRouteArray(content: string): RouteNode[] {
  const routes: RouteNode[] = [];
  const routeBlocks = extractObjectBlocks(content);

  for (const block of routeBlocks) {
    const route = parseRouteBlock(block);
    if (route) {
      routes.push(route);
    }
  }

  return routes;
}

function extractObjectBlocks(content: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        blocks.push(content.substring(start, i + 1));
        start = -1;
      }
    }
  }

  return blocks;
}

function parseRouteBlock(block: string): RouteNode | null {
  // Extract path
  const pathMatch = block.match(/path\s*:\s*['"]([^'"]*)['"]/);
  if (!pathMatch) return null;

  const routePath = pathMatch[1];

  // Extract component
  let component: string | undefined;
  const componentMatch = block.match(/component\s*:\s*([A-Za-z_][\w]*)/);
  if (componentMatch) {
    component = componentMatch[1];
  }

  // Check for lazy loading
  let lazy = false;
  const loadComponentMatch = block.match(/loadComponent\s*:/);
  const loadChildrenMatch = block.match(/loadChildren\s*:/);
  if (loadComponentMatch || loadChildrenMatch) {
    lazy = true;
  }

  // Extract component name from loadComponent if not already found
  if (!component && loadComponentMatch) {
    // Match patterns like: loadComponent: () => import('...').then(m => m.ComponentName)
    const lazyComponentMatch = block.match(
      /loadComponent\s*:.*?\.then\s*\(\s*\w+\s*=>\s*\w+\.(\w+)\s*\)/,
    );
    if (lazyComponentMatch) {
      component = lazyComponentMatch[1];
    }
  }

  // Extract guards from canActivate / canActivateChild
  // Use bracket counting (same approach as route array parsing) to handle nested brackets
  // e.g. canActivate: [withRole({ admin: true })]
  const guards: string[] = [];

  function extractGuardNames(src: string, keyword: string): string[] {
    const keywordRegex = new RegExp(keyword + '\\s*:\\s*\\[');
    const km = src.match(keywordRegex);
    if (!km) return [];
    const openIdx = src.indexOf('[', km.index!);
    if (openIdx < 0) return [];
    const inner = extractMatchingBracket(src, openIdx);
    if (!inner) return [];
    // Strip nested brackets so we only capture top-level identifier names
    let depth = 0;
    let flat = '';
    for (const ch of inner) {
      if (ch === '(' || ch === '{' || ch === '[') { depth++; continue; }
      if (ch === ')' || ch === '}' || ch === ']') { depth--; continue; }
      if (depth === 0) flat += ch;
    }
    const names: string[] = [];
    const idRegex = /([A-Za-z_][\w]*)/g;
    let m: RegExpExecArray | null;
    while ((m = idRegex.exec(flat)) !== null) {
      names.push(m[1]);
    }
    return names;
  }

  for (const name of extractGuardNames(block, 'canActivate')) {
    guards.push(name);
  }
  for (const name of extractGuardNames(block, 'canActivateChild')) {
    if (!guards.includes(name)) guards.push(name);
  }

  // Extract children recursively
  const children: RouteNode[] = [];
  const childrenMatch = block.match(/children\s*:\s*\[/);
  if (childrenMatch) {
    const startIdx = block.indexOf('[', childrenMatch.index! + childrenMatch[0].length - 1);
    if (startIdx >= 0) {
      const childContent = extractMatchingBracket(block, startIdx);
      if (childContent) {
        const childRoutes = parseRouteArray(childContent);
        children.push(...childRoutes);
      }
    }
  }

  return {
    path: routePath,
    component,
    lazy,
    guards,
    children,
  };
}

function extractMatchingBracket(content: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') {
      depth--;
      if (depth === 0) {
        return content.substring(openIndex + 1, i);
      }
    }
  }
  return null;
}

function renderChildren(routes: RouteNode[], prefix: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < routes.length; i++) {
    const isLast = i === routes.length - 1;
    const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
    const childPrefix = isLast ? '    ' : '\u2502   ';

    lines.push(prefix + connector + formatRouteNode(routes[i].path, routes[i]));
    lines.push(...renderChildren(routes[i].children, prefix + childPrefix));
  }
  return lines;
}

function renderTree(routes: RouteNode[], prefix: string = ''): string[] {
  const lines: string[] = [];

  // Find root route (path '' or '/') and render it as tree root
  const rootRoute = routes.find((r) => r.path === '' || r.path === '/');
  if (rootRoute) {
    lines.push(formatRouteNode('/', rootRoute));
    const otherRoutes = routes.filter((r) => r !== rootRoute);
    const allChildren = [...rootRoute.children, ...otherRoutes];
    lines.push(...renderChildren(allChildren, prefix));
  } else {
    lines.push(...renderChildren(routes, prefix));
  }

  return lines;
}

function formatRouteNode(displayPath: string, node: RouteNode): string {
  let line = colorize(displayPath || '(empty)', 'white');

  if (node.component) {
    line += ` (${colorize(node.component, 'cyan')})`;
  }

  if (node.lazy) {
    line += ` ${colorize('[lazy]', 'yellow')}`;
  }

  for (const guard of node.guards) {
    line += ` ${colorize(`[guard: ${guard}]`, 'yellow')}`;
  }

  return line;
}

function mergeRoutes(allRoutes: RouteNode[][]): RouteNode[] {
  // Flatten all parsed route arrays into a single tree, deduplicating by path+component
  const merged: RouteNode[] = [];
  const seen = new Set<string>();
  for (const routes of allRoutes) {
    for (const route of routes) {
      const key = `${route.path}::${route.component ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(route);
      }
    }
  }
  return merged;
}

export async function run(options: GlobalOptions): Promise<void> {
  const routingFiles = await scanFiles(options.root, [
    '**/*routing*.ts',
    '**/*routes*.ts',
  ]);

  if (options.verbose) console.error(`Found ${routingFiles.length} routing file(s).`);

  if (routingFiles.length === 0) {
    console.log(colorize('No routing files found.', 'yellow'));
    return;
  }

  const allRoutes: RouteNode[][] = [];

  for (const file of routingFiles) {
    let content: string;
    try {
      content = await readFileContent(file);
    } catch {
      continue;
    }
    const routes = parseRouteObjects(content);
    if (routes.length > 0) {
      if (options.verbose) {
        console.error(`Parsed ${routes.length} route(s) from ${file}`);
      }
      allRoutes.push(routes);
    }
  }

  const merged = mergeRoutes(allRoutes);

  if (merged.length === 0) {
    console.log(colorize('No route definitions found in routing files.', 'yellow'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(merged, null, 2));
    return;
  }

  const lines = renderTree(merged);
  for (const line of lines) {
    console.log(line);
  }

  // Print summary
  console.log();
  const totalRoutes = countRoutes(merged);
  const lazyRoutes = countLazyRoutes(merged);
  const guardedRoutes = countGuardedRoutes(merged);
  console.log(
    `${colorize(String(totalRoutes), 'cyan')} route(s), ` +
    `${colorize(String(lazyRoutes), 'yellow')} lazy-loaded, ` +
    `${colorize(String(guardedRoutes), 'green')} guarded`,
  );
}

function countRoutes(routes: RouteNode[]): number {
  let count = routes.length;
  for (const route of routes) {
    count += countRoutes(route.children);
  }
  return count;
}

function countLazyRoutes(routes: RouteNode[]): number {
  let count = routes.filter((r) => r.lazy).length;
  for (const route of routes) {
    count += countLazyRoutes(route.children);
  }
  return count;
}

function countGuardedRoutes(routes: RouteNode[]): number {
  let count = routes.filter((r) => r.guards.length > 0).length;
  for (const route of routes) {
    count += countGuardedRoutes(route.children);
  }
  return count;
}
