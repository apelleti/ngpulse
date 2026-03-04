import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GlobalOptions } from '@ngpulse/shared';

interface PackageModule {
  run: (options: GlobalOptions) => Promise<void>;
}

async function captureJsonOutput(
  pkg: PackageModule,
  options: GlobalOptions,
): Promise<unknown> {
  // Temporarily redirect console.log to capture JSON output.
  // Uses a try/finally to guarantee restoration even on errors.
  // Note: this is not safe for concurrent calls — each run() is sequential here.
  const origLog = console.log;
  const origError = console.error;
  const chunks: string[] = [];
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '));
  };
  // Suppress console.error from sub-packages during capture
  console.error = () => {};
  try {
    await pkg.run({ ...options, json: true, verbose: false });
  } catch {
    // package failed — return null, report continues with other packages
    return null;
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  const raw = chunks.join('\n').trim();
  if (!raw) return null;
  // Find the last valid JSON object/array in the output (some packages may print warnings first)
  const jsonStart = raw.lastIndexOf('{') !== -1 || raw.lastIndexOf('[') !== -1
    ? Math.max(raw.lastIndexOf('{'), raw.lastIndexOf('['))
    : -1;
  const candidate = jsonStart >= 0 ? raw.slice(raw.indexOf(raw[jsonStart])) : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    // Try the full raw output as last resort
    try { return JSON.parse(raw); } catch { return null; }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(label: string, value: string | number, color: string): string {
  return `<span class="badge" style="background:${color}">${escapeHtml(String(label))}: ${escapeHtml(String(value))}</span>`;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return Math.round((n / total) * 100) + '%';
}

function generateHtml(data: Record<string, unknown>): string {
  const info = data['info'] as Record<string, unknown> | null;
  const debtLog = data['debt-log'] as unknown[] | null;
  const orphans = data['orphans'] as unknown[] | null;
  const deadCss = data['dead-css'] as unknown[] | null;
  const circularDeps = data['circular-deps'] as unknown[] | null;
  const secrets = data['hardcoded-secrets'] as unknown[] | null;
  const compat = data['compat-matrix'] as unknown[] | null;

  const projectName = info
    ? (info['project'] as Record<string, string>)?.name ?? 'Unknown'
    : 'Unknown';

  const versions = info
    ? (info['versions'] as Record<string, string>) ?? {}
    : {};

  const counts = info
    ? (info['counts'] as Record<string, number>) ?? {}
    : {};

  const standaloneRatio = info
    ? (info['standaloneRatio'] as Record<string, number>) ?? {}
    : {};

  const signalUsage = info
    ? (info['signalUsage'] as Record<string, number>) ?? {}
    : {};

  const lazyRoutes = info
    ? (info['lazyRoutes'] as Record<string, number>) ?? {}
    : {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ngpulse Report — ${escapeHtml(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:2rem;max-width:1200px;margin:0 auto}
h1{color:#e94560;margin-bottom:.5rem;font-size:1.8rem}
h2{color:#0f3460;background:#16213e;padding:.7rem 1rem;border-radius:6px;margin:1.5rem 0 .8rem;font-size:1.1rem;color:#e94560}
.header{text-align:center;padding:1.5rem;background:#16213e;border-radius:10px;margin-bottom:2rem}
.header p{color:#888;margin-top:.3rem}
.badges{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin:1rem 0}
.badge{padding:.3rem .7rem;border-radius:4px;font-size:.85rem;color:#fff;font-weight:500}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
@media(max-width:768px){.grid{grid-template-columns:1fr}}
.card{background:#16213e;border-radius:8px;padding:1.2rem;border:1px solid #0f3460}
.card h3{color:#e94560;margin-bottom:.8rem;font-size:1rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #0f3460;color:#e94560}
td{padding:.4rem .6rem;border-bottom:1px solid #1a1a2e}
tr:hover td{background:#1a1a2e}
.ok{color:#4ecca3}
.warn{color:#e9c46a}
.bad{color:#e94560}
.count{font-size:2rem;font-weight:700;color:#4ecca3}
.metric{text-align:center;padding:.5rem}
.metric-label{font-size:.75rem;color:#888;margin-top:.2rem}
.footer{text-align:center;color:#555;font-size:.8rem;margin-top:2rem;padding:1rem}
</style>
</head>
<body>
<div class="header">
<h1>ngpulse Report</h1>
<p>${escapeHtml(projectName)} — generated ${new Date().toISOString().slice(0, 10)}</p>
<div class="badges">
${badge('Angular', versions['angular'] ?? '?', '#e94560')}
${badge('TypeScript', versions['typescript'] ?? '?', '#3178c6')}
${badge('RxJS', versions['rxjs'] ?? '?', '#b7178c')}
${badge('Components', counts['components'] ?? 0, '#0f3460')}
${badge('Services', counts['services'] ?? 0, '#0f3460')}
</div>
</div>

<h2>Health Indicators</h2>
<div class="grid">
<div class="card">
<h3>Standalone</h3>
<div class="metric">
<div class="count">${pct(standaloneRatio['standalone'] ?? 0, standaloneRatio['total'] ?? 0)}</div>
<div class="metric-label">${standaloneRatio['standalone'] ?? 0} / ${standaloneRatio['total'] ?? 0} components</div>
</div>
</div>
<div class="card">
<h3>Signals</h3>
<div class="metric">
<div class="count">${pct(signalUsage['filesWithSignals'] ?? 0, signalUsage['totalComponentsAndServices'] ?? 0)}</div>
<div class="metric-label">${signalUsage['filesWithSignals'] ?? 0} / ${signalUsage['totalComponentsAndServices'] ?? 0} files</div>
</div>
</div>
<div class="card">
<h3>Lazy Routes</h3>
<div class="metric">
<div class="count">${pct(lazyRoutes['lazy'] ?? 0, lazyRoutes['totalRoutes'] ?? 0)}</div>
<div class="metric-label">${lazyRoutes['lazy'] ?? 0} / ${lazyRoutes['totalRoutes'] ?? 0} routes</div>
</div>
</div>
<div class="card">
<h3>Artifact Counts</h3>
<table>
${Object.entries(counts).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join('\n')}
</table>
</div>
</div>

${(circularDeps && circularDeps.length > 0) ? `
<h2>Circular Dependencies (${circularDeps.length})</h2>
<div class="card">
<table>
<tr><th>#</th><th>Cycle</th></tr>
${(circularDeps as string[][]).slice(0, 20).map((cycle, i) => `<tr><td>${i + 1}</td><td class="warn">${escapeHtml(cycle.join(' → '))}</td></tr>`).join('\n')}
${circularDeps.length > 20 ? `<tr><td colspan="2">… and ${circularDeps.length - 20} more</td></tr>` : ''}
</table>
</div>` : ''}

${(secrets && secrets.length > 0) ? `
<h2>Hardcoded Secrets (${secrets.length})</h2>
<div class="card">
<table>
<tr><th>File</th><th>Type</th><th>Line</th></tr>
${(secrets as Record<string, unknown>[]).slice(0, 20).map(s => `<tr><td>${escapeHtml(String(s['file'] ?? ''))}</td><td class="bad">${escapeHtml(String(s['type'] ?? ''))}</td><td>${s['line'] ?? ''}</td></tr>`).join('\n')}
${secrets.length > 20 ? `<tr><td colspan="3">… and ${secrets.length - 20} more</td></tr>` : ''}
</table>
</div>` : ''}

${(orphans && orphans.length > 0) ? `
<h2>Orphan Files (${orphans.length})</h2>
<div class="card">
<table>
<tr><th>File</th><th>Extension</th><th>Size</th></tr>
${(orphans as Record<string, unknown>[]).slice(0, 20).map(o => `<tr><td>${escapeHtml(String(o['filePath'] ?? ''))}</td><td>${escapeHtml(String(o['extension'] ?? ''))}</td><td>${o['size'] ?? 0} B</td></tr>`).join('\n')}
${orphans.length > 20 ? `<tr><td colspan="3">… and ${orphans.length - 20} more</td></tr>` : ''}
</table>
</div>` : ''}

${(deadCss && deadCss.length > 0) ? `
<h2>Dead CSS (${deadCss.length} components)</h2>
<div class="card">
<table>
<tr><th>Component</th><th>Unused Classes</th></tr>
${(deadCss as Record<string, unknown>[]).slice(0, 20).map(d => `<tr><td>${escapeHtml(String(d['component'] ?? ''))}</td><td class="warn">${escapeHtml((d['unused'] as string[] ?? []).join(', '))}</td></tr>`).join('\n')}
${deadCss.length > 20 ? `<tr><td colspan="2">… and ${deadCss.length - 20} more</td></tr>` : ''}
</table>
</div>` : ''}

${(debtLog && debtLog.length > 0) ? `
<h2>Technical Debt (${debtLog.length} items)</h2>
<div class="card">
<table>
<tr><th>Type</th><th>Message</th><th>File</th><th>Age</th></tr>
${(debtLog as Record<string, unknown>[]).slice(0, 30).map(d => `<tr><td class="${d['type'] === 'FIXME' ? 'bad' : d['type'] === 'HACK' ? 'warn' : ''}">${escapeHtml(String(d['type'] ?? ''))}</td><td>${escapeHtml(String(d['message'] ?? ''))}</td><td>${escapeHtml(String(d['file'] ?? ''))}:${d['line'] ?? ''}</td><td>${escapeHtml(String(d['age'] ?? '—'))}</td></tr>`).join('\n')}
${debtLog.length > 30 ? `<tr><td colspan="4">… and ${debtLog.length - 30} more</td></tr>` : ''}
</table>
</div>` : ''}

${(compat && compat.length > 0) ? `
<h2>Compatibility Matrix</h2>
<div class="card">
<table>
<tr><th>Package</th><th>Version</th><th>Status</th></tr>
${(compat as Record<string, unknown>[]).map(c => `<tr><td>${escapeHtml(String(c['package'] ?? ''))}</td><td>${escapeHtml(String(c['currentVersion'] ?? ''))}</td><td class="${c['compatible'] ? 'ok' : 'bad'}">${c['compatible'] ? '✓ Compatible' : '✗ Incompatible'}</td></tr>`).join('\n')}
</table>
</div>` : ''}

<div class="footer">Generated by ngpulse — ${new Date().toISOString()}</div>
</body>
</html>`;
}

export async function run(options: GlobalOptions): Promise<void> {
  const packages: [string, () => Promise<PackageModule>][] = [
    ['info', () => import('@ngpulse/info')],
    ['debt-log', () => import('@ngpulse/debt-log')],
    ['orphans', () => import('@ngpulse/orphans')],
    ['dead-css', () => import('@ngpulse/dead-css')],
    ['circular-deps', () => import('@ngpulse/circular-deps')],
    ['hardcoded-secrets', () => import('@ngpulse/hardcoded-secrets')],
    ['compat-matrix', () => import('@ngpulse/compat-matrix')],
  ];

  const data: Record<string, unknown> = {};

  for (const [name, loader] of packages) {
    if (options.verbose) console.error(`Collecting ${name}...`);
    try {
      const mod = await loader();
      data[name] = await captureJsonOutput(mod, options);
    } catch (err) {
      if (options.verbose) console.error(`Warning: ${name} failed: ${err}`);
      data[name] = null;
    }
  }

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const html = generateHtml(data);
  const outputPath = path.join(options.root, 'ngpulse-report.html');
  await fs.promises.writeFile(outputPath, html, 'utf-8');
  console.log(`Report written to ${outputPath}`);
}
