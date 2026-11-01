import test from 'node:test';
import assert from 'node:assert/strict';
import { clockInliers, localClockError } from './consensus.ts';

const vote = (clockTime: number, error: number) => ({ clockTime, error });

test('finds the crowd and drops chance matches', () => {
  const votes = [vote(0, 40), vote(100, 39.5), vote(200, 40.5), vote(300, 3600), vote(400, -7000), vote(500, 41)];
  assert.deepEqual(clockInliers(votes).map(v => v.clockTime), [0, 100, 200, 500]);
});

test('returns nothing without a clear crowd', () => {
  assert.deepEqual(clockInliers([vote(0, 40), vote(100, 900), vote(200, -500)]), []);
});

test('uses nearby clips, so a clock step partway through the day is followed', () => {
  const inliers = [vote(0, 40), vote(10, 40), vote(20, 40), vote(1000, 44), vote(1010, 44), vote(1020, 44)];
  assert.equal(localClockError(5, inliers), 40);
  assert.equal(localClockError(1015, inliers), 44);
});
