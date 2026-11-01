import { djiAction4 } from './dji-action-4.ts';
import { genericVideo } from './generic-video.ts';
import type { DeviceAdapter } from './types.ts';

/** Tried in order, so add new devices above `genericVideo`, which accepts everything. */
export const devices: DeviceAdapter[] = [
  djiAction4,
  genericVideo,
];

export function findDevice(clip: string, id?: string): DeviceAdapter {
  if (id) {
    const device = devices.find(d => d.id === id);
    if (!device) throw new Error(`Unknown device "${id}". Known devices: ${devices.map(d => d.id).join(', ')}`);
    return device;
  }
  return devices.find(d => d.canRead(clip))!;
}
