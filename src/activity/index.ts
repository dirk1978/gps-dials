import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { activityForExtension, activityForFitSport } from '../activities/index.ts';
import { readDjmdTrack } from '../devices/dji/djmd.ts';
import { clipClockTime } from '../sync/clock.ts';
import { COMBINED_EXTENSION, readCombined } from './combined.ts';
import { readDjiSrt } from './dji-srt.ts';
import { parseFitActivity, readFit } from './fit.ts';
import { gpxActivity, readGpx } from './gpx.ts';
import type { ActivityFormat, ActivityKind, TrackPoint } from './types.ts';

export const activityFormats: ActivityFormat[] = [
  { name: 'FIT', extensions: ['.fit'], read: readFit },
  { name: 'GPX', extensions: ['.gpx'], read: readGpx },
  { name: 'DJI subtitle track', extensions: ['.srt'], read: readDjiSrt },
  { name: 'Combined track', extensions: [COMBINED_EXTENSION], read: readCombined },
  { name: 'GPS inside a drone video', extensions: ['.mp4', '.mov'], read: path => readDjmdTrack(path, clipClockTime(path)) },
];

/** What sort of activity a file records, which decides the layout it starts with. */
export function activityKind(path: string): ActivityKind {
  const extension = extname(path).toLowerCase();
  const byFile = activityForExtension(extension);
  if (byFile) return byFile;
  if (extension === '.gpx') return gpxActivity(readFileSync(path, 'utf8'));
  return extension === '.fit' ? activityForFitSport(parseFitActivity(readFileSync(path)).sport) : 'other';
}

export function readActivity(path: string): TrackPoint[] {
  const extension = extname(path).toLowerCase();
  const format = activityFormats.find(f => f.extensions.includes(extension));
  if (!format) throw new Error(`No reader for ${extension} files yet.`);
  return format.read(path);
}
