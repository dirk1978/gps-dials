import { ACTIVITIES } from '../activities/index.ts';
import { BOTTOM_DIAL, COUNTER_H, DIAL_H, DIAL_W, FOLLOW, LEFT, LIVE, MAP_H, MAP_W, RIGHT_DIAL, SIGNED, layout } from '../activities/layout.ts';
import { THEMES, type Template } from './template.ts';

export { layoutFor } from '../activities/index.ts';

/**
 * Starting points to adapt, all original to this project. Each activity brings its
 * own, and widgets the file has no data for stay hidden.
 */
export const PRESETS: Template[] = [
  ...ACTIVITIES.map(a => a.layout),
  layout('Corner dials', [
    ['speed', 'dial', LEFT, 0.025, DIAL_W, DIAL_H],
    ['heartRate', 'dial', RIGHT_DIAL, 0.025, DIAL_W, DIAL_H],
    ['cadence', 'dial', LEFT, BOTTOM_DIAL, DIAL_W, DIAL_H],
    ['power', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H],
  ]),
  layout('Big map', [
    ['distance', 'map', 0.69, 0.025, 0.298, 0.53, { mapMode: 'fitRide' }],
    ['speed', 'counter', 0.69, 0.57, 0.145, 0.135],
    ['heartRate', 'counter', 0.843, 0.57, 0.145, 0.135],
    ['altitude', 'profile', 0.012, 0.85, 0.976, 0.125, LIVE],
  ]),
  layout('Circular map', [
    ['distance', 'map', LEFT, 0.65, 0.185, 0.3289, { ...FOLLOW, mapShape: 'circle', mapRotate: true, markerStyle: 'arrow' }],
    ['speed', 'arc', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H],
    ['gradient', 'counter', 0.7, 0.85, 0.125, COUNTER_H, SIGNED],
  ]),
  layout('Bottom strip', [
    ['speed', 'counter', 0.015, 0.84, 0.15, 0.135],
    ['heartRate', 'counter', 0.17, 0.84, 0.15, 0.135],
    ['gradient', 'counter', 0.325, 0.84, 0.15, 0.135, SIGNED],
    ['altitude', 'profile', 0.48, 0.84, 0.505, 0.135, LIVE],
  ]),
  layout('Top ribbon', [
    ['speed', 'counter', 0.015, 0.025, 0.135, COUNTER_H],
    ['heartRate', 'counter', 0.155, 0.025, 0.135, COUNTER_H],
    ['gradient', 'counter', 0.295, 0.025, 0.135, COUNTER_H, SIGNED],
    ['distance', 'counter', 0.435, 0.025, 0.135, COUNTER_H],
    ['ascent', 'counter', 0.575, 0.025, 0.135, COUNTER_H],
    ['rideTime', 'counter', 0.715, 0.025, 0.135, COUNTER_H],
    ['timeOfDay', 'counter', 0.855, 0.025, 0.13, COUNTER_H],
  ]),
  layout('Climbing', [
    ['gradient', 'arc', LEFT, BOTTOM_DIAL, DIAL_W, DIAL_H, { min: -5, max: 20, step: 5, decimals: 1 }],
    ['verticalSpeed', 'counter', 0.172, 0.84, 0.14, 0.135],
    ['ascent', 'counter', 0.317, 0.84, 0.14, 0.135],
    ['altitude', 'profile', 0.462, 0.84, 0.525, 0.135, LIVE],
  ]),
  layout('Power and heart', [
    ['power', 'graph', LEFT, 0.72, 0.34, 0.255, { windowSeconds: 120, max: 500 }],
    ['heartRate', 'graph', 0.648, 0.72, 0.34, 0.255, { windowSeconds: 300, min: 60, max: 190 }],
    ['cadence', 'bar', 0.362, 0.86, 0.276, 0.115],
  ]),
  layout('Minimal', [
    ['speed', 'counter', 0.79, 0.84, 0.195, 0.135, { showLabel: false, panelOpacity: 0, decimals: 0 }],
    ['gradient', 'counter', 0.015, 0.84, 0.16, 0.135, { showLabel: false, panelOpacity: 0, ...SIGNED }],
  ], THEMES[1]),
  layout('Side bars', [
    ['speed', 'bar', 0.012, 0.15, 0.085, 0.7, { orientation: 'vertical', thickness: 0.2, roundEnds: true }],
    ['heartRate', 'bar', 0.903, 0.15, 0.085, 0.7, { orientation: 'vertical', thickness: 0.2, roundEnds: true }],
  ]),
  layout('Neon dash', [
    ['distance', 'map', 0.02, 0.03, MAP_W, MAP_H, { ...FOLLOW, mapDarken: 0.45, mapSaturation: 0.2 }],
    ['speed', 'dial', 0.4, 0.68, 0.2, 0.3, { thickness: 0.12 }],
    ['gradient', 'counter', 0.23, 0.84, 0.16, 0.135, SIGNED],
    ['heartRate', 'counter', 0.61, 0.84, 0.16, 0.135],
  ], THEMES[3]),
  layout('Route only', [
    ['distance', 'route', LEFT, 0.025, MAP_W, MAP_H, { mapMode: 'fitRide' }],
  ]),
];