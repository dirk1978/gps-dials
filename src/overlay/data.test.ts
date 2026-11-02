import { fastestLap, lapAverage, lapList } from './data.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TrackColumns } from '../sync/timeline.ts';
import { channelDef, formatValue, readChannel } from './channels.ts';
import { prepareOverlayData, seriesValue, timeAtDistance } from './data.ts';

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

test('works out speed from positions when a track has none, as drones do', () => {
  const data = prepareOverlayData({ ...track, speed: new Array(21).fill(null) });
  assert.ok(Math.abs(seriesValue(data, 'speed', 1010)! - 11.1) < 0.2);
  assert.equal(data.available.has('speed'), true);
});

test('measures height and distance from the start', () => {
  const data = prepareOverlayData(track);
  assert.equal(seriesValue(data, 'height', 1010), 10);
  assert.ok(Math.abs(seriesValue(data, 'homeDistance', 1020)! - 222.4) < 1);
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

test('smooths heading across north, rather than swinging to south', () => {
  const data = prepareOverlayData(track);
  data.series.heading = track.t.map((_, i) => (i % 2 ? 359 : 1));
  const v = seriesValue(data, 'heading', 1010, 6)!;
  assert.ok(v < 2 || v > 358, `heading was ${v}`);
});

/** A circle of 50 m radius at 10 m/s, turning right, so cornering is v²/r = 2 m/s². */
function circle(): TrackColumns {
  const n = 120;
  const radius = 50 / 111_320;
  const t = Array.from({ length: n }, (_, i) => 1000 + i);
  return {
    t,
    lat: t.map((_, i) => 50 + radius * Math.cos(i / 5)),
    lon: t.map((_, i) => (radius * Math.sin(i / 5)) / Math.cos((50 * Math.PI) / 180)),
    speed: new Array(n).fill(10),
    heartRate: new Array(n).fill(null),
    altitude: new Array(n).fill(100),
    power: new Array(n).fill(null),
  };
}

test('works out cornering force and lean from a turn', () => {
  const data = prepareOverlayData(circle());
  const lateral = seriesValue(data, 'accelLateral', 1060)!;
  assert.ok(Math.abs(lateral - 2) < 0.1, `cornering was ${lateral}`);
  const lean = seriesValue(data, 'leanAngle', 1060)!;
  assert.ok(Math.abs(lean - 11.5) < 0.6, `lean was ${lean}`);
  assert.ok(Math.abs(seriesValue(data, 'accelForward', 1060)!) < 0.01);
});

test('leans the other way on a left turn', () => {
  const right = circle();
  const data = prepareOverlayData({ ...right, lon: right.lon.map(v => -v) });
  assert.ok(seriesValue(data, 'leanAngle', 1060)! < -10);
});

test('measures braking as negative', () => {
  const speed = track.t.map((_, i) => 20 - i * 0.5);
  assert.ok(Math.abs(seriesValue(prepareOverlayData({ ...track, speed }), 'accelForward', 1010)! + 0.5) < 0.01);
});

test('ignores the drift of something standing still', () => {
  const lat = track.t.map((_, i) => 50 + (i % 2) * 0.00001);
  const data = prepareOverlayData({ ...track, lat, speed: new Array(21).fill(0) });
  assert.equal(seriesValue(data, 'accelLateral', 1010), 0);
});

test('averages only while moving, and one GPS jump sets no record', () => {
  const speed = track.t.map((_, i) => (i < 10 ? 10 : i === 15 ? 40 : 0));
  const data = prepareOverlayData({ ...track, speed });
  assert.ok(Math.abs(seriesValue(data, 'averageSpeed', 1020)! - 11.1) < 2);
  assert.ok(seriesValue(data, 'maxSpeed', 1020)! < 20);
});

test('tracks route progress and finds a time from a distance', () => {
  const data = prepareOverlayData(track);
  assert.ok(Math.abs(seriesValue(data, 'progress', 1010)! - 50) < 0.1);
  assert.ok(Math.abs(timeAtDistance(data, data.distance[10]) - 1010) < 0.001);
});

test('numbers zones from the rider, only when the sensor is there', () => {
  const data = prepareOverlayData(track);
  const rider = { maxHeartRate: 200, ftp: 200 };
  assert.equal(readChannel(data, channelDef('heartZone'), undefined, 1010, { ...clip, rider }), 2);
  assert.equal(readChannel(data, channelDef('heartZone'), undefined, 1010, { ...clip, rider: { ...rider, maxHeartRate: 130 } }), 5);
  assert.equal(data.available.has('heartZone'), true);
  assert.equal(data.available.has('powerZone'), false);
});

test('times laps from the device, and shows nothing for a single lap', () => {
  const data = prepareOverlayData({ ...track, lapStarts: [1000, 1005, 1012] });
  assert.equal(seriesValue(data, 'lapNumber', 1006), 2);
  assert.equal(seriesValue(data, 'lapTime', 1007), 2);
  assert.equal(seriesValue(data, 'lastLap', 1013), 7);
  assert.equal(seriesValue(data, 'bestLap', 1013), 5);
  assert.equal(prepareOverlayData({ ...track, lapStarts: [1000] }).available.has('lapNumber'), false);
});

test('times each whole kilometre', () => {
  const t = Array.from({ length: 300 }, (_, i) => 1000 + i);
  const long = { ...track, t, lat: t.map((_, i) => 50 + i * 0.0001), lon: new Array(300).fill(0), speed: new Array(300).fill(11), heartRate: new Array(300).fill(120), altitude: new Array(300).fill(100), power: new Array(300).fill(0) };
  const data = prepareOverlayData(long);
  assert.equal(seriesValue(data, 'splitKm', 1050), null);
  assert.ok(Math.abs(seriesValue(data, 'splitKm', 1200)! - 89.9) < 1);
});

test('times a standing start to the target and holds the result', () => {
  const speed = track.t.map((_, i) => (i < 3 ? 0 : (i - 2) * 2));
  const data = prepareOverlayData({ ...track, speed }, undefined, 8);
  assert.equal(seriesValue(data, 'launchTime', 1000), null);
  assert.equal(seriesValue(data, 'launchTime', 1004), 2);
  assert.equal(seriesValue(data, 'launchTime', 1006), 4);
  assert.equal(seriesValue(data, 'launchTime', 1015), 4);
});

test('a camera reading beats the estimate, on the clip clock', () => {
  const data = prepareOverlayData(circle());
  const sensors = { t: [0, 1, 2, 3], series: { leanAngle: [5, 6, 7, 8] } };
  const lean = channelDef('leanAngle');
  assert.equal(readChannel(data, lean, undefined, 1061.5, { clipStart: 1060, sensors }), 6.5);
  assert.equal(readChannel(data, lean, undefined, 1050, { clipStart: 1060, sensors }), null);
  assert.ok(Math.abs(readChannel(data, lean, undefined, 1060, { clipStart: 1060 })! - 11.5) < 0.6);
});

test('formats camera settings', () => {
  assert.equal(formatValue(channelDef('shutter'), 0.01, 0), '1/100');
  assert.equal(formatValue(channelDef('aperture'), 2.8, 1), 'f/2.8');
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

test('lists laps, the last running to the end of the track', () => {
  const t = [0, 10, 20, 30, 40, 50];
  const distance = [0, 100, 200, 300, 400, 410];
  const laps = lapList(t, distance, [0, 20, 40]);
  assert.deepEqual(laps.map(l => [l.number, l.time, l.distance]), [[1, 20, 200], [2, 20, 200], [3, 10, 10]]);
  assert.deepEqual(lapList(t, distance, [0]), []);
});

test('the fastest lap ignores the short one at the end, and laps still to come', () => {
  const lap = (number: number, time: number, distance: number) => ({ number, start: 0, end: time, time, distance, first: 0, last: 0 });
  const laps = [lap(1, 300, 1000), lap(2, 280, 1000), lap(3, 270, 1000), lap(4, 40, 100)];
  assert.equal(fastestLap(laps, 4)?.number, 3);
  assert.equal(fastestLap(laps, 2)?.number, 2);
  assert.equal(fastestLap(laps, 0), null);
});

test('a lap keeps its true average speed and pace', () => {
  const lap = { number: 1, start: 0, end: 100, time: 100, distance: 400, first: 0, last: 1 };
  const data = { series: { heartRate: [100, 120] } } as never;
  assert.equal(lapAverage(data, 'speed', lap), 4);
  assert.equal(lapAverage(data, 'pace', lap), 0.25);
  assert.equal(lapAverage(data, 'heartRate', lap), 110);
  assert.equal(lapAverage(data, 'power', lap), null);
});
