/** Column-based track, cheap to send to the screen and quick to search. */
export interface TrackColumns {
  t: number[];
  lat: number[];
  lon: number[];
  speed: (number | null)[];
  heartRate: (number | null)[];
  altitude: (number | null)[];
  cadence?: (number | null)[];
  power?: (number | null)[];
  temperature?: (number | null)[];
  /** When each lap the device recorded began. */
  lapStarts?: number[];
}

/** Index of the last point at or before `time`, clamped to the track. */
export function indexAtTime(times: number[], time: number): number {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (times[mid] <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}

export interface Position {
  lat: number;
  lon: number;
  speed: number | null;
  heartRate: number | null;
  altitude: number | null;
}

function mix(a: number | null, b: number | null, f: number): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return a + (b - a) * f;
}

/** Track values at `time`, interpolated between recorded points and clamped to the ends. */
export function positionAt(track: TrackColumns, time: number): Position {
  const i = indexAtTime(track.t, time);
  const j = Math.min(i + 1, track.t.length - 1);
  const span = track.t[j] - track.t[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (time - track.t[i]) / span)) : 0;
  return {
    lat: track.lat[i] + (track.lat[j] - track.lat[i]) * f,
    lon: track.lon[i] + (track.lon[j] - track.lon[i]) * f,
    speed: mix(track.speed[i], track.speed[j], f),
    heartRate: mix(track.heartRate[i], track.heartRate[j], f),
    altitude: mix(track.altitude[i], track.altitude[j], f),
  };
}

/** Index of the track point closest to a clicked location. */
export function nearestIndex(track: TrackColumns, lat: number, lon: number): number {
  const scale = Math.cos((lat * Math.PI) / 180);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < track.t.length; i++) {
    const dy = track.lat[i] - lat;
    const dx = (track.lon[i] - lon) * scale;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** The clip's start time implied by matching a video moment to a moment on the track. */
export function clipStartFromPin(videoSeconds: number, trackTime: number): number {
  return trackTime - videoSeconds;
}
