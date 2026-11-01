import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { parseFitActivity } from '../activity/fit.ts';
import { readActivity } from '../activity/index.ts';
import type { SessionResult } from '../sync/engine.ts';

const run = promisify(execFile);
const MAX_DEPTH = 3;
const VIDEO = /\.(mp4|mov)$/i;
const TRACK = /\.(fit|gpx|srt)$/i;
const GPS_INSIDE = /^DJI NEO/i;
/** A clip counts as belonging to a track if its clock is this close, because clocks can be hours out. */
const MATCH_MARGIN_S = 2 * 3600 + 300;

export interface FolderClip {
  path: string;
  name: string;
  clockTime: number;
  duration: number;
  /** What the file says recorded it. */
  encoder?: string;
  /** The sync saved beside this clip last time, if any. */
  saved?: SavedClipSync;
}

export interface SavedClipSync {
  track: string;
  clipStart: number;
  method: 'auto' | 'manual';
  confident: boolean;
  manualRotation?: number;
  basis?: SessionResult['basis'];
  autoStart?: number;
}

export interface FolderTrack {
  path: string;
  name: string;
  device: string;
  start: number;
  end: number;
  points: number;
  /** How many clips in the folder fall within this track. */
  clips: number;
}

const stemOf = (path: string) => path.slice(0, -extname(path).length).toLowerCase();

function listFiles(dir: string, depth = 0): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile()) files.push(path);
    else if (entry.isDirectory() && depth < MAX_DEPTH && !entry.name.startsWith('.')) files.push(...listFiles(path, depth + 1));
  }
  return files;
}

async function readClip(path: string): Promise<FolderClip | null> {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags=creation_time,encoder', '-of', 'json', path]);
    const { format } = JSON.parse(stdout);
    const clockTime = Date.parse(format.tags?.creation_time) / 1000;
    if (Number.isNaN(clockTime)) return null;
    return { path, name: basename(path), clockTime, duration: Number(format.duration), encoder: format.tags?.encoder, saved: readSaved(path) };
  } catch {
    return null;
  }
}

function readSaved(clip: string): SavedClipSync | undefined {
  try {
    const saved = JSON.parse(readFileSync(`${clip}.gpsdials.json`, 'utf8')) as SavedClipSync;
    return typeof saved.clipStart === 'number' && typeof saved.track === 'string' ? saved : undefined;
  } catch {
    return undefined;
  }
}

function readTrack(path: string, clips: FolderClip[]): FolderTrack | null {
  try {
    const extension = extname(path).toLowerCase();
    const isFit = extension === '.fit';
    const fit = isFit ? parseFitActivity(readFileSync(path)) : null;
    const points = fit ? fit.points : readActivity(path);
    if (points.length < 2) return null;
    const start = points[0].t;
    const end = points[points.length - 1].t;
    return {
      path,
      name: basename(path),
      device: fit?.device ?? (isFit ? 'FIT' : extension === '.gpx' ? 'GPX' : 'Drone'),
      start,
      end,
      points: points.length,
      clips: clips.filter(c => clipFitsTrack(c, start, end)).length,
    };
  } catch {
    return null;
  }
}

export function clipFitsTrack(clip: { clockTime: number }, start: number, end: number): boolean {
  return clip.clockTime >= start - MATCH_MARGIN_S && clip.clockTime <= end + MATCH_MARGIN_S;
}

/** Most clips first, then the most detailed recording, so the likeliest match is offered first. */
export function rankTracks<T extends { clips: number; points: number; start: number; end: number }>(tracks: T[]): T[] {
  const detail = (t: T) => t.points / Math.max(1, t.end - t.start);
  return [...tracks].sort((a, b) => b.clips - a.clips || detail(b) - detail(a));
}

export async function scanFolder(dir: string): Promise<{ clips: FolderClip[]; tracks: FolderTrack[] }> {
  const files = listFiles(dir);
  const found = await Promise.all(files.filter(f => VIDEO.test(f)).map(readClip));
  const clips = found.filter((c): c is FolderClip => c != null).sort((a, b) => a.clockTime - b.clockTime);
  const trackFiles = files.filter(f => TRACK.test(f));
  // A drone's clip with no subtitles beside it still has its GPS inside.
  const stems = new Set(trackFiles.map(f => stemOf(f)));
  const inside = clips.filter(c => GPS_INSIDE.test(c.encoder ?? '') && !stems.has(stemOf(c.path))).map(c => c.path);
  const tracks = [...trackFiles, ...inside].map(f => readTrack(f, clips)).filter((t): t is FolderTrack => t != null);
  return { clips, tracks: rankTracks(tracks) };
}
