import { BOTTOM_DIAL, DIAL_H, DIAL_W, LEFT, MAP_H, MAP_W, RIGHT_DIAL, layout } from './layout.ts';
import type { ActivityDef } from './types.ts';

export const drone: ActivityDef = {
  id: 'drone',
  name: 'Drone',
  extensions: ['.srt', '.mp4', '.mov'],
  channels: ['height', 'speed', 'maxSpeed', 'verticalSpeed', 'heading', 'leanAngle', 'pitch', 'homeDistance', 'altitude', 'distance', 'latitude', 'longitude', 'clipTime', 'timeOfDay', 'date'],
  layout: layout('Drone', [
    ['distance', 'map', LEFT, 0.025, MAP_W, MAP_H, { mapMode: 'fitClip', fullRide: false, markerStyle: 'arrow' }],
    ['height', 'dial', RIGHT_DIAL, 0.025, DIAL_W, DIAL_H],
    ['leanAngle', 'horizon', RIGHT_DIAL, 0.3675, DIAL_W, DIAL_H, { labelText: 'Attitude' }],
    ['speed', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H],
    ['heading', 'compass', LEFT, BOTTOM_DIAL, DIAL_W, DIAL_H],
    ['homeDistance', 'counter', 0.172, 0.84, 0.13, 0.135],
    ['clipTime', 'counter', 0.312, 0.84, 0.1, 0.135],
    ['height', 'graph', 0.422, 0.79, 0.4, 0.185, { windowSeconds: 60, autoRange: true, labelText: 'Height' }],
  ]),
};
