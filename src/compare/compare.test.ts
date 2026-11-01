import test from 'node:test';
import assert from 'node:assert/strict';
import type { TrackPoint } from '../activity/types.ts';
import { checkAgainstTerrain, combineSources, compareSources, summarise, terrainAscent, terrainSamples, type Choices, type Source } from './compare.ts';

const speedAt = (i: number) => 6 + 3 * Math.sin(i / 11) + 2 * Math.sin(i / 37);

function ride(options: { clockAhead?: number; altitudeBias?: number; heart?: number; latShift?: number } = {}): TrackPoint[] {
  const { clockAhead = 0, altitudeBias = 0, heart = 130, latShift = 0 } = options;
  return Array.from({ length: 400 }, (_, i) => ({
    t: 1000 + i + clockAhead,
    lat: 50 + i * 0.00005 + latShift,
    lon: 0,
    speed: speedAt(i),
    heartRate: heart,
    altitude: 100 + 20 * Math.sin(i / 50) + altitudeBias,
  }));
}

const a: Source = { name: 'Garmin', points: ride() };
const allFirst: Choices = { position: 0, altitude: 0, speed: 0, heartRate: 0, cadence: 0, power: 0, temperature: 0 };

test('summarises a recording', () => {
  const s = summarise(a);
  assert.equal(s.points, 400);
  assert.equal(s.interval, 1);
  assert.equal(s.averageHr, 130);
  assert.ok(s.distanceKm > 2 && s.distanceKm < 2.4);
});

test('finds a clock difference from the speed traces', () => {
  const result = compareSources(a, { name: 'Wahoo', points: ride({ clockAhead: 3 }) });
  assert.equal(result.clockOffset, 3);
  assert.ok(result.speedRmsMph! < 0.01);
});

test('separates a constant altitude offset from a difference in shape', () => {
  const result = compareSources(a, { name: 'Wahoo', points: ride({ altitudeBias: 7 }) });
  assert.ok(Math.abs(result.altitudeOffsetM! - 7) < 0.01);
  assert.ok(result.altitudeSpreadM! < 0.01);
});

test('measures how far apart two tracks run', () => {
  const result = compareSources(a, { name: 'Wahoo', points: ride({ latShift: 0.0001 }) });
  assert.ok(Math.abs(result.positionMedianM - 11.1) < 0.5, `was ${result.positionMedianM}`);
});

test('sends a terrain lookup only thinned-out points', () => {
  const samples = terrainSamples(a, 200);
  assert.ok(samples.length >= 10 && samples.length <= 12, `was ${samples.length}`);
});

test('scores sources against terrain, ignoring a constant offset for shape', () => {
  const terrain = terrainSamples(a, 50).map(p => ({ ...p, elevation: 100 + 20 * Math.sin((p.t - 1000) / 50) }));
  const biased = checkAgainstTerrain({ name: 'B', points: ride({ altitudeBias: 10 }) }, terrain, 0);
  assert.ok(Math.abs(biased.offsetM - 10) < 0.01);
  assert.ok(biased.shapeErrorM < 0.01);
});

test('adds up terrain climbing without counting small wobbles', () => {
  const terrain = [100, 101, 100, 103, 110, 105, 112].map((elevation, t) => ({ t, lat: 0, lon: 0, elevation }));
  assert.equal(terrainAscent(terrain), 17);
});

test('combines channels from different sources', () => {
  const b: Source = { name: 'Wahoo', points: ride({ heart: 150 }) };
  const points = combineSources([a, b], [0, 0], { ...allFirst, heartRate: 1 });
  assert.equal(points[10].heartRate, 150);
  assert.equal(points[10].lat, a.points[10].lat);
});

test('averages values, levelling altitude first so baselines do not step', () => {
  const b: Source = { name: 'Wahoo', points: ride({ heart: 150, altitudeBias: 30 }) };
  const points = combineSources([a, b], [0, 0], { ...allFirst, heartRate: 'average', altitude: 'average' });
  assert.equal(points[10].heartRate, 140);
  assert.ok(Math.abs(points[10].altitude! - a.points[10].altitude!) < 0.01);
});

test('moves steadily when one source records far less often', () => {
  const sparse: Source = { name: 'Garmin', points: ride().filter((_, i) => i % 10 === 0) };
  const steady: Source = { name: 'Wahoo', points: ride() };
  const points = combineSources([steady, sparse], [0, 0], { ...allFirst, position: 'average' });
  const steps = points.slice(1, 300).map((p, i) => p.lat - points[i].lat);
  assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-7, 'the position should advance evenly');
});

test('lines up sources whose clocks differ', () => {
  const b: Source = { name: 'Wahoo', points: ride({ clockAhead: 5, heart: 150 }) };
  const points = combineSources([a, b], [0, 5], allFirst);
  assert.equal(points.length, 400);
  assert.equal(points[10].speed, a.points[10].speed);
});
