import { upInCamera, type OrientationConvention } from '../sync/correlate.ts';
import type { MotionSample } from './types.ts';

/** Plenty for a gauge, and it evens out the vibration in a camera's own readings. */
export const SENSOR_HZ = 10;
/** Below this, the orientation doesn't hold steady enough against gravity to trust as lean. */
const MIN_TIGHTNESS = 0.8;
const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The evenly spaced times sensor readings are gathered onto. */
export function sensorTimes(duration: number): number[] {
  return Array.from({ length: Math.ceil(duration * SENSOR_HZ) }, (_, i) => i / SENSOR_HZ);
}

/** Averages readings into `times`, leaving null where none fell. */
export function binned(times: number[], at: number[], values: (number | null)[]): (number | null)[] {
  const sum = new Array<number>(times.length).fill(0);
  const count = new Array<number>(times.length).fill(0);
  at.forEach((t, i) => {
    const bin = Math.floor(t * SENSOR_HZ);
    const v = values[i];
    if (v != null && bin >= 0 && bin < times.length) {
      sum[bin] += v;
      count[bin]++;
    }
  });
  return sum.map((v, i) => (count[i] ? v / count[i] : null));
}

/** The last reading in each slot, for values such as compass headings that can't be averaged. */
export function latest(times: number[], at: number[], values: (number | null)[]): (number | null)[] {
  const out = new Array<number | null>(times.length).fill(null);
  at.forEach((t, i) => {
    const bin = Math.floor(t * SENSOR_HZ);
    if (values[i] != null && bin >= 0 && bin < times.length) out[bin] = values[i];
  });
  return out;
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[values.length >> 1];
}

/** Each angle against the usual one, so a camera mounted at a slant still reads upright as zero. */
function fromUsual(angles: number[]): number[] {
  const usual = median(angles);
  return angles.map(a => ((a - usual + 540) % 360) - 180);
}

/**
 * Lean and pitch from a camera's orientation. Its long axis looks forward, so turning
 * about that axis is lean. Positive means leaning right, or nose up. This is the camera's
 * own tilt: on a helmet it follows the head rather than the bike.
 */
export function cameraAttitude(samples: MotionSample[], convention: OrientationConvention, times: number[]): { lean: (number | null)[]; pitch: (number | null)[] } | null {
  if (samples.length === 0 || convention.tightness < MIN_TIGHTNESS) return null;
  const ups = samples.map(s => upInCamera(s, convention));
  const at = samples.map(s => s.t);
  return {
    lean: binned(times, at, fromUsual(ups.map(u => degrees(Math.atan2(u[1], u[2]))))),
    pitch: binned(times, at, fromUsual(ups.map(u => degrees(Math.atan2(u[0], u[2]))))),
  };
}
