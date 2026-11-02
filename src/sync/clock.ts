import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

/** When the clip says it started, by its camera's clock. Some phones don't say, so the file's date stands in. */
export function clipClockTime(path: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=creation_time', '-of', 'csv=p=0', path]).toString().trim();
  const time = Date.parse(out) / 1000;
  return Number.isNaN(time) ? statSync(path).mtimeMs / 1000 : time;
}
