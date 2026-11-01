import { imageYawRate } from '../sync/opticalFlow.ts';
import type { DeviceAdapter } from './types.ts';

/** Measures turning from the picture, so it reads any video. It is always tried last. */
export const genericVideo: DeviceAdapter = {
  id: 'generic-video',
  name: 'Any video (motion measured from the picture)',

  canRead() {
    return true;
  },

  async readMotion(clip, hz) {
    return { turnRate: await imageYawRate(clip, hz), source: 'picture motion' };
  },
};
