import type { TrackPoint } from '../activity/types.ts';
import type { MotionSample, Quaternion } from '../devices/types.ts';

type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));

/** Hamilton product of [w, x, y, z] quaternions. */
function qmul(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

const qconj = (q: Quaternion): Quaternion => [q[0], -q[1], -q[2], -q[3]];

function rotate(q: Quaternion, v: Vec3): Vec3 {
  const r = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q));
  return [r[1], r[2], r[3]];
}

const ORDERS: Record<string, (q: Quaternion) => Quaternion> = {
  wxyz: q => q,
  xyzw: q => [q[3], q[0], q[1], q[2]],
};

export interface OrientationConvention {
  name: string;
  /** 1 means gravity sat on one world axis for the whole clip. */
  tightness: number;
  map: (q: Quaternion) => Quaternion;
  up: Vec3;
}

/**
 * DJI doesn't document the quaternion's order or direction, so test each option:
 * only the right one rotates the accelerometer's gravity onto a steady world axis.
 */
export function detectConvention(samples: MotionSample[]): OrientationConvention {
  let best: OrientationConvention | null = null;
  for (const [order, reorder] of Object.entries(ORDERS)) {
    for (const inverse of [false, true]) {
      const map = (q: Quaternion) => (inverse ? qconj(reorder(q)) : reorder(q));
      const sum: Vec3 = [0, 0, 0];
      let total = 0;
      for (const s of samples) {
        const w = rotate(map(s.q), s.accel);
        sum[0] += w[0]; sum[1] += w[1]; sum[2] += w[2];
        total += norm(w);
      }
      const tightness = norm(sum) / total;
      if (!best || tightness > best.tightness) {
        const n = norm(sum);
        best = { name: `${order}${inverse ? ' inverse' : ''}`, tightness, map, up: [sum[0] / n, sum[1] / n, sum[2] / n] };
      }
    }
  }
  return best!;
}

/** Which way is up, as seen from the camera at this moment. */
export function upInCamera(sample: MotionSample, convention: OrientationConvention): Vec3 {
  return rotate(qconj(convention.map(sample.q)), convention.up);
}

/**
 * Rate of turn about the vertical, in radians per second, resampled to `hz`.
 * Positive is clockwise seen from above, to match compass course: the accelerometer
 * reads upwards at rest, and a positive rotation about up is anticlockwise.
 */
export function cameraYawRate(samples: MotionSample[], convention: OrientationConvention, hz: number): Float64Array {
  const n = Math.floor(samples[samples.length - 1].t * hz);
  const sum = new Float64Array(n);
  for (let i = 1; i < samples.length; i++) {
    const a = convention.map(samples[i - 1].q);
    const b = convention.map(samples[i].q);
    let d = qmul(b, qconj(a));
    if (d[0] < 0) d = [-d[0], -d[1], -d[2], -d[3]];
    const axis: Vec3 = [d[1], d[2], d[3]];
    const angle = 2 * Math.atan2(norm(axis), d[0]);
    const scale = norm(axis) > 1e-12 ? angle / norm(axis) : 2;
    const yaw = -dot(axis, convention.up) * scale;
    const bin = Math.floor(samples[i].t * hz);
    if (bin < n) sum[bin] += yaw;
  }
  return sum.map(v => v * hz);
}

/**
 * Road vibration level, resampled to `hz`. Rougher means faster on a bike, so this
 * tracks GPS speed without using the orientation data the yaw match relies on.
 */
export function vibrationLevel(samples: MotionSample[], hz: number): Float64Array {
  const n = Math.floor(samples[samples.length - 1].t * hz);
  const sum = new Float64Array(n);
  const count = new Float64Array(n);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i].accel;
    const b = samples[i - 1].accel;
    const bin = Math.floor(samples[i].t * hz);
    if (bin >= n) continue;
    sum[bin] += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    count[bin]++;
  }
  return sum.map((v, i) => (count[i] ? Math.sqrt(v / count[i]) : 0));
}

