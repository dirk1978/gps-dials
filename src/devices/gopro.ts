import { genericVideo } from './generic-video.ts';
import { cameraSettings, findGpmfStream, gpsClipStart, gyroMotion, readPayloads } from './gopro/gpmf.ts';
import type { DeviceAdapter } from './types.ts';

/**
 * Reads GoPro's GPMF telemetry, which most models since the HERO5 Black share. Built from
 * GoPro's published format, not yet tested on real footage. Models without GPS still have a gyro.
 */
export const gopro: DeviceAdapter = {
  id: 'gopro',
  name: 'GoPro',

  canRead(clip) {
    try {
      return findGpmfStream(clip) != null;
    } catch {
      return false;
    }
  },

  async readMotion(clip, hz, upsideDown, onProgress) {
    const motion = gyroMotion(readPayloads(clip), hz);
    if (!motion) return genericVideo.readMotion(clip, hz, upsideDown, onProgress);
    return { ...motion, source: 'gyro', signUnknown: true };
  },

  readSensors: clip => cameraSettings(readPayloads(clip)),
  gpsStart: clip => gpsClipStart(readPayloads(clip)),
};
