import { BOTTOM_DIAL, DIAL_H, DIAL_W, LEFT, MAP_H, MAP_W, RIGHT_DIAL, layout } from './layout.ts';
import type { ActivityDef } from './types.ts';

export const flying: ActivityDef = {
  id: 'flying',
  name: 'Flying',
  fitSports: [20, 26],
  channels: ['altitude', 'height', 'speed', 'maxSpeed', 'verticalSpeed', 'heading', 'leanAngle', 'gForce', 'temperature', 'heartRate', 'distance', 'remaining', 'progress', 'latitude', 'longitude', 'rideTime', 'clipTime', 'timeOfDay', 'date'],
  layout: layout('Flying', [
    ['distance', 'map', LEFT, 0.025, MAP_W, MAP_H, { mapMode: 'follow', mapZoom: 12.5, mapRotate: true, markerStyle: 'arrow' }],
    ['altitude', 'dial', RIGHT_DIAL, 0.025, DIAL_W, DIAL_H, { unit: 'ft', max: 10000, step: 2000 }],
    ['speed', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H, { unit: 'kn', max: 160, step: 20 }],
    ['heading', 'compass', LEFT, BOTTOM_DIAL, DIAL_W, DIAL_H],
    ['verticalSpeed', 'vsi', 0.172, BOTTOM_DIAL, DIAL_W, DIAL_H, { unit: 'fpm', min: -1500, max: 1500, step: 500 }],
    ['leanAngle', 'horizon', RIGHT_DIAL, 0.3675, DIAL_W, DIAL_H, { labelText: 'Bank' }],
    ['rideTime', 'counter', 0.332, 0.84, 0.12, 0.135],
  ]),
};
