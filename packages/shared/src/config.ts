import * as fs from 'node:fs';
import * as path from 'node:path';

export interface NgpulseConfig {
  thresholds?: { standalone?: number; signals?: number; lazyRoutes?: number };
  ignore?: string[];
}

export async function loadConfig(root: string): Promise<NgpulseConfig> {
  const configPath = path.join(root, '.ngpulserc.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = await fs.promises.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const config: NgpulseConfig = {};

    // Validate and coerce thresholds
    if (parsed['thresholds'] && typeof parsed['thresholds'] === 'object') {
      const t = parsed['thresholds'] as Record<string, unknown>;
      config.thresholds = {};
      for (const key of ['standalone', 'signals', 'lazyRoutes'] as const) {
        const val = t[key];
        if (typeof val === 'number' && isFinite(val)) {
          config.thresholds[key] = Math.min(100, Math.max(0, val));
        } else if (typeof val === 'string' && !isNaN(Number(val))) {
          // Accept "80" as 80 with a warning
          process.stderr.write(
            `[ngpulse] .ngpulserc.json: thresholds.${key} should be a number, got string "${val}". Using ${Number(val)}.
`
          );
          config.thresholds[key] = Math.min(100, Math.max(0, Number(val)));
        }
      }
    }

    // Validate ignore patterns
    if (Array.isArray(parsed['ignore'])) {
      config.ignore = (parsed['ignore'] as unknown[])
        .filter((v): v is string => typeof v === 'string');
    }

    return config;
  } catch {
    return {};
  }
}
