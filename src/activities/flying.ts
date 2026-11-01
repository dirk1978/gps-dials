import { BOTTOM_DIAL, DIAL_H, DIAL_W, LEFT, MAP_H, MAP_W, RIGHT_DIAL, layout } from './layout.ts';
import type { ActivityDef } from './types.ts';

export const flying: ActivityDef = {
  id: 'flying',
  name: 'Flying',
  fitSports: [20, 26],
  layout: layout('Flying', [
    ['distance', 'map', LEFT, 0.025, MAP_W, MAP_H, { mapMode: 'follow', mapZoom: 11, mapRotate: true, markerStyle: 'arrow' }],
    ['altitude', 'dial', RIGHT_DIAL, 0.025, DIAL_W, DIAL_H, { unit: 'ft', max: 10000, step: 2000 }],
    ['speed', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H, { unit: 'kn', max: 160, step: 20 }],
    ['verticalSpeed', 'counter', LEFT, 0.84, 0.16, 0.135, { unit: 'fth', showSign: true }],
    ['heading', 'counter', 0.182, 0.84, 0.1, 0.135],
    ['rideTime', 'counter', 0.292, 0.84, 0.12, 0.135],
  ]),
};
