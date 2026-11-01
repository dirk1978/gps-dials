export interface TrackPoint {
  /** Seconds since the Unix epoch. UTC where the source records it. */
  t: number;
  lat: number;
  lon: number;
  /** Metres per second. */
  speed?: number;
  heartRate?: number;
  altitude?: number;
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
