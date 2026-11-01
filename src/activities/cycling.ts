import { BOTTOM_DIAL, COUNTER_H, DIAL_H, DIAL_W, FOLLOW, LEFT, LIVE, MAP_H, MAP_W, RIGHT_DIAL, SIGNED, STRIP_H, STRIP_Y, layout } from './layout.ts';
import type { ActivityDef } from './types.ts';

export const cycling: ActivityDef = {
  id: 'cycling',
  name: 'Cycling',
  fitSports: [2, 21],
  channels: ['speed', 'averageSpeed', 'maxSpeed', 'heartRate', 'heartZone', 'cadence', 'power', 'powerZone', 'gradient', 'leanAngle', 'gForce', 'accelForward', 'accelLateral', 'altitude', 'ascent', 'temperature', 'distance', 'remaining', 'progress', 'rideTime', 'lapNumber', 'lapTime', 'lastLap', 'bestLap', 'splitKm', 'splitMile', 'launchTime', 'clipTime', 'timeOfDay', 'date'],
  layout: layout('Cycling', [
    ['distance', 'map', LEFT, 0.025, MAP_W, MAP_H, FOLLOW],
    ['gradient', 'counter', 0.27, 0.025, 0.115, COUNTER_H, SIGNED],
    ['distance', 'counter', 0.385, 0.025, 0.115, COUNTER_H],
    ['rideTime', 'counter', 0.5, 0.025, 0.115, COUNTER_H],
    ['altitude', 'counter', 0.615, 0.025, 0.115, COUNTER_H],
    ['heartRate', 'dial', RIGHT_DIAL, 0.025, DIAL_W, DIAL_H],
    ['speed', 'dial', RIGHT_DIAL, BOTTOM_DIAL, DIAL_W, DIAL_H],
    ['leanAngle', 'tilt', RIGHT_DIAL, 0.415, DIAL_W, 0.17],
    ['power', 'dial', LEFT, BOTTOM_DIAL, DIAL_W, DIAL_H, {}, [{ channel: 'gForce', display: 'scope' }]],
    ['cadence', 'dial', 0.172, BOTTOM_DIAL, DIAL_W, DIAL_H, {}, [{ channel: 'accelForward', display: 'vsi' }]],
    ['altitude', 'profile', 0.335, STRIP_Y, 0.49, STRIP_H, LIVE],
  ]),
};
