import test from 'node:test';
import assert from 'node:assert/strict';
import { detectConvention } from '../sync/correlate.ts';
import { binned, cameraAttitude, latest, sensorTimes } from './sensors.ts';
import type { MotionSample, Quaternion } from './types.ts';

/** A camera looking along x, leaning `lean` degrees about that axis, with `tilt` built into its mount. */
function sample(t: number, lean: number, tilt = 0): MotionSample {
  const half = ((lean + tilt) * Math.PI) / 360;
  const q: Quaternion = [Math.cos(half), Math.sin(half), 0, 0];
  const r = (2 * half);
  return { t, q, accel: [0, -Math.sin(r), Math.cos(r)] };
}

const leans = Array.from({ length: 500 }, (_, i) => sample(i / 50, i > 100 && i < 300 ? 20 : 0));
const times = sensorTimes(10);

test('turns orientation into lean, with level as zero', () => {
  const attitude = cameraAttitude(leans, detectConvention(leans), times)!;
  assert.ok(Math.abs(Math.abs(attitude.lean[40]!) - 20) < 0.5, `lean was ${attitude.lean[40]}`);
  assert.ok(Math.abs(attitude.lean[80]!) < 0.5, `level was ${attitude.lean[80]}`);
});

test('reads level whatever slant the camera is mounted at', () => {
  const slanted = leans.map((s, i) => sample(s.t, i > 100 && i < 300 ? 20 : 0, 12));
  const attitude = cameraAttitude(slanted, detectConvention(slanted), times)!;
  assert.ok(Math.abs(attitude.lean[80]!) < 0.5);
  assert.ok(Math.abs(Math.abs(attitude.lean[40]!) - 20) < 0.5);
});

test('refuses orientation that does not hold steady against gravity', () => {
  const convention = { ...detectConvention(leans), tightness: 0.3 };
  assert.equal(cameraAttitude(leans, convention, times), null);
});

test('gathers readings into evenly spaced slots', () => {
  assert.deepEqual(sensorTimes(0.3), [0, 0.1, 0.2]);
  assert.deepEqual(binned([0, 0.1], [0, 0.05, 0.12], [2, 4, null]), [3, null]);
  assert.deepEqual(latest([0, 0.1], [0, 0.05, 0.12], [350, 10, 20]), [10, 20]);
});
