import { readFileSync } from 'node:fs';
import type { TrackPoint } from './types.ts';

const FRAME = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})[\s\S]*?\[latitude: ([-\d.]+)\] \[longitude: ([-\d.]+)\] \[rel_alt: [-\d.]+ abs_alt: ([-\d.]+)\]/g;

/**
 * Reads the per-frame subtitle file some DJI drones write next to a clip. The clock
 * has no time zone, so `t` holds the drone's local time as if it were UTC. Frames
 * without a fix report 0,0 and are left out.
 */
export function parseDjiSrt(text: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const m of text.matchAll(FRAME)) {
    const lat = Number(m[8]);
    const lon = Number(m[9]);
    if (lat === 0 && lon === 0) continue;
    points.push({
      t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) / 1000,
      lat,
      lon,
      altitude: Number(m[10]),
    });
  }
  return points;
}

export function readDjiSrt(path: string): TrackPoint[] {
  return parseDjiSrt(readFileSync(path, 'utf8'));
}
