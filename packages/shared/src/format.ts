import chalk from 'chalk';
import Table from 'cli-table3';

export function createTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers.map((h) => chalk.cyan.bold(h)),
    style: { head: [], border: [] },
  });
  rows.forEach((r) => table.push(r));
  return table.toString();
}

export function progressBar(value: number, total: number, width: number = 20): string {
  const ratio = total > 0 ? Math.min(value / total, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);
  const bar = chalk.green('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty));
  return `${bar} ${percent}%`;
}

export function boxDraw(title: string, lines: string[]): string {
  const allContent = [title, ...lines];
  const maxLen = Math.max(...allContent.map((l) => stripAnsi(l).length));
  const width = maxLen + 2;
  const hr = '\u2500'.repeat(width);

  const pad = (s: string): string => {
    const visible = stripAnsi(s).length;
    return ' ' + s + ' '.repeat(Math.max(0, width - 1 - visible));
  };

  const out: string[] = [];
  out.push(chalk.cyan(`\u256D${hr}\u256E`));
  out.push(chalk.cyan('\u2502') + chalk.bold(pad(title)) + chalk.cyan('\u2502'));
  out.push(chalk.cyan(`\u251C${hr}\u2524`));
  for (const line of lines) {
    out.push(chalk.cyan('\u2502') + pad(line) + chalk.cyan('\u2502'));
  }
  out.push(chalk.cyan(`\u2570${hr}\u256F`));
  return out.join('\n');
}

function stripAnsi(s: string): string {
  return s.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    '',
  );
}

type ChalkColor = 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'gray' | 'white';

const colorFns: Record<ChalkColor, (text: string) => string> = {
  red: chalk.red,
  green: chalk.green,
  yellow: chalk.yellow,
  blue: chalk.blue,
  cyan: chalk.cyan,
  magenta: chalk.magenta,
  gray: chalk.gray,
  white: chalk.white,
};

export function colorize(text: string, color: ChalkColor): string {
  return colorFns[color](text);
}

export function formatBytes(bytes: number): string {
  if (bytes < 0) return `0 B`;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
