export type Quaternion = [number, number, number, number];

export interface MotionSample {
  /** Seconds from the start of the clip. */
  t: number;
  /** Camera orientation, in the order the device stores it. */
  q: Quaternion;
  /** Accelerometer, in g. */
  accel: [number, number, number];
}

export interface ClipMotion {
  /**
   * Rate of turn about the vertical in radians per second, sampled at the `hz` asked
   * for, one value per sample from the start of the clip. Positive is clockwise seen
   * from above, the same way as a compass. The scale may be approximate.
   */
  turnRate: Float64Array;
  /** Optional measure that rises with speed, such as road vibration, at the same rate. */
  roughness?: Float64Array;
  /** Short description of the data used, shown in the report. */
  source: string;
}

/**
 * Teaches gps-dials to read one camera or drone. Add a file in this folder and list
 * it in `index.ts`; nothing else needs to change.
 */
export interface DeviceAdapter {
  /** Stable lowercase id, used with `--device`. */
  id: string;
  /** Name as people know it, shown in the supported devices table. */
  name: string;
  /** Must be quick and must not throw for files from other devices. */
  canRead(clip: string): boolean;
  /** `upsideDown` is set when the picture is inverted and the file doesn't say so. */
  readMotion(clip: string, hz: number, upsideDown?: boolean): Promise<ClipMotion>;
}
