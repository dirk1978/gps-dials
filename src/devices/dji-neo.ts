import { readDjmdProtocol } from './dji/djmd.ts';
import { djiSettings } from './dji/settings.ts';
import { genericVideo } from './generic-video.ts';
import type { DeviceAdapter } from './types.ts';

/** Syncs from its subtitle file or the picture, and adds what the drone recorded about itself. */
export const djiNeo: DeviceAdapter = {
  id: 'dji-neo',
  name: 'DJI Neo',

  canRead(clip) {
    try {
      return readDjmdProtocol(clip) === 'dvtm_dji_neo.proto';
    } catch {
      return false;
    }
  },

  readMotion: (clip, hz, upsideDown, onProgress) => genericVideo.readMotion(clip, hz, upsideDown, onProgress),
  readSensors: djiSettings,
};