/** Interpolates a track onto a fixed grid, starting at `start`. */
export function resample(track: TrackPoint[], start: number, hz: number): { lat: Float64Array; lon: Float64Array; speed: Float64Array } {
  const end = track[track.length - 1].t;
  const n = Math.floor((end - start) * hz);
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const speed = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = start + i / hz;
    while (j + 1 < track.length - 1 && track[j + 1].t <= t) j++;
    const a = track[j];
    const b = track[j + 1];
    const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    lat[i] = a.lat + (b.lat - a.lat) * f;
    lon[i] = a.lon + (b.lon - a.lon) * f;
    speed[i] = (a.speed ?? 0) + ((b.speed ?? 0) - (a.speed ?? 0)) * f;
  }
  return { lat, lon, speed };
}

/**
 * Rate of change of GPS course, in radians per second. Course is measured over
 * `spanS` because sub-second GPS movement is mostly noise, and it is treated as
 * zero below walking pace, where course is meaningless.
 */
export function gpsYawRate(grid: ReturnType<typeof resample>, hz: number, spanS: number): Float64Array {
  const n = grid.lat.length;
  const half = Math.max(1, Math.round((spanS * hz) / 2));
  const course = new Float64Array(n);
  const valid = new Uint8Array(n);
  for (let i = half; i < n - half; i++) {
    const midLat = (grid.lat[i] * Math.PI) / 180;
    const dy = grid.lat[i + half] - grid.lat[i - half];
    const dx = (grid.lon[i + half] - grid.lon[i - half]) * Math.cos(midLat);
    const metres = Math.sqrt(dx * dx + dy * dy) * 111_320;
    if (metres / (2 * half / hz) < 1.5) continue;
    course[i] = Math.atan2(dx, dy);
    valid[i] = 1;
  }
  const rate = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    if (!valid[i] || !valid[i - 1]) continue;
    let d = course[i] - course[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    rate[i] = d * hz;
  }
  return rate;
}

export function smooth(signal: Float64Array, width: number): Float64Array {
  const half = Math.floor(width / 2);
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let weight = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j < 0 || j >= signal.length) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / (half + 1));
      sum += signal[j] * w;
      weight += w;
    }
    out[i] = sum / weight;
  }
  return out;
}

export interface CorrelationScores {
  scores: Float64Array;
  /** Haystack position of scores[0]; negative when the needle may start before the haystack. */
  origin: number;
}

/**
 * Pearson correlation of `needle` against `haystack` at each start position. A clip
 * can begin before or outlast its activity, so positions count as long as
 * `minOverlap` of the needle lands on the haystack.
 */
export function slidingCorrelation(needle: Float64Array, haystack: Float64Array, minOverlap = 0.6): CorrelationScores {
  const m = needle.length;
  const overhang = Math.floor(m * (1 - minOverlap));
  const origin = -overhang;
  const scores = new Float64Array(Math.max(0, haystack.length - m + 1 + 2 * overhang));
  for (let k = 0; k < scores.length; k++) {
    const s = origin + k;
    const from = Math.max(0, -s);
    const to = Math.min(m, haystack.length - s);
    const count = to - from;
    let needleMean = 0;
    let hayMean = 0;
    for (let i = from; i < to; i++) {
      needleMean += needle[i];
      hayMean += haystack[s + i];
    }
    needleMean /= count;
    hayMean /= count;
    let cov = 0;
    let needleVar = 0;
    let hayVar = 0;
    for (let i = from; i < to; i++) {
      const a = needle[i] - needleMean;
      const b = haystack[s + i] - hayMean;
      cov += a * b;
      needleVar += a * a;
      hayVar += b * b;
    }
    scores[k] = needleVar > 1e-9 && hayVar > 1e-9 ? cov / Math.sqrt(needleVar * hayVar) : 0;
  }
  return { scores, origin };
}

export interface Peak {
  index: number;
  score: number;
}

/** Highest peaks, each at least `minGap` positions from a stronger one. */
export function topPeaks(scores: Float64Array, count: number, minGap: number): Peak[] {
  const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
  const peaks: Peak[] = [];
  for (const index of order) {
    if (peaks.every(p => Math.abs(p.index - index) >= minGap)) {
      peaks.push({ index, score: scores[index] });
      if (peaks.length === count) break;
    }
  }
  return peaks;
}
