import test from 'node:test';
import assert from 'node:assert/strict';
import { gpxActivity, parseGpx } from './gpx.ts';

const GARMIN = `<?xml version="1.0"?>
<gpx creator="Garmin Connect" xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Morning ride</name><type>cycling</type><trkseg>
    <trkpt lat="52.1" lon="-2.1"><ele>100.5</ele><time>2026-10-31T08:00:00.000Z</time>
      <extensions><power>210</power><ns3:TrackPointExtension><ns3:atemp>12</ns3:atemp><ns3:hr>140</ns3:hr><ns3:cad>85</ns3:cad></ns3:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lon="-2.2" lat="52.2"><time>2026-10-31T08:00:01Z</time></trkpt>
    <trkpt lat="52.3" lon="-2.3"><ele>99</ele></trkpt>
  </trkseg></trk>
</gpx>`;

test('reads positions, time and sensors, whichever namespace they use', () => {
  const [first, second] = parseGpx(GARMIN);
  assert.equal(first.lat, 52.1);
  assert.equal(first.lon, -2.1);
  assert.equal(first.t, Date.UTC(2026, 9, 31, 8) / 1000);
  assert.equal(first.altitude, 100.5);
  assert.equal(first.heartRate, 140);
  assert.equal(first.cadence, 85);
  assert.equal(first.power, 210);
  assert.equal(first.temperature, 12);
  assert.equal(second.lat, 52.2);
  assert.equal(second.lon, -2.2);
  assert.equal(second.heartRate, undefined);
});

test('leaves out points with no time', () => {
  assert.equal(parseGpx(GARMIN).length, 2);
});

test('reads the activity the file names', () => {
  assert.equal(gpxActivity(GARMIN), 'cycling');
  assert.equal(gpxActivity('<type>running</type>'), 'running');
  assert.equal(gpxActivity('<trk></trk>'), 'other');
});
