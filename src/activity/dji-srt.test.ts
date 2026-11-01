import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDjiSrt, srtClipStart } from './dji-srt.ts';

const frame = (n: number, time: string, lat: string, lon: string) => `${n}
00:00:00,000 --> 00:00:00,033
<font size="28">FrameCnt: ${n}, DiffTime: 33ms
${time}
[iso: 100] [shutter: 1/100.0] [fnum: 2.8] [ev: 0] [ct: 5000] [color_md: default] [ae_meter_md: 1] [latitude: ${lat}] [longitude: ${lon}] [rel_alt: 6.900 abs_alt: 144.971] </font>
`;

test('reads time, position and altitude from each frame', () => {
  const [point] = parseDjiSrt(frame(1, '2026-01-02 03:04:05.250', '10.500000', '-20.250000'));
  assert.equal(point.t, Date.UTC(2026, 0, 2, 3, 4, 5, 250) / 1000);
  assert.equal(point.lat, 10.5);
  assert.equal(point.lon, -20.25);
  assert.equal(point.altitude, 144.971);
});

test('finds the first frame on the track clock, even before GPS has a fix', () => {
  const text = frame(1, '2026-01-02 03:04:05.250', '0.000000', '0.000000');
  assert.equal(srtClipStart(text), Date.UTC(2026, 0, 2, 3, 4, 5, 250) / 1000);
  assert.equal(srtClipStart('nothing here'), null);
});

test('leaves out frames with no GPS fix', () => {
  const text = frame(1, '2026-01-02 03:04:05.000', '0.000000', '0.000000') + frame(2, '2026-01-02 03:04:05.033', '10.500000', '-20.250000');
  assert.equal(parseDjiSrt(text).length, 1);
});
