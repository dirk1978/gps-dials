import { extname } from 'node:path';
import { readDjiSrt } from './dji-srt.ts';
import { readFit } from './fit.ts';
import type { ActivityFormat, TrackPoint } from './types.ts';

export const activityFormats: ActivityFormat[] = [
  { name: 'FIT', extensions: ['.fit'], read: readFit },
  { name: 'DJI subtitle track', extensions: ['.srt'], read: readDjiSrt },
];

export function readActivity(path: string): TrackPoint[] {
  const extension = extname(path).toLowerCase();
  const format = activityFormats.find(f => f.extensions.includes(extension));
  if (!format) throw new Error(`No reader for ${extension} files yet.`);
  return format.read(path);
}
