import type { ClipSensors } from '../devices/types.ts';
import { indexAtTime, type TrackColumns } from '../sync/timeline.ts';
import { CHANNELS, GRAVITY, type ChannelId } from './channels.ts';

const EARTH_RADIUS_M = 6_371_000;
/**
 * Measured on a 52 km ride recorded by two devices: at 40 m they disagreed by 4.8
 * points and showed an impossible 32%. At 100 m it was 2.1 points and 22%, keeping
 * short ramps that 200 m flattens out.
 */
export const DEFAULT_GRADIENT_SPAN_M = 100;
/** Altitude has to rise this much from a low point to count as climbing, or noise adds up to false metres. */
const ASCENT_THRESHOLD_M = 2;
const VERTICAL_SPAN_S = 30;
const HEADING_SPAN_M = 15;
const DERIVED_SPEED_SPAN_S = 2;
const ACCELERATION_SPAN_S = 3;
const TURN_SPAN_S = 3;
/** A lap this much shorter than usual is the odd bit at the end, not a lap to beat. */
const FULL_LAP = 0.9;
/** Pace swings wildly over the first few metres of a lap. */
const MIN_LAP_METRES = 20;
/** Below walking pace, GPS drift looks like sharp turns. */
const MIN_TURNING_SPEED = 2;
const MOVING_SPEED = 0.5;
const MAX_SPEED_POINTS = 3;
const STOPPED_SPEED = 0.5;
/** Sideways force, in m/s², that counts as being in a corner rather than following a bend in the road. */
const CORNER_FORCE = 1.5;
const MAX_LAUNCH_S = 60;
const METRES_PER_KM = 1000;
const METRES_PER_MILE = 1609.344;
/** 20 mph, which a bike reaches from a standing start. */
export const DEFAULT_LAUNCH_SPEED = 8.9408;

/** One lap the device recorded. The last runs to the end of the track. */
export interface Lap {
  number: number;
  start: number;
  end: number;
  /** Seconds. */
  time: number;
  /** Metres. */
  distance: number;
  first: number;
  last: number;
}

export interface OverlayData {
  track: TrackColumns;
  laps: Lap[];
  /** Metres from the start of the track at each point. */
  distance: number[];
  /** Base-unit values at each track point, for channels that come from the track. */
  series: Partial<Record<ChannelId, (number | null)[]>>;
  /** Channels with at least one real value in this track. */
  available: Set<ChannelId>;
  gradientSpan: number;
  /** The speed a standing-start timer runs to, in m/s. */
  launchSpeed: number;
}

function metresBetween(track: TrackColumns, i: number, j: number): number {
  const toRad = Math.PI / 180;
  const midLat = ((track.lat[i] + track.lat[j]) / 2) * toRad;
  const dy = (track.lat[j] - track.lat[i]) * toRad;
  const dx = (track.lon[j] - track.lon[i]) * toRad * Math.cos(midLat);
  return Math.sqrt(dx * dx + dy * dy) * EARTH_RADIUS_M;
}

function gradientSeries(track: TrackColumns, distance: number[], span: number): (number | null)[] {
  // Altitude is too noisy to compare neighbouring points, so measure across a fixed length of road.
  const n = track.t.length;
  const out = new Array<number | null>(n).fill(null);
  let from = 0;
  let to = 0;
  for (let i = 0; i < n; i++) {
    while (from < i && distance[i] - distance[from] > span / 2) from++;
    while (to < n - 1 && distance[to] - distance[i] < span / 2) to++;
    const run = distance[to] - distance[from];
    const a = track.altitude[from];
    const b = track.altitude[to];
    if (run >= span / 2 && a != null && b != null) out[i] = ((b - a) / run) * 100;
  }
  return out;
}

function ascentSeries(track: TrackColumns): (number | null)[] {
  let total = 0;
  let base: number | null = null;
  return track.altitude.map(a => {
    if (a == null) return total;
    if (base == null || a < base) base = a;
    else if (a - base >= ASCENT_THRESHOLD_M) {
      total += a - base;
      base = a;
    }
    return total;
  });
}

