import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { srtClipStart } from '../activity/dji-srt.ts';
import type { TrackPoint } from '../activity/types.ts';
import { genericVideo } from '../devices/generic-video.ts';
import { findDevice } from '../devices/index.ts';
import type { DeviceAdapter } from '../devices/types.ts';
import { clipClockTime } from './clock.ts';
import { clockInliers, localClockError } from './consensus.ts';
import { gpsYawRate, resample, slidingCorrelation, smooth, topPeaks } from './correlate.ts';
import { isUpsideDown } from './orientation.ts';

const HZ = 4;
const COURSE_SPAN_S = 4;
const SMOOTH_S = 5;
/** Camera clocks can be wrong by whole hours, plus this much. */
const CLOCK_SEARCH_S = 300;
/**
 * Provisional, set from two clips. Long clips score a lower r but stand out far
 * more clearly, so the lead over the next candidate does most of the work.
 */
const MIN_TURN_R = 0.4;
const MIN_SPEED_R = 0.5;
const MIN_LEAD = 0.25;

/** A clip must look this good on its own before it gets a vote on the day's clock error. */
const VOTE_TURN_R = 0.75;
const VOTE_SPEED_R = 0.35;
/** How far a clip may refine the day's clock error using its own motion. */
const REFINE_S = 3;
const REFINE_MIN_R = 0.5;
/** A long clip can start before a track does and still overlap it. */
const GPS_MARGIN_S = 3600;

export { clipClockTime };

export interface SyncResult {
  /** Seconds since the Unix epoch at the clip's first frame, on the track's clock. */
  clipStart: number;
  /** When the clip says it started. */
  clockTime: number;
  turnR: number;
  speedR: number | null;
  lead: number;
  /** Next best start, if there was another candidate. */
  runnerUp: { clipStart: number; turnR: number } | null;
  confident: boolean;
  deviceName: string;
  source: string;
  motionSeconds: number;
}

export interface SessionClip {
  path: string;
  upsideDown?: boolean;
}

export interface SessionResult extends SyncResult {
  path: string;
  /** How the start was decided: this clip alone, this clip guided by the day, the day alone, or by hand. */
  basis: 'own motion' | 'guided by other clips' | 'clock from other clips' | 'set by hand' | 'from its own subtitles';
}

interface Analysis {
  result: SyncResult;
  scoreAt(clipStart: number): number;
}

async function analyseClip(clip: string, track: TrackPoint[], deviceId?: string, upsideDown?: boolean, onProgress?: (fraction: number) => void): Promise<Analysis> {
  const device = findDevice(clip, deviceId);
  // Only picture-based motion cares, and checking every clip of a long day isn't free.
  const inverted = upsideDown ?? (device.id === genericVideo.id && await isUpsideDown(clip));
  const motion = await device.readMotion(clip, HZ, inverted, onProgress);

  const smoothing = SMOOTH_S * HZ + 1;
  const start = track[0].t;
  const grid = resample(track, start, HZ);
  const gpsTurn = smooth(gpsYawRate(grid, HZ, COURSE_SPAN_S), smoothing);
  const forwards = slidingCorrelation(smooth(motion.turnRate, smoothing), gpsTurn);
  const backwards = motion.signUnknown ? slidingCorrelation(smooth(motion.turnRate.map(v => -v), smoothing), gpsTurn) : null;
  const turn = backwards && Math.max(...backwards.scores) > Math.max(...forwards.scores) ? backwards : forwards;
  const speed = motion.roughness ? slidingCorrelation(smooth(motion.roughness, smoothing), smooth(grid.speed, smoothing)) : null;

  const timeAt = (index: number) => start + (index + turn.origin) / HZ;
  const clockTime = clipClockTime(clip);
  const inWindow = (i: number) => {
    const distance = timeAt(i) - clockTime;
    const hours = Math.round(distance / 3600);
    return Math.abs(hours) <= 2 && Math.abs(distance - hours * 3600) <= CLOCK_SEARCH_S;
  };
  const windowed = turn.scores.map((v, i) => (inWindow(i) ? v : -1));

  const [best, runnerUp] = topPeaks(windowed, 2, 15 * HZ);
  const lead = best.score - (runnerUp?.score ?? -1);
  const speedR = speed ? speed.scores[best.index] : null;
  return {
    result: {
      clipStart: timeAt(best.index),
      clockTime,
      turnR: best.score,
      speedR,
      lead,
      runnerUp: runnerUp ? { clipStart: timeAt(runnerUp.index), turnR: runnerUp.score } : null,
      confident: best.score >= MIN_TURN_R && (speedR == null || speedR >= MIN_SPEED_R) && lead >= MIN_LEAD,
      deviceName: device.name,
      source: motion.source,
      motionSeconds: motion.turnRate.length / HZ,
    },
    scoreAt(clipStart) {
      const i = Math.round((clipStart - start) * HZ) - turn.origin;
      return i >= 0 && i < turn.scores.length ? turn.scores[i] : -1;
    },
  };
}

