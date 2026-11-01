import { cameraYawRate, detectConvention, vibrationLevel } from '../sync/correlate.ts';
import { readDjmdMotion, readDjmdProtocol } from './dji/djmd.ts';
import { djiSettings } from './dji/settings.ts';
import { cameraAttitude } from './sensors.ts';
import type { DeviceAdapter } from './types.ts';

export const djiAction4: DeviceAdapter = {
  id: 'dji-action-4',
  name: 'DJI Osmo Action 4',

  canRead(clip) {
    try {
      return readDjmdProtocol(clip) === 'dvtm_ac203.proto';
    } catch {
      return false;
    }
  },

  async readMotion(clip, hz) {
    const samples = readDjmdMotion(clip);
    const convention = detectConvention(samples);
    return {
      turnRate: cameraYawRate(samples, convention, hz),
      roughness: vibrationLevel(samples, hz),
      source: `orientation track (${convention.name}, gravity tightness ${convention.tightness.toFixed(3)})`,
    };
  },

  readSensors(clip) {
    const sensors = djiSettings(clip);
    const samples = readDjmdMotion(clip);
    if (!sensors || samples.length === 0) return sensors;
    const attitude = cameraAttitude(samples, detectConvention(samples), sensors.t);
    if (attitude) {
      sensors.series.leanAngle = attitude.lean;
      sensors.series.pitch = attitude.pitch;
    }
    return sensors;
  },
};