function verticalSpeedSeries(track: TrackColumns): (number | null)[] {
  const n = track.t.length;
  const out = new Array<number | null>(n).fill(null);
  let from = 0;
  for (let i = 0; i < n; i++) {
    while (track.t[i] - track.t[from] > VERTICAL_SPAN_S) from++;
    const a = track.altitude[from];
    const b = track.altitude[i];
    const span = track.t[i] - track.t[from];
    if (a != null && b != null && span > 0) out[i] = ((b - a) / span) * 3600;
  }
  return out;
}

function headingSeries(track: TrackColumns, distance: number[]): (number | null)[] {
  const n = track.t.length;
  const out = new Array<number | null>(n).fill(null);
  let from = 0;
  for (let i = 1; i < n; i++) {
    while (distance[i] - distance[from] > HEADING_SPAN_M) from++;
    if (from === i) from = i - 1;
    const midLat = (track.lat[i] * Math.PI) / 180;
    const dy = track.lat[i] - track.lat[from];
    const dx = (track.lon[i] - track.lon[from]) * Math.cos(midLat);
    if (dx !== 0 || dy !== 0) out[i] = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  }
  return out;
}

/** The first and last points within `span` seconds either side of each point. */
function centredWindow(t: number[], span: number, visit: (i: number, from: number, to: number) => void): void {
  let from = 0;
  let to = 0;
  for (let i = 0; i < t.length; i++) {
    while (t[i] - t[from] > span / 2) from++;
    while (to < t.length - 1 && t[to + 1] - t[i] <= span / 2) to++;
    visit(i, from, to);
  }
}

/** Speeding up or braking, in m/s². GPS speed is too noisy to compare neighbouring points. */
function forwardAcceleration(t: number[], speed: (number | null)[]): (number | null)[] {
  const out = new Array<number | null>(t.length).fill(null);
  centredWindow(t, ACCELERATION_SPAN_S, (i, from, to) => {
    const a = speed[from];
    const b = speed[to];
    if (a != null && b != null && t[to] > t[from]) out[i] = (b - a) / (t[to] - t[from]);
  });
  return out;
}

/** Cornering force in m/s², positive turning right: speed times how fast the direction is changing. */
function lateralAcceleration(t: number[], speed: (number | null)[], heading: (number | null)[]): (number | null)[] {
  const out = new Array<number | null>(t.length).fill(null);
  centredWindow(t, TURN_SPAN_S, (i, from, to) => {
    const a = heading[from];
    const b = heading[to];
    const v = speed[i];
    if (a == null || b == null || v == null || t[to] <= t[from]) return;
    if (v < MIN_TURNING_SPEED) {
      out[i] = 0;
      return;
    }
    const turn = (((b - a) % 360) + 540) % 360 - 180;
    out[i] = v * ((turn * Math.PI) / 180 / (t[to] - t[from]));
  });
  return out;
}

/** Average speed while moving, so a cafe stop doesn't drag it down. */
function averageSpeedSeries(t: number[], distance: number[], speed: (number | null)[]): (number | null)[] {
  let moving = 0;
  let covered = 0;
  return t.map((_, i) => {
    if (i > 0 && (speed[i] ?? 0) >= MOVING_SPEED) {
      moving += t[i] - t[i - 1];
      covered += distance[i] - distance[i - 1];
    }
    return moving > 0 ? covered / moving : null;
  });
}

/** Fastest so far, over a few points so that one GPS jump can't set the record. */
function maxSpeedSeries(speed: (number | null)[]): (number | null)[] {
  let best: number | null = null;
  return speed.map((_, i) => {
    const near = speed.slice(Math.max(0, i - MAX_SPEED_POINTS + 1), i + 1).filter(v => v != null);
    if (near.length === MAX_SPEED_POINTS) {
      const mean = near.reduce((sum, v) => sum + v, 0) / near.length;
      if (best == null || mean > best) best = mean;
    }
    return best;
  });
}

