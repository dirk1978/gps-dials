import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RETRIES = 3;
const RETRY_DELAY_MS = 200;

/** Everything in a folder, in bytes. A folder that doesn't exist yet holds nothing. */
export function folderSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(dir, entry.name);
    return total + (entry.isDirectory() ? folderSize(path) : statSync(path).size);
  }, 0);
}

/** Empties a folder. A file still in use is left for next time, rather than stopping the rest. */
export function emptyFolder(dir: string): { freed: number; left: number } {
  if (!existsSync(dir)) return { freed: 0, left: 0 };
  const before = folderSize(dir);
  let left = 0;
  for (const name of readdirSync(dir)) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true, maxRetries: RETRIES, retryDelay: RETRY_DELAY_MS });
    } catch {
      left++;
    }
  }
  return { freed: before - folderSize(dir), left };
}

/** The sync notes earlier versions saved beside these clips. The clips themselves are never touched. */
export function removeSyncNotes(clips: string[]): number {
  let removed = 0;
  for (const clip of clips) {
    const note = `${clip}.gpsdials.json`;
    if (!existsSync(note)) continue;
    rmSync(note, { force: true });
    removed++;
  }
  return removed;
}
