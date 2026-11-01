import { readFileSync } from 'node:fs';
import type { TrackPoint } from './types.ts';

const POINT = /<(?:\w+:)?trkpt\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?trkpt>/g;

const attribute = (text: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(text)?.[1];

/** The first of these tags, with or without a namespace, as a number. Devices name them differently. */
function reading(body: string, ...names: string[]): number | undefined {
  for (const name of names) {
    const match = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>\\s*([-\\d.]+)\\s*<`, 'i').exec(body);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/** Reads a GPX track. Points without a time can't be matched to video, so they are left out. */
export function parseGpx(text: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const [, attributes, body] of text.matchAll(POINT)) {
    const lat = Number(attribute(attributes, 'lat'));
    const lon = Number(attribute(attributes, 'lon'));
    const time = /<(?:\w+:)?time>\s*([^<\s]+)\s*</.exec(body)?.[1];
    const t = time ? Date.parse(time) / 1000 : NaN;
    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(t)) continue;
    points.push({
      t,
      lat,
      lon,
      altitude: reading(body, 'ele'),
      speed: reading(body, 'speed'),
      heartRate: reading(body, 'hr', 'heartrate'),
      cadence: reading(body, 'cad', 'cadence'),
      power: reading(body, 'power', 'PowerInWatts'),
      temperature: reading(body, 'atemp', 'temp'),
    });
  }
  return points;
}

export function readGpx(path: string): TrackPoint[] {
  return parseGpx(readFileSync(path, 'utf8'));
}

/** The activity a GPX file names for itself, as the app's own id. */
export function gpxActivity(text: string): string {
  const type = /<(?:\w+:)?type>\s*([^<]+?)\s*</i.exec(text)?.[1].toLowerCase() ?? '';
  if (/cycl|bik|ride/.test(type)) return 'cycling';
  if (/run|walk|hik/.test(type)) return 'running';
  return 'other';
}