/** The lap at each point, and how long it has been running, plus the last and best finished laps. */
export function lapList(t: number[], distance: number[], starts: number[]): Lap[] {
  const sorted = [...new Set(starts)].sort((a, b) => a - b).filter(s => s < t[t.length - 1]);
  if (sorted.length < 2) return [];
  return sorted.map((start, i) => {
    const end = sorted[i + 1] ?? t[t.length - 1];
    const first = indexAtTime(t, Math.max(start, t[0]));
    const last = indexAtTime(t, end);
    return { number: i + 1, start, end, time: end - start, distance: distance[last] - distance[first], first, last };
  });
}

/** The fastest of the first `count` laps. A short lap at the end isn't a fair comparison, so it's left out. */
export function fastestLap(laps: Lap[], count: number): Lap | null {
  const lengths = laps.map(l => l.distance).sort((a, b) => a - b);
  const usual = lengths[lengths.length >> 1] ?? 0;
  const fair = laps.slice(0, Math.max(0, count)).filter(l => l.distance >= usual * FULL_LAP);
  return fair.reduce<Lap | null>((best, lap) => (!best || lap.time < best.time ? lap : best), null);
}

const lapMeans = new WeakMap<object, Map<number, number | null>>();

/** What a lap's readings came to: its true average speed or pace, its total climb, or a plain mean. */
export function lapAverage(data: OverlayData, id: ChannelId, lap: Lap): number | null {
  if (id === 'speed') return lap.time > 0 ? lap.distance / lap.time : null;
  if (id === 'pace') return lap.distance > 0 ? lap.time / lap.distance : null;
  if (id === 'distance') return lap.distance;
  const values = data.series[id];
  if (!values) return null;
  if (id === 'ascent') return (values[lap.last] ?? 0) - (values[lap.first] ?? 0);
  let known = lapMeans.get(values);
  if (!known) lapMeans.set(values, known = new Map());
  if (!known.has(lap.number)) {
    let sum = 0;
    let count = 0;
    for (let i = lap.first; i <= lap.last; i++) {
      if (values[i] != null) {
        sum += values[i]!;
        count++;
      }
    }
    known.set(lap.number, count ? sum / count : null);
  }
  return known.get(lap.number)!;
}

/** How the running lap is going, and how much quicker or slower the last lap was than the one before. */
function lapProgress(t: number[], distance: number[], laps: Lap[]): Pick<OverlayData['series'], 'lapGap' | 'lapDistance' | 'lapSpeed' | 'lapPace'> {
  const none = t.map(() => null);
  if (laps.length === 0) return { lapGap: none, lapDistance: none, lapSpeed: none, lapPace: none };
  const into = t.map((time, i) => {
    const n = laps.findLastIndex(l => time >= l.start);
    if (n < 0) return null;
    const lap = laps[n];
    return { metres: distance[i] - distance[lap.first], seconds: time - lap.start, change: n >= 2 ? laps[n - 1].time - laps[n - 2].time : null };
  });
  return {
    lapGap: into.map(l => l?.change ?? null),
    lapDistance: into.map(l => l?.metres ?? null),
    lapSpeed: into.map(l => (l && l.seconds > 0 ? l.metres / l.seconds : null)),
    lapPace: into.map(l => (l && l.metres > MIN_LAP_METRES ? l.seconds / l.metres : null)),
  };
}

function lapSeries(t: number[], starts: number[]): Pick<OverlayData['series'], 'lapNumber' | 'lapTime' | 'lastLap' | 'bestLap'> {
  const none = t.map(() => null);
  if (starts.length < 2) return { lapNumber: none, lapTime: none, lastLap: none, bestLap: none };
  const sorted = [...starts].sort((a, b) => a - b);
  let lap = -1;
  let best: number | null = null;
  let last: number | null = null;
  const number: (number | null)[] = [];
  const running: (number | null)[] = [];
  const lastLap: (number | null)[] = [];
  const bestLap: (number | null)[] = [];
  for (const time of t) {
    while (lap + 1 < sorted.length && sorted[lap + 1] <= time) {
      lap++;
      if (lap > 0) {
        last = sorted[lap] - sorted[lap - 1];
        best = best == null ? last : Math.min(best, last);
      }
    }
    number.push(lap < 0 ? null : lap + 1);
    running.push(lap < 0 ? null : time - sorted[lap]);
    lastLap.push(last);
    bestLap.push(best);
  }
  return { lapNumber: number, lapTime: running, lastLap, bestLap };
}

