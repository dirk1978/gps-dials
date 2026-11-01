import { readFileSync, writeFileSync } from 'node:fs';
import type { TrackPoint } from './types.ts';

export const COMBINED_EXTENSION = '.gpsdials-track';

/** A track built from several sources, kept as a file so sync and export treat it like any other. */
export function writeCombined(path: string, points: TrackPoint[]): void {
  writeFileSync(path, JSON.stringify({ version: 1, points }));
}

export function readCombined(path: string): TrackPoint[] {
  const file = JSON.parse(readFileSync(path, 'utf8')) as { version?: number; points?: TrackPoint[] };
  if (file.version !== 1 || !Array.isArray(file.points)) throw new Error('That isn\'t a combined track.');
  return file.points;
}
