/** An id from `src/activities`, or 'other' when nothing matches. */
export type ActivityKind = string;

export interface TrackPoint {
  /** Seconds since the Unix epoch. UTC where the source records it. */
  t: number;
  lat: number;
  lon: number;
  /** Metres per second. */
  speed?: number;
  heartRate?: number;
  altitude?: number;
  /** Revolutions or steps a minute, as the device reports it. */
  cadence?: number;
  /** Watts. */
  power?: number;
  /** Degrees Celsius. */
  temperature?: number;
  /** Set on the first point of each lap the device recorded. */
  lapStart?: boolean;
}

/**
 * Teaches gps-dials to read one kind of track file. Add a file in this folder and
 * list it in `index.ts`; nothing else needs to change.
 */
export interface ActivityFormat {
  name: string;
  /** Lowercase, with the dot. */
  extensions: string[];
  read(path: string): TrackPoint[];
}