/** How long the last whole stretch of `length` metres took, like a kilometre split. */
function splitSeries(t: number[], distance: number[], length: number): (number | null)[] {
  let reachedAt = t[0];
  let next = length;
  let last: number | null = null;
  return t.map((time, i) => {
    while (distance[i] >= next) {
      // Between points, so the split doesn't depend on how often the device records.
      const before = distance[i - 1];
      const f = distance[i] > before ? (next - before) / (distance[i] - before) : 1;
      const at = t[i - 1] + (time - t[i - 1]) * f;
      last = at - reachedAt;
      reachedAt = at;
      next += length;
    }
    return last;
  });
}

/** A timer from each standing start: runs until the target speed, then holds its result. */
function launchSeries(t: number[], speed: (number | null)[], target: number): (number | null)[] {
  let startedAt: number | null = null;
  let shown: number | null = null;
  return t.map((time, i) => {
    const v = speed[i] ?? 0;
    if (v < STOPPED_SPEED) {
      startedAt = time;
      return shown;
    }
    if (startedAt == null) return shown;
    const taken = time - startedAt;
    if (v >= target) {
      startedAt = null;
      shown = taken;
    } else if (taken <= MAX_LAUNCH_S) {
      return taken;
    } else {
      // A slow roll away from a junction isn't a start worth timing.
      startedAt = null;
    }
    return shown;
  });
}

/** The slowest point of the last finished corner, held until the next one is done. */
function cornerSpeedSeries(speed: (number | null)[], lateral: (number | null)[]): (number | null)[] {
  let apex: number | null = null;
  let shown: number | null = null;
  return speed.map((v, i) => {
    if (Math.abs(lateral[i] ?? 0) >= CORNER_FORCE) {
      if (v != null) apex = apex == null ? v : Math.min(apex, v);
    } else if (apex != null) {
      shown = apex;
      apex = null;
    }
    return shown;
  });
}

/** For recordings without a speed sensor, such as a drone's subtitle track. */
function speedFromPositions(track: TrackColumns, distance: number[]): (number | null)[] {
  const n = track.t.length;
  const out = new Array<number | null>(n).fill(null);
  let from = 0;
  for (let i = 1; i < n; i++) {
    while (from < i - 1 && track.t[i] - track.t[from] > DERIVED_SPEED_SPAN_S) from++;
    const span = track.t[i] - track.t[from];
    if (span > 0) out[i] = (distance[i] - distance[from]) / span;
  }
  out[0] = out[1] ?? null;
  return out;
}

export function prepareOverlayData(track: TrackColumns, gradientSpan = DEFAULT_GRADIENT_SPAN_M, launchSpeed = DEFAULT_LAUNCH_SPEED): OverlayData {
  const n = track.t.length;
  const distance = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1] + metresBetween(track, i - 1, i);
  const total = distance[n - 1];
  const speed = track.speed.some(v => v != null) ? track.speed : speedFromPositions(track, distance);
  const startAltitude = track.altitude.find(v => v != null) ?? 0;
  const heading = headingSeries(track, distance);
  const forward = forwardAcceleration(track.t, speed);
  const lateral = lateralAcceleration(track.t, speed, heading);

  const laps = lapList(track.t, distance, track.lapStarts ?? []);
  const lapped = lapSeries(track.t, track.lapStarts ?? []);
  const series: OverlayData['series'] = {
    speed,
    pace: speed.map(v => (v != null && v > 0.5 ? 1 / v : null)),
    heartRate: track.heartRate,
    cadence: track.cadence,
    power: track.power,
    temperature: track.temperature,
    altitude: track.altitude,
    height: track.altitude.map(a => (a == null ? null : a - startAltitude)),
    homeDistance: track.t.map((_, i) => metresBetween(track, 0, i)),
    gradient: gradientSeries(track, distance, gradientSpan),
    ascent: ascentSeries(track),
    verticalSpeed: verticalSpeedSeries(track),
    heading,
    distance,
    remaining: distance.map(d => total - d),
    progress: distance.map(d => (total > 0 ? (d / total) * 100 : null)),
    averageSpeed: averageSpeedSeries(track.t, distance, speed),
    maxSpeed: maxSpeedSeries(speed),
    accelForward: forward,
    accelLateral: lateral,
    gForce: forward.map((a, i) => (a == null || lateral[i] == null ? null : Math.hypot(a, lateral[i]))),
    // The lean that balances cornering force, as for a bike, or the bank of a level turn in a plane.
    leanAngle: lateral.map(a => (a == null ? null : (Math.atan(a / GRAVITY) * 180) / Math.PI)),
    latitude: track.lat,
    longitude: track.lon,
    ...lapped,
    ...lapProgress(track.t, distance, laps),
    splitKm: splitSeries(track.t, distance, METRES_PER_KM),
    splitMile: splitSeries(track.t, distance, METRES_PER_MILE),
    launchTime: launchSeries(track.t, speed, launchSpeed),
    cornerSpeed: cornerSpeedSeries(speed, lateral),
  };

  const available = new Set<ChannelId>(CHANNELS.filter(c => c.clock).map(c => c.id));
  for (const [id, values] of Object.entries(series)) {
    // Zero alone means a sensor wasn't connected, so it doesn't count as data.
    if (values?.some(v => v != null && (v !== 0 || id === 'gradient' || id === 'ascent'))) available.add(id as ChannelId);
  }
  if (available.has('heartRate')) available.add('heartZone');
  if (available.has('power')) available.add('powerZone');
  return { track, laps, distance, series, available, gradientSpan, launchSpeed };
}

