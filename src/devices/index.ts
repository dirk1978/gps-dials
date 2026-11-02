import { djiAction4 } from './dji-action-4.ts';
import { djiNeo } from './dji-neo.ts';
import { djiOther } from './dji-other.ts';
import { genericVideo } from './generic-video.ts';
import { gopro } from './gopro.ts';
import { insta360 } from './insta360.ts';
import type { ClipSensors, DeviceAdapter } from './types.ts';

/** Tried in order, so add new devices above `genericVideo`, which accepts everything. */
export const devices: DeviceAdapter[] = [
  djiAction4,
  djiNeo,
  djiOther,
  gopro,
  insta360,
  genericVideo,
];

/** What the camera recorded about itself. A clip we can't read just goes without. */
export function readClipSensors(clip: string): ClipSensors | null {
  try {
    return findDevice(clip).readSensors?.(clip) ?? null;
  } catch {
    return null;
  }
}

export function findDevice(clip: string, id?: string): DeviceAdapter {
  if (id) {
    const device = devices.find(d => d.id === id);
    if (!device) throw new Error(`Unknown device "${id}". Known devices: ${devices.map(d => d.id).join(', ')}`);
    return device;
  }
  return devices.find(d => d.canRead(clip))!;
}
