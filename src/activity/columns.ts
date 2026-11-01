import type { TrackColumns } from '../sync/timeline.ts';
import type { TrackPoint } from './types.ts';

export function toColumns(points: TrackPoint[]): TrackColumns {
  return {
    t: points.map(p => p.t),
    lat: points.map(p => p.lat),
    lon: points.map(p => p.lon),
    speed: points.map(p => p.speed ?? null),
    heartRate: points.map(p => p.heartRate ?? null),
    altitude: points.map(p => p.altitude ?? null),
    cadence: points.map(p => p.cadence ?? null),
    power: points.map(p => p.power ?? null),
    temperature: points.map(p => p.temperature ?? null),
    lapStarts: points.flatMap(p => (p.lapStart ? [p.t] : [])),
  };
}
