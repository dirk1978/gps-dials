import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleAlongRoad, smoothAlongRoad } from './profile.ts';

const distance = Array.from({ length: 101 }, (_, i) => i * 10);
const hill = distance.map(d => 100 + 20 * Math.sin((d / 1000) * Math.PI));

test('samples evenly along the road, between recorded points', () => {
  const points = sampleAlongRoad(distance, hill, 0, 1000, 200);
  assert.equal(points.length, 201);
  assert.equal(points[100]![0], 500);
  assert.ok(Math.abs(points[100]![1] - 120) < 0.01);
});

test('marks road outside the track as empty', () => {
  const points = sampleAlongRoad(distance, hill, -100, 900, 10);
  assert.equal(points[0], null);
  assert.notEqual(points[1], null);
});

test('smoothing removes noise but keeps the height of a broad hill', () => {
  const noisy = hill.map((v, i) => v + (i % 2 ? 1 : -1));
  const known = sampleAlongRoad(distance, noisy, 0, 1000, 200) as [number, number][];
  const smooth = smoothAlongRoad(known, 60);
  const jitter = (p: [number, number][]) => Math.max(...p.slice(2).map((q, i) => Math.abs(q[1] - 2 * p[i + 1][1] + p[i][1])));
  assert.ok(jitter(smooth) < jitter(known) / 5);
  assert.ok(Math.abs(smooth[100][1] - 120) < 1);
});

test('no smoothing leaves the points alone', () => {
  const known = sampleAlongRoad(distance, hill, 0, 1000, 50) as [number, number][];
  assert.equal(smoothAlongRoad(known, 0), known);
});
