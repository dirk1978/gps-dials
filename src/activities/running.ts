import { BOTTOM_DIAL, COUNTER_H, DIAL_H, DIAL_W, FOLLOW, LEFT, LIVE, MAP_H, MAP_W, RIGHT_DIAL, layout } from './layout.ts';
import type { ActivityDef } from './types.ts';

export const running: ActivityDef = {
  id: 'running',
  name: 'Running',
  fitSports: [1, 11, 17],
  channels: ['pace', 'speed', 'averageSpeed', 'heartRate', 'heartZone', 'cadence', 'power', 'powerZone', 'gradient', 'altitude', 'ascent', 'temperature', 'distance', 'remaining', 'progress', 'rideTime', 'lapNumber', 'lapTime', 'lastLap', 'bestLap', 'splitKm', 'splitMile', 'clipTime', 'timeOfDay', 'date'],
  layout: layout('Running', [
    ['distance', 'map', LEFT, 0.025, MAP_W, MAP_H, { ...FOLLOW, mapZoom: 17.5 }],
    ['distance', 'counter', 0.33, 0.025, 0.115, COUNTER_H],
    ['rideTime', 'counter', 0.445, 0.025, 0.115, COUNTER_H],
    ['ascent', 'counter', 0.56, 0.025, 0.115, COUNTER_H],
    ['heartRate', 'dial', RIGHT_DIAL, 0.025, DIAL_W, DIAL_H],
    ['pace', 'counter', LEFT, 0.84, 0.17, 0.135],
    ['power', 'counter', 0.192, 0.84, 0.12, 0.135, {}, [{ channel: 'gradient', display: 'counter', style: { showSign: true } }]],
    ['cadence', 'counter', 0.322, 0.84, 0.12, 0.135, { unit: 'spm', useZones: false }, [{ channel: 'averageSpeed', display: 'counter', style: { unit: 'kmh' } }]],
    ['altitude', 'profile', 0.452, 0.84, 0.375, 0.135, LIVE],
    ['speed', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H, { unit: 'kmh', max: 25 }],
  ]),
};
