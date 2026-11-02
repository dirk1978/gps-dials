import test from 'node:test';
import assert from 'node:assert/strict';
import { clockInliers, fitsTheDay, localClockError } from './consensus.ts';

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

test('a clip synced alone fits the day only if the other clips agree with it', () => {
  const others = [100, 200, 300, 400].map(clockTime => ({ clockTime, clipStart: clockTime - 40 }));
  assert.equal(fitsTheDay({ clockTime: 250, clipStart: 211 }, others), true);
  assert.equal(fitsTheDay({ clockTime: 250, clipStart: 300 }, others), false);
  assert.equal(fitsTheDay({ clockTime: 250, clipStart: 210 }, others.slice(0, 2)), false);
});