import { indexAtTime, type TrackColumns } from '../sync/timeline.ts';
import { CHANNELS, type ChannelId } from './channels.ts';

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

export function prepareOverlayData(track: TrackColumns, gradientSpan = DEFAULT_GRADIENT_SPAN_M): OverlayData {
  const n = track.t.length;
  const distance = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1] + metresBetween(track, i - 1, i);
  const total = distance[n - 1];

  const series: OverlayData['series'] = {
    speed: track.speed,
    pace: track.speed.map(v => (v != null && v > 0.5 ? 1 / v : null)),
    heartRate: track.heartRate,
    cadence: track.cadence,
    power: track.power,
    temperature: track.temperature,
    altitude: track.altitude,
    gradient: gradientSeries(track, distance, gradientSpan),
    ascent: ascentSeries(track),
    verticalSpeed: verticalSpeedSeries(track),
    heading: headingSeries(track, distance),
    distance,
    remaining: distance.map(d => total - d),
  };

  const available = new Set<ChannelId>(CHANNELS.filter(c => c.clock).map(c => c.id));
  for (const [id, values] of Object.entries(series)) {
    // Zero alone means a sensor wasn't connected, so it doesn't count as data.
    if (values?.some(v => v != null && (v !== 0 || id === 'gradient' || id === 'ascent'))) available.add(id as ChannelId);
  }
  return { track, distance, series, available, gradientSpan };
}

/** A base-unit value at `time`, averaged over `smoothing` seconds when asked. */
export function seriesValue(data: OverlayData, channel: ChannelId, time: number, smoothing = 0): number | null {
  const values = data.series[channel];
  if (!values) return null;
  const { t } = data.track;

  if (smoothing > 0) {
    const from = indexAtTime(t, time - smoothing / 2);
    const to = indexAtTime(t, time + smoothing / 2);
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
