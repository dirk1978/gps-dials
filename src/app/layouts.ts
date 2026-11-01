import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** Opens a layout someone has shared as a file. */
export function importLayout(path: string): Template {
  const name = path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').replace(/\.layout$/, '');
  return { ...normaliseTemplate(JSON.parse(readFileSync(path, 'utf8'))), name };
}
