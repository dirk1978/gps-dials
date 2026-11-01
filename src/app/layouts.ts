import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { importTelemetryOverlay } from '../overlay/import-telemetry-overlay.ts';
import { normaliseTemplate, type Template } from '../overlay/template.ts';

const EXTENSION = '.layout.json';
const CURRENT = 'working copy';

/** Keeps the name readable while making sure it can't leave the layouts folder. */
function fileFor(dir: string, name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Untitled';
  return join(dir, `${safe}${EXTENSION}`);
}

export function listLayouts(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  return readdirSync(dir)
    .filter(f => f.endsWith(EXTENSION))
    .map(f => f.slice(0, -EXTENSION.length))
    .filter(n => n !== CURRENT)
    .sort();
}

export function loadLayout(dir: string, name: string): Template {
  return normaliseTemplate(JSON.parse(readFileSync(fileFor(dir, name), 'utf8')));
}

export function saveLayout(dir: string, name: string, template: Template): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileFor(dir, name), JSON.stringify(template, null, 2));
}

export function deleteLayout(dir: string, name: string): void {
  rmSync(fileFor(dir, name), { force: true });
}

export function loadWorkingCopy(dir: string): Template | null {
  try {
    return loadLayout(dir, CURRENT);
  } catch {
    return null;
  }
}

export const saveWorkingCopy = (dir: string, template: Template) => saveLayout(dir, CURRENT, template);

/** Opens a file from outside the app, which can be one of ours or a Telemetry Overlay template. */
export function importLayout(path: string): { template: Template; skipped: string[] } {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const name = path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').replace(/\.layout$/, '');
  if (['.toptrn', '.toproj'].includes(extname(path).toLowerCase())) return importTelemetryOverlay(raw, name);
  return { template: { ...normaliseTemplate(raw), name }, skipped: [] };
}
