import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraSettings, gpsClipStart, gpsTime, gpsTrack, gyroMotion, parsePayloads } from './gpmf.ts';

type Item = Buffer;

function klv(key: string, type: string, size: number, repeat: number, body: Buffer): Item {
  const head = Buffer.alloc(8);
  head.write(key, 0, 'latin1');
  head[4] = type === '\0' ? 0 : type.charCodeAt(0);
  head[5] = size;
  head.writeUInt16BE(repeat, 6);
  return Buffer.concat([head, body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
}

const nested = (key: string, ...items: Item[]) => {
  const body = Buffer.concat(items);
  return klv(key, '\0', 1, body.length, body);
};

function int32s(rows: number[][]): Buffer {
  const b = Buffer.alloc(rows.length * rows[0].length * 4);
  rows.flat().forEach((v, i) => b.writeInt32BE(v, i * 4));
  return b;
}

function int16s(rows: number[][]): Buffer {
  const b = Buffer.alloc(rows.length * rows[0].length * 2);
  rows.flat().forEach((v, i) => b.writeInt16BE(v, i * 2));
  return b;
}

function gps5(utc: string, fix: number, rows: number[][]): Item {
  const scale = Buffer.alloc(20);
  [1e7, 1e7, 1000, 1000, 100].forEach((v, i) => scale.writeInt32BE(v, i * 4));
  const fixBody = Buffer.alloc(4);
  fixBody.writeUInt32BE(fix);
  return nested('STRM',
    klv('STNM', 'c', 1, 3, Buffer.from('GPS')),
    klv('GPSF', 'L', 4, 1, fixBody),
    klv('GPSU', 'U', 16, 1, Buffer.from(utc)),
    klv('SCAL', 'l', 4, 5, scale),
    klv('GPS5', 'l', 20, rows.length, int32s(rows)));
}

function axes(key: string, scale: number, rows: number[][]): Item {
  const s = Buffer.alloc(2);
  s.writeInt16BE(scale);
  return nested('STRM', klv('SCAL', 's', 2, 1, s), klv(key, 's', 6, rows.length, int16s(rows)));
}

function floats(key: string, values: number[]): Item {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeFloatBE(v, i * 4));
  return nested('STRM', klv(key, 'f', 4, values.length, b));
}

function packets(...payloads: Buffer[]) {
  return { data: Buffer.concat(payloads), list: payloads.map((p, i) => ({ t: i, duration: 1, size: p.length })) };
}

const fixRow = (lat: number, lon: number) => [Math.round(lat * 1e7), Math.round(lon * 1e7), 123000, 5500, 550];

test('reads a GPS time', () => {
  assert.equal(gpsTime('261031101530.500'), Date.UTC(2026, 9, 31, 10, 15, 30) / 1000 + 0.5);
});

test('reads GPS from older cameras, spaced across each payload', () => {
  const { data, list } = packets(
    nested('DEVC', gps5('261031100000.000', 3, [fixRow(52.4, -2.1), fixRow(52.5, -2.2)])),
    nested('DEVC', gps5('261031100001.000', 3, [fixRow(52.6, -2.3), fixRow(52.7, -2.4)])),
  );
  const payloads = parsePayloads(data, list);
  const track = gpsTrack(payloads);
  const start = Date.UTC(2026, 9, 31, 10, 0, 0) / 1000;
  assert.equal(track.length, 4);
  assert.deepEqual(track.map(p => p.t - start), [0, 0.5, 1, 1.5]);
  assert.ok(Math.abs(track[0].lat - 52.4) < 1e-6);
  assert.ok(Math.abs(track[3].lon + 2.4) < 1e-6);
  assert.equal(track[0].altitude, 123);
  assert.equal(track[0].speed, 5.5);
  assert.equal(gpsClipStart(payloads), start);
});

test('leaves out GPS from before the camera has a fix', () => {
  const { data, list } = packets(
    nested('DEVC', gps5('261031100000.000', 0, [fixRow(1, 1)])),
    nested('DEVC', gps5('261031100001.000', 3, [fixRow(52.4, -2.1)])),
  );
  const payloads = parsePayloads(data, list);
  assert.equal(gpsTrack(payloads).length, 1);
  assert.equal(gpsClipStart(payloads), Date.UTC(2026, 9, 31, 10, 0, 0) / 1000);
});

test('reads per-sample GPS from newer cameras', () => {
  const scale = Buffer.alloc(36);
  [1e7, 1e7, 1000, 1000, 100, 1, 1000, 100, 1].forEach((v, i) => scale.writeInt32BE(v, i * 4));
  const days = 9800;
  const sample = Buffer.alloc(32);
  [524000000, -21000000, 123000, 5500, 550, days, 3600500].forEach((v, i) => sample.writeInt32BE(v, i * 4));
  sample.writeUInt16BE(150, 28);
  sample.writeUInt16BE(3, 30);
  const { data, list } = packets(nested('DEVC', nested('STRM',
    klv('SCAL', 'l', 4, 9, scale),
    klv('TYPE', 'c', 1, 9, Buffer.from('lllllllSS')),
    klv('GPS9', '?', 32, 1, sample))));
  const [point] = gpsTrack(parsePayloads(data, list));
  assert.ok(Math.abs(point.lat - 52.4) < 1e-6);
  assert.equal(point.t, Date.UTC(2000, 0, 1) / 1000 + days * 86400 + 3600.5);
});

test('finds turning about up, however the camera is mounted', () => {
  // Up is the second axis here, and the camera turns about it at 1 radian a second.
  const accel = Array.from({ length: 20 }, () => [0, 98, 0]);
  const gyro = Array.from({ length: 20 }, () => [0, 100, 0]);
  const { data, list } = packets(...Array.from({ length: 4 }, () => nested('DEVC', axes('ACCL', 10, accel), axes('GYRO', 100, gyro))));
  const motion = gyroMotion(parsePayloads(data, list), 4)!;
  assert.ok(motion.turnRate.length >= 12);
  for (const v of motion.turnRate) assert.ok(Math.abs(v + 1) < 1e-9);
});

test('has no gyro motion if the camera recorded none', () => {
  const { data, list } = packets(nested('DEVC', gps5('261031100000.000', 3, [fixRow(52, -2)])));
  assert.equal(gyroMotion(parsePayloads(data, list), 4), null);
});

test('reads camera settings', () => {
  const { data, list } = packets(nested('DEVC', floats('ISOE', [100, 200]), floats('SHUT', [0.01, 0.02]), floats('WBAL', [5000, 5000])));
  const sensors = cameraSettings(parsePayloads(data, list))!;
  assert.ok(sensors.series.iso!.includes(100));
  assert.ok(sensors.series.iso!.includes(200));
  assert.ok(sensors.series.shutter!.some(v => v != null && Math.abs(v - 0.02) < 1e-6));
  assert.equal(sensors.series.whiteBalance!.find(v => v != null), 5000);
});

test('carries on past keys it does not know', () => {
  const unknown = klv('XXXX', 'B', 1, 3, Buffer.from([1, 2, 3]));
  const { data, list } = packets(nested('DEVC', unknown, gps5('261031100000.000', 3, [fixRow(52, -2)])));
  assert.equal(gpsTrack(parsePayloads(data, list)).length, 1);
});
