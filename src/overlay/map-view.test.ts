import test from 'node:test';
import assert from 'node:assert/strict';
import type { TrackColumns } from '../sync/timeline.ts';
import { prepareOverlayData } from './data.ts';
import { MAP_PROVIDERS, mapProvider, mapView, projectX, projectY, tileUrl, visibleTiles, type ViewInput } from './map-view.ts';
import { defaultTemplate, newWidget, resolveStyle, type Style } from './template.ts';

const track: TrackColumns = {
  t: Array.from({ length: 100 }, (_, i) => 1000 + i),
  lat: Array.from({ length: 100 }, (_, i) => 52 + i * 0.001),
  lon: Array.from({ length: 100 }, (_, i) => -2 + i * 0.001),
  speed: new Array(100).fill(5),
  heartRate: new Array(100).fill(120),
  altitude: new Array(100).fill(100),
};
const data = prepareOverlayData(track);

function input(style: Partial<Style>, unit = 2): ViewInput {
  const base = resolveStyle(newWidget('distance', 'map'), defaultTemplate.theme);
  return { style: { ...base, ...style }, data, width: 400, height: 300, time: 1050, clipStart: 1020, clipEnd: 1060, unit, maxZoom: 19 };
}

test('projects known points', () => {
  assert.equal(projectX(0), 0.5);
  assert.equal(projectY(0), 0.5);
  assert.ok(projectX(-90) === 0.25);
  assert.ok(projectY(60) < 0.5);
});

test('follow mode centres on the current position', () => {
  const v = mapView(input({ mapMode: 'follow', mapZoom: 14 }));
  assert.ok(Math.abs(v.cx - projectX(-1.95)) < 1e-9);
  assert.equal(v.zoom, 14);
  assert.equal(v.tileZoom, 15);
});

test('picks the same tiles at 1080p and 4K, so the preview matches the export', () => {
  const small = mapView(input({ mapMode: 'follow', mapZoom: 14 }, 1));
  const large = mapView(input({ mapMode: 'follow', mapZoom: 14 }, 2));
  assert.equal(small.tileZoom, large.tileZoom);
  assert.equal(large.worldSize, small.worldSize * 2);
});

test('fit modes frame the whole stretch', () => {
  const ride = mapView(input({ mapMode: 'fitRide' }));
  const clip = mapView(input({ mapMode: 'fitClip' }));
  assert.ok(clip.zoom > ride.zoom);
  const span = (projectX(track.lon[99]) - projectX(track.lon[0])) * ride.worldSize;
  assert.ok(span <= 400);
});

test('turns heading-up maps by the direction of travel', () => {
  assert.notEqual(mapView(input({ mapMode: 'follow', mapRotate: true })).rotation, 0);
  assert.equal(mapView(input({ mapMode: 'follow', mapRotate: false })).rotation, 0);
});

test('covers the whole view with tiles', () => {
  const v = mapView(input({ mapMode: 'follow', mapZoom: 14 }));
  const tiles = visibleTiles(v, 400, 300);
  assert.ok(tiles.length >= 1);
  assert.ok(Math.min(...tiles.map(t => t.left)) <= -200);
  assert.ok(Math.max(...tiles.map(t => t.left + t.size)) >= 200);
  assert.ok(Math.min(...tiles.map(t => t.top)) <= -150);
});

test('builds tile addresses and escapes the token', () => {
  const satellite = MAP_PROVIDERS.find(p => p.id === 'mapbox-satellite')!;
  const url = tileUrl(satellite, { z: 3, x: 1, y: 2 }, 'a b');
  assert.ok(url.includes('/3/1/2?access_token=a%20b'));
});

test('falls back to OpenStreetMap when a keyed map has no key', () => {
  const style = input({ mapProvider: 'mapbox-satellite' }).style;
  assert.equal(mapProvider(style, '').id, 'osm');
  assert.equal(mapProvider(style, 'token').id, 'mapbox-satellite');
});
