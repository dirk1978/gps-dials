import { BOTTOM_DIAL, DIAL_H, DIAL_W, LEFT, MAP_H, MAP_W, RIGHT_DIAL, layout } from './layout.ts';
import type { ActivityDef } from './types.ts';

export const boating: ActivityDef = {
  id: 'boating',
  name: 'Boating',
  fitSports: [15, 19, 23, 32, 37, 41],
  layout: layout('Boating', [
    ['distance', 'map', LEFT, 0.025, MAP_W, MAP_H, { mapMode: 'follow', mapZoom: 13, mapRotate: true, markerStyle: 'arrow' }],
    ['speed', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H, { unit: 'kn', max: 30, labelText: 'Speed' }],
    ['heading', 'counter', LEFT, 0.84, 0.13, 0.135],
    ['distance', 'counter', 0.152, 0.84, 0.13, 0.135],
    ['rideTime', 'counter', 0.292, 0.84, 0.13, 0.135],
    ['heartRate', 'counter', 0.432, 0.84, 0.13, 0.135],
  ]),
};
