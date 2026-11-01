import test from 'node:test';
import assert from 'node:assert/strict';
import type { TrackColumns } from '../sync/timeline.ts';
import { channelDef, formatValue, readChannel } from './channels.ts';
import { prepareOverlayData, seriesValue } from './data.ts';

/** Heading north at about 11 m a point, climbing 1 m per point. */
const track: TrackColumns = {
  t: Array.from({ length: 21 }, (_, i) => 1000 + i),
  lat: Array.from({ length: 21 }, (_, i) => 50 + i * 0.0001),
  lon: new Array(21).fill(0),
  speed: new Array(21).fill(10),
  heartRate: new Array(21).fill(120),
  altitude: Array.from({ length: 21 }, (_, i) => 100 + i),
  power: new Array(21).fill(0),
};

const clip = { clipStart: 1000 };

test('adds up distance along the track', () => {
  const data = prepareOverlayData(track);
  assert.ok(Math.abs(data.distance[20] - 222.4) < 1);
});

test('measures gradient over a stretch of road', () => {
  const g = prepareOverlayData(track).series.gradient![10]!;
  assert.ok(Math.abs(g - 9) < 0.5, `gradient was ${g}`);
});

test('reads a channel in the chosen unit', () => {
  const data = prepareOverlayData(track);
  assert.ok(Math.abs(readChannel(data, channelDef('speed'), 'mph', 1010.5, clip)! - 22.37) < 0.01);
  assert.ok(Math.abs(readChannel(data, channelDef('speed'), 'kmh', 1010.5, clip)! - 36) < 0.01);
  assert.ok(Math.abs(readChannel(data, channelDef('altitude'), 'm', 1010.5, clip)! - 110.5) < 0.01);
});

test('adds up climbing without counting noise', () => {
  const noisy: TrackColumns = { ...track, altitude: [100, 101, 100, 101, 100, 103, 102, 106, ...new Array(13).fill(106)] };
  assert.equal(prepareOverlayData(noisy).series.ascent!.at(-1), 7);
});

test('blends heading across north the short way', () => {
  const data = prepareOverlayData(track);
  data.series.heading = [...data.series.heading!];
  data.series.heading[5] = 350;
  data.series.heading[6] = 10;
  const v = seriesValue(data, 'heading', 1005.5)!;
  assert.ok(v < 1 || v > 359, `heading was ${v}`);
});

test('smooths over the chosen window', () => {
  const data = prepareOverlayData(track);
  assert.equal(seriesValue(data, 'altitude', 1010, 4), 110);
});

test('treats a track of zeros as a missing sensor', () => {
  assert.equal(prepareOverlayData(track).available.has('power'), false);
  assert.equal(prepareOverlayData(track).available.has('heartRate'), true);
});

test('formats times, compass points and signs', () => {
  assert.equal(formatValue(channelDef('rideTime'), 3725, 0), '1:02:05');
  assert.equal(formatValue(channelDef('rideTime'), 65, 0), '1:05');
  assert.equal(formatValue(channelDef('heading'), 92, 0), 'E');
  assert.equal(formatValue(channelDef('gradient'), 4.25, 1, true), '+4.3');
  assert.equal(formatValue(channelDef('speed'), null, 1), '--');
});
