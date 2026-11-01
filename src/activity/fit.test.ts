import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFit } from './fit.ts';

const FIT_EPOCH_UNIX = 631065600;

function u16(v: number) { return [v & 0xff, v >> 8]; }
function u32(v: number) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24]; }

/** One record definition, then a full record, a compressed-timestamp record and a record with no fix. */
function sampleFit(): Uint8Array {
  const definition = [
    0x40, 0, 0, ...u16(20), 5,
    253, 4, 0x86,
    0, 4, 0x85,
    1, 4, 0x85,
    3, 1, 0x02,
    6, 2, 0x84,
  ];
  const compressedDefinition = [
    0x41, 0, 0, ...u16(20), 4,
    0, 4, 0x85,
    1, 4, 0x85,
    3, 1, 0x02,
    6, 2, 0x84,
  ];
  const lat = 2 ** 30; // 90 degrees
  const lon = 2 ** 29; // 45 degrees
  const full = [0x00, ...u32(1000), ...u32(lat), ...u32(lon), 120, ...u16(5000)];
  // Compressed header: local type 1, low five timestamp bits 12 (1000 is 0b...01000, so +4).
  const compressed = [0x80 | (1 << 5) | 12, ...u32(lat), ...u32(lon), 0xff, ...u16(0xffff)];
  const noFix = [0x00, ...u32(1010), 0xff, 0xff, 0xff, 0x7f, 0xff, 0xff, 0xff, 0x7f, 90, ...u16(1000)];
  const body = [...definition, ...full, ...compressedDefinition, ...compressed, ...noFix];
  const header = [14, 0x20, ...u16(2100), ...u32(body.length), 0x2e, 0x46, 0x49, 0x54, 0, 0];
  return Uint8Array.from([...header, ...body, 0, 0]);
}

test('decodes record fields and scales them', () => {
  const [first] = parseFit(sampleFit());
  assert.equal(first.t, 1000 + FIT_EPOCH_UNIX);
  assert.equal(first.lat, 90);
  assert.equal(first.lon, 45);
  assert.equal(first.heartRate, 120);
  assert.equal(first.speed, 5);
});

test('expands compressed timestamps and treats invalid markers as missing', () => {
  const points = parseFit(sampleFit());
  assert.equal(points[1].t, 1004 + FIT_EPOCH_UNIX);
  assert.equal(points[1].heartRate, undefined);
  assert.equal(points[1].speed, undefined);
});

test('skips records with no GPS position', () => {
  assert.equal(parseFit(sampleFit()).length, 2);
});

test('rejects files that are not FIT', () => {
  assert.throws(() => parseFit(new Uint8Array(16)), /Not a FIT file/);
});
