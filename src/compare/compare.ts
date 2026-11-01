import type { TrackPoint } from '../activity/types.ts';
import { toColumns } from '../activity/columns.ts';
import { prepareOverlayData, seriesValue, type OverlayData } from '../overlay/data.ts';
import type { ChannelId } from '../overlay/channels.ts';

const MAX_LAG_S = 30;
const MPS_TO_MPH = 2.23694;
const EARTH_RADIUS_M = 6_371_000;

export interface Source {
  name: string;
  points: TrackPoint[];
}

export interface SourceSummary {
  name: string;
  points: number;
  /** Typical gap between recorded points, in seconds. */
  interval: number;
  distanceKm: number;
  ascentM: number;
  maxMph: number | null;
  averageHr: number | null;
  minAltitude: number | null;
  maxAltitude: number | null;
  channels: ChannelId[];
}

export interface PairComparison {
  name: string;
  /** Seconds this source's clock runs ahead of the reference, found by matching speed. */
  clockOffset: number;
  positionMedianM: number;
  positionP95M: number;
  altitudeOffsetM: number | null;
  /** Spread once the constant offset is removed, which shows how differently the two read the hills. */
  altitudeSpreadM: number | null;
  speedRmsMph: number | null;
  heartRateRms: number | null;
  gradientRms: number | null;
}

const prepare = (s: Source) => prepareOverlayData(toColumns(s.points));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function rms(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
}

function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dy = (bLat - aLat) * toRad;
  const dx = (bLon - aLon) * toRad * Math.cos((aLat * toRad));
  return Math.sqrt(dx * dx + dy * dy) * EARTH_RADIUS_M;
}

export function summarise(source: Source): SourceSummary {
  const data = prepare(source);
  const { track } = data;
  const gaps = track.t.slice(1).map((t, i) => t - track.t[i]);
  const known = (values: (number | null)[] | undefined) => (values ?? []).filter((v): v is number => v != null);
  const speeds = known(track.speed);
  const heart = known(track.heartRate).filter(v => v > 0);
  const altitudes = known(track.altitude);
  return {
    name: source.name,
    points: track.t.length,
    interval: gaps.length ? median(gaps) : 0,
    distanceKm: data.distance[data.distance.length - 1] / 1000,
    ascentM: data.series.ascent?.at(-1) ?? 0,
    maxMph: speeds.length ? Math.max(...speeds) * MPS_TO_MPH : null,
    averageHr: heart.length ? heart.reduce((a, b) => a + b, 0) / heart.length : null,
    minAltitude: altitudes.length ? Math.min(...altitudes) : null,
    maxAltitude: altitudes.length ? Math.max(...altitudes) : null,
    channels: [...data.available],
  };
}

/** Finds how far apart two recordings' clocks are by sliding one speed trace along the other. */
export function clockOffset(reference: OverlayData, other: OverlayData): number {
  const from = Math.max(reference.track.t[0], other.track.t[0]) + MAX_LAG_S;
  const to = Math.min(reference.track.t.at(-1)!, other.track.t.at(-1)!) - MAX_LAG_S;
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -MAX_LAG_S; lag <= MAX_LAG_S; lag++) {
    let sum = 0;
    let count = 0;
    for (let t = from; t < to; t += 5) {
      const a = seriesValue(reference, 'speed', t);
      const b = seriesValue(other, 'speed', t + lag);
      if (a == null || b == null) continue;
      sum -= (a - b) ** 2;
      count++;
    }
    const score = count ? sum / count : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

function differences(reference: OverlayData, other: OverlayData, channel: ChannelId, lag: number, scale = 1): number[] {
  const out: number[] = [];
  const from = Math.max(reference.track.t[0], other.track.t[0] - lag);
  const to = Math.min(reference.track.t.at(-1)!, other.track.t.at(-1)! - lag);
  for (let t = from; t <= to; t += 2) {
    const a = seriesValue(reference, channel, t);
    const b = seriesValue(other, channel, t + lag);
    if (a != null && b != null) out.push((b - a) * scale);
  }
  return out;
}

export function compareSources(reference: Source, other: Source): PairComparison {
  const a = prepare(reference);
  const b = prepare(other);
  const lag = clockOffset(a, b);

  const gaps: number[] = [];
  const from = Math.max(a.track.t[0], b.track.t[0] - lag);
  const to = Math.min(a.track.t.at(-1)!, b.track.t.at(-1)! - lag);
  for (let t = from; t <= to; t += 2) {
    const i = nearest(a.track.t, t);
    const j = nearest(b.track.t, t + lag);
    gaps.push(metres(a.track.lat[i], a.track.lon[i], b.track.lat[j], b.track.lon[j]));
  }

  const altitude = differences(a, b, 'altitude', lag);
  const offset = altitude.length ? median(altitude) : null;
  const usable = (id: ChannelId) => a.available.has(id) && b.available.has(id);
  return {
    name: other.name,
    clockOffset: lag,
    positionMedianM: gaps.length ? median(gaps) : 0,
    positionP95M: gaps.length ? percentile(gaps, 0.95) : 0,
    altitudeOffsetM: offset,
    altitudeSpreadM: offset == null ? null : rms(altitude.map(v => v - offset)),
    speedRmsMph: usable('speed') ? rms(differences(a, b, 'speed', lag, MPS_TO_MPH)) : null,
    heartRateRms: usable('heartRate') ? rms(differences(a, b, 'heartRate', lag)) : null,
    gradientRms: usable('gradient') ? rms(differences(a, b, 'gradient', lag)) : null,
  };
}

function nearest(times: number[], t: number): number {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid] < t) low = mid + 1;
    else high = mid;
  }
  return low;
}

