import { detectConvention } from '../sync/correlate.ts';
import { djiAction4 } from './dji-action-4.ts';
import { readDjmdMotion, readDjmdProtocol } from './dji/djmd.ts';
import { genericVideo } from './generic-video.ts';
import type { DeviceAdapter } from './types.ts';

/** Enough samples to judge, and gravity steady enough to trust the orientation. */
const MIN_SAMPLES = 100;
const MIN_TIGHTNESS = 0.8;

function hasUsableOrientation(clip: string): boolean {
  try {
    const samples = readDjmdMotion(clip);
    return samples.length >= MIN_SAMPLES && detectConvention(samples).tightness >= MIN_TIGHTNESS;
  } catch {
    return false;
  }
}

/**
 * DJI models we haven't tried. Many share the Action 4's layout, so that is tried first
 * and checked against gravity, and anything that doesn't fit falls back to the picture.
 */
export const djiOther: DeviceAdapter = {
  id: 'dji-other',
  name: 'Other DJI cameras',

  canRead(clip) {
    try {
      return readDjmdProtocol(clip) != null;
    } catch {
      return false;
    }
  },

  async readMotion(clip, hz, upsideDown, onProgress) {
    return hasUsableOrientation(clip) ? djiAction4.readMotion(clip, hz) : genericVideo.readMotion(clip, hz, upsideDown, onProgress);
  },

  readSensors: clip => djiAction4.readSensors!(clip),
};