/** When the track reached `metres` along itself. */
export function timeAtDistance(data: OverlayData, metres: number): number {
  const { distance, track: { t } } = data;
  let low = 0;
  let high = distance.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (distance[mid] <= metres) low = mid;
    else high = mid;
  }
  const span = distance[high] - distance[low];
  const f = span > 0 ? Math.min(1, Math.max(0, (metres - distance[low]) / span)) : 0;
  return t[low] + (t[high] - t[low]) * f;
}

/** Averages directions, where a plain average of 359 and 1 would point south instead of north. */
function meanHeading(values: (number | null)[], from: number, to: number): number | null {
  let x = 0;
  let y = 0;
  for (let i = from; i <= to; i++) {
    const v = values[i];
    if (v == null) continue;
    x += Math.sin((v * Math.PI) / 180);
    y += Math.cos((v * Math.PI) / 180);
  }
  if (x === 0 && y === 0) return null;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** A base-unit value at `time`, averaged over `smoothing` seconds when asked. */
export function seriesValue(data: OverlayData, channel: ChannelId, time: number, smoothing = 0): number | null {
  const values = data.series[channel];
  return values ? valueAmong(data.track.t, values, channel, time, smoothing) : null;
}

/** A reading from the camera, which is on the clip's clock. Null past either end of the clip. */
export function sensorValue(sensors: ClipSensors, channel: ChannelId, clipTime: number, smoothing = 0): number | null {
  const values = sensors.series[channel];
  const { t } = sensors;
  if (!values || t.length === 0 || clipTime < 0 || clipTime > t[t.length - 1]) return null;
  return valueAmong(t, values, channel, clipTime, smoothing);
}

function valueAmong(t: number[], values: (number | null)[], channel: ChannelId, time: number, smoothing: number): number | null {
  if (smoothing > 0) {
    const from = indexAtTime(t, time - smoothing / 2);
    const to = indexAtTime(t, time + smoothing / 2);
    if (channel === 'heading') return meanHeading(values, from, to);
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      const v = values[i];
      if (v != null) {
        sum += v;
        count++;
      }
    }
    return count ? sum / count : null;
  }

  const i = indexAtTime(t, time);
  const j = Math.min(i + 1, t.length - 1);
  const span = t[j] - t[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (time - t[i]) / span)) : 0;
  const a = values[i];
  const b = values[j];
  if (a == null) return b ?? null;
  if (b == null) return a;
  // Heading wraps at north, so blending 359 and 1 must not give 180.
  if (channel === 'heading') return (a + ((((b - a) % 360) + 540) % 360 - 180) * f + 360) % 360;
  return a + (b - a) * f;
}
