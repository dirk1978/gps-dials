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
/** Below walking pace, GPS drift looks like sharp turns. */
const MIN_TURNING_SPEED = 2;
const MOVING_SPEED = 0.5;
const MAX_SPEED_POINTS = 3;

export interface OverlayData {
  track: TrackColumns;
  /** Metres from the start of the track at each point. */
  distance: number[];
  /** Base-unit values at each track point, for channels that come from the track. */
  series: Partial<Record<ChannelId, (number | null)[]>>;
  /** Channels with at least one real value in this track. */
  available: Set<ChannelId>;
  gradientSpan: number;
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

export function prepareOverlayData(track: TrackColumns, gradientSpan = DEFAULT_GRADIENT_SPAN_M): OverlayData {
  const n = track.t.length;
  const distance = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1] + metresBetween(track, i - 1, i);
  const total = distance[n - 1];
  const speed = track.speed.some(v => v != null) ? track.speed : speedFromPositions(track, distance);
  const startAltitude = track.altitude.find(v => v != null) ?? 0;
  const heading = headingSeries(track, distance);
  const forward = forwardAcceleration(track.t, speed);
  const lateral = lateralAcceleration(track.t, speed, heading);

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
  };

  const available = new Set<ChannelId>(CHANNELS.filter(c => c.clock).map(c => c.id));
  for (const [id, values] of Object.entries(series)) {
    // Zero alone means a sensor wasn't connected, so it doesn't count as data.
    if (values?.some(v => v != null && (v !== 0 || id === 'gradient' || id === 'ascent'))) available.add(id as ChannelId);
  }
  if (available.has('heartRate')) available.add('heartZone');
  if (available.has('power')) available.add('powerZone');
  return { track, distance, series, available, gradientSpan };
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
  if (!values) return null;
  const { t } = data.track;

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
