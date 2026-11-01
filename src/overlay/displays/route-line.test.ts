import test from 'node:test';
import assert from 'node:assert/strict';
import { visiblePoints } from './route-line.ts';

test('keeps the bends in a road when zoomed in', () => {
  const zigzag = (i: number): [number, number] => [i * 10, i % 2 ? 40 : 0];
  assert.equal(visiblePoints(zigzag, 0, 40, 2).length, 41);
});

test('thins out points that land on top of each other when zoomed out', () => {
  const dense = (i: number): [number, number] => [i * 0.1, 0];
  const points = visiblePoints(dense, 0, 1000, 2);
  assert.ok(points.length < 60, `kept ${points.length}`);
});

test('always includes both ends', () => {
  const dense = (i: number): [number, number] => [i * 0.1, 0];
  const points = visiblePoints(dense, 0, 15, 2);
  assert.deepEqual(points[0], [0, 0]);
  assert.deepEqual(points.at(-1), [1.5, 0]);
});

test('copes with a single point', () => {
  assert.equal(visiblePoints(i => [i, i], 5, 5, 2).length, 1);
});
