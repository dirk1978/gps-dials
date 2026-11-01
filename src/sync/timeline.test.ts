import test from 'node:test';
import assert from 'node:assert/strict';
import { clipStartFromPin, indexAtTime, nearestIndex, positionAt, type TrackColumns } from './timeline.ts';

const track: TrackColumns = {
  t: [100, 102, 110],
  lat: [10, 20, 30],
  lon: [0, 0, 10],
  speed: [2, 4, null],
  heartRate: [100, null, 120],
  altitude: [50, 60, 70],
};

test('finds the point at or before a time and clamps to the ends', () => {
  assert.equal(indexAtTime(track.t, 99), 0);
  assert.equal(indexAtTime(track.t, 102), 1);
  assert.equal(indexAtTime(track.t, 109), 1);
  assert.equal(indexAtTime(track.t, 500), 2);
});

test('interpolates between points that are recorded unevenly', () => {
  const p = positionAt(track, 101);
  assert.equal(p.lat, 15);
  assert.equal(p.speed, 3);
  assert.equal(positionAt(track, 106).lat, 25);
});

test('falls back to the known value when a neighbour is missing', () => {
  assert.equal(positionAt(track, 101).heartRate, 100);
  assert.equal(positionAt(track, 106).speed, 4);
});

test('clamps outside the track', () => {
  assert.equal(positionAt(track, 0).lat, 10);
  assert.equal(positionAt(track, 900).lat, 30);
});

test('snaps a click to the nearest point', () => {
  assert.equal(nearestIndex(track, 21, 0.5), 1);
});

test('derives the clip start from a matched moment', () => {
  assert.equal(clipStartFromPin(5, 1000), 995);
});