export interface ProfilePoint {
  /** Kilometres along the reference track. */
  km: number;
  altitude: (number | null)[];
}

/** Altitude from each source at matching moments, thinned out for drawing. */
export function altitudeProfiles(sources: Source[], lags: number[], maxPoints = 600): ProfilePoint[] {
  const data = sources.map(prepare);
  const reference = data[0];
  const { t } = reference.track;
  const step = Math.max(1, Math.floor(t.length / maxPoints));
  const out: ProfilePoint[] = [];
  for (let i = 0; i < t.length; i += step) {
    out.push({ km: reference.distance[i] / 1000, altitude: data.map((d, s) => seriesValue(d, 'altitude', t[i] + lags[s])) });
  }
  return out;
}

export interface TerrainPoint {
  t: number;
  lat: number;
  lon: number;
  elevation: number;
}

/** A point every `everyM` metres, which is all a terrain lookup needs to be sent. */
export function terrainSamples(source: Source, everyM: number): { t: number; lat: number; lon: number }[] {
  const data = prepare(source);
  const out: { t: number; lat: number; lon: number }[] = [];
  let next = 0;
  data.distance.forEach((d, i) => {
    if (d < next) return;
    next = d + everyM;
    out.push({ t: data.track.t[i], lat: data.track.lat[i], lon: data.track.lon[i] });
  });
  return out;
}

export interface TerrainCheck {
  name: string;
  /** How far this source sits above the terrain data, typically. */
  offsetM: number;
  /** How closely it follows the terrain's ups and downs once that offset is removed. Lower is closer. */
  shapeErrorM: number;
  ascentM: number;
}

const TERRAIN_ASCENT_STEP_M = 2;

export function terrainAscent(terrain: TerrainPoint[]): number {
  let total = 0;
  let base = terrain[0]?.elevation ?? 0;
  for (const { elevation } of terrain) {
    if (elevation < base) base = elevation;
    else if (elevation - base >= TERRAIN_ASCENT_STEP_M) {
      total += elevation - base;
      base = elevation;
    }
  }
  return total;
}

export function checkAgainstTerrain(source: Source, terrain: TerrainPoint[], lag: number): TerrainCheck {
  const data = prepare(source);
  const gaps: number[] = [];
  for (const p of terrain) {
    const a = seriesValue(data, 'altitude', p.t + lag);
    if (a != null) gaps.push(a - p.elevation);
  }
  const offset = gaps.length ? median(gaps) : 0;
  return {
    name: source.name,
    offsetM: offset,
    shapeErrorM: rms(gaps.map(g => g - offset)) ?? 0,
    ascentM: data.series.ascent?.at(-1) ?? 0,
  };
}

export type ChoiceChannel = 'position' | 'altitude' | 'speed' | 'heartRate' | 'cadence' | 'power' | 'temperature';
/** A source's index, or the average of all sources that have the value. */
export type Choice = number | 'average';
export type Choices = Record<ChoiceChannel, Choice>;

function pick(values: (number | null)[], choice: Choice): number | undefined {
  if (choice === 'average') {
    const known = values.filter((v): v is number => v != null);
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : undefined;
  }
  return values[choice] ?? undefined;
}

/**
 * Builds one track from several, on the first source's clock, once a second.
 * Altitude sources are shifted onto a shared level first, so averaging two devices
 * with different baselines gives the middle of their hills rather than a step.
 */
export function combineSources(sources: Source[], lags: number[], choices: Choices): TrackPoint[] {
  const data = sources.map(prepare);
  const reference = data[0];
  const from = Math.max(...data.map((d, i) => d.track.t[0] - lags[i]));
  const to = Math.min(...data.map((d, i) => d.track.t.at(-1)! - lags[i]));
  const altitudeOffsets = data.map((d, i) => {
    const diffs = differences(reference, d, 'altitude', lags[i]);
    return diffs.length ? median(diffs) : 0;
  });

  const read = (channel: ChannelId, t: number, shift?: number[]) => data.map((d, i) => {
    const v = seriesValue(d, channel, t + lags[i]);
    return v == null ? null : v - (shift?.[i] ?? 0);
  });

  const points: TrackPoint[] = [];
  for (let t = Math.ceil(from); t <= to; t++) {
    const place = data.map((d, i) => {
      const j = nearest(d.track.t, t + lags[i]);
      return [d.track.lat[j], d.track.lon[j]];
    });
    const lat = pick(place.map(p => p[0]), choices.position);
    const lon = pick(place.map(p => p[1]), choices.position);
    if (lat == null || lon == null) continue;
    points.push({
      t,
      lat,
      lon,
      speed: pick(read('speed', t), choices.speed),
      heartRate: pick(read('heartRate', t), choices.heartRate),
      altitude: pick(read('altitude', t, altitudeOffsets), choices.altitude),
      cadence: pick(read('cadence', t), choices.cadence),
      power: pick(read('power', t), choices.power),
      temperature: pick(read('temperature', t), choices.temperature),
    });
  }
  return points;
}