export async function syncClip(clip: string, track: TrackPoint[], deviceId?: string, upsideDown?: boolean, onProgress?: (fraction: number) => void): Promise<SyncResult> {
  const device = findDevice(clip, deviceId);
  const timed = gpsTimed(device, clip, track);
  return timed ?? (await analyseClip(clip, track, deviceId, upsideDown, onProgress)).result;
}

/** A clip with its own GPS knows the true time, so nothing needs matching if that falls on this track. */
function gpsTimed(device: DeviceAdapter, clip: string, track: TrackPoint[]): SessionResult | null {
  const start = device.gpsStart?.(clip);
  if (start == null || start > track[track.length - 1].t || start + GPS_MARGIN_S < track[0].t) return null;
  return exactResult(clip, start, device.name, 'GPS time in the video');
}

/** Drone subtitles were written frame by frame with the clip, so nothing needs matching. */
function exactResults(clips: SessionClip[], trackPath?: string): SessionResult[] | null {
  if (!trackPath) return null;
  // GPS stored inside the video is on the clip's clock from the first frame.
  const inside = clips.find(c => c.path === trackPath);
  if (inside) {
    const device = findDevice(inside.path);
    return [exactResult(inside.path, device.gpsStart?.(inside.path) ?? clipClockTime(inside.path))];
  }
  if (extname(trackPath).toLowerCase() !== '.srt') return null;
  const stem = trackPath.slice(0, -extname(trackPath).length).toLowerCase();
  const clip = clips.find(c => c.path.slice(0, -extname(c.path).length).toLowerCase() === stem);
  const clipStart = clip ? srtClipStart(readFileSync(trackPath, 'utf8')) : null;
  if (!clip || clipStart == null) return null;
  return [exactResult(clip.path, clipStart)];
}

function exactResult(path: string, clipStart: number, deviceName = 'DJI drone', source = 'subtitle track'): SessionResult {
  return {
    path, clipStart, clockTime: clipClockTime(path), turnR: 1, speedR: null, lead: 1, runnerUp: null,
    confident: true, deviceName, source, motionSeconds: 0, basis: 'from its own subtitles',
  };
}

/**
 * Syncs a whole outing. A camera's clock is wrong by much the same amount all day,
 * so the clips that match well settle the clock, and short or straight clips that
 * can't be matched alone take it from them.
 */
export async function syncSession(
  clips: SessionClip[],
  track: TrackPoint[],
  onProgress: (done: number, total: number) => void = () => {},
  trackPath?: string,
): Promise<SessionResult[]> {
  const exact = exactResults(clips, trackPath);
  if (exact) return exact;
  const stamped = new Map(clips.map(c => [c.path, gpsTimed(findDevice(c.path), c.path, track)]));
  const unstamped = clips.filter(c => !stamped.get(c.path));
  if (unstamped.length < clips.length) {
    const rest = unstamped.length ? await syncSession(unstamped, track, onProgress, trackPath) : [];
    return [...[...stamped.values()].filter(r => r != null), ...rest];
  }
  const analyses: (Analysis & { path: string })[] = [];
  for (const [i, clip] of clips.entries()) {
    analyses.push({ ...(await analyseClip(clip.path, track, undefined, clip.upsideDown, fraction => onProgress(i + fraction, clips.length))), path: clip.path });
    onProgress(i + 1, clips.length);
  }

  const votes = analyses
    .map(a => a.result)
    .filter(r => r.turnR >= VOTE_TURN_R && (r.speedR == null || r.speedR >= VOTE_SPEED_R))
    .map(r => ({ clockTime: r.clockTime, error: r.clockTime - r.clipStart }));
  const inliers = clockInliers(votes);
  if (inliers.length === 0) return analyses.map(a => ({ ...a.result, path: a.path, basis: 'own motion' }));

  return analyses.map(({ result, path, scoreAt }) => {
    const expected = result.clockTime - localClockError(result.clockTime, inliers);
    let bestStart = expected;
    let bestScore = -1;
    for (let d = -REFINE_S; d <= REFINE_S; d += 1 / HZ) {
      const score = scoreAt(expected + d);
      if (score > bestScore) {
        bestScore = score;
        bestStart = expected + d;
      }
    }
    const refined = bestScore >= REFINE_MIN_R;
    return {
      ...result,
      path,
      clipStart: refined ? bestStart : expected,
      turnR: refined ? bestScore : result.turnR,
      confident: true,
      basis: refined ? 'guided by other clips' : 'clock from other clips',
    };
  });
}
