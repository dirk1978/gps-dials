import { execFileSync } from 'node:child_process';

/** When the clip says it started, by its camera's clock. */
export function clipClockTime(path: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=creation_time', '-of', 'csv=p=0', path]).toString().trim();
  return Date.parse(out) / 1000;
}
