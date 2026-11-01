import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import type { TrackColumns } from '../sync/timeline.ts';
import { CHANNELS } from './channels.ts';
import { prepareOverlayData } from './data.ts';
import { DISPLAYS } from './displays/index.ts';
import { drawFrame, type Ctx, type FrameContext } from './draw.ts';
import { THEMES, defaultTemplate, newWidget, normaliseTemplate, resolveStyle, type DisplayId, type Template } from './template.ts';

const track: TrackColumns = {
  t: Array.from({ length: 400 }, (_, i) => 1000 + i),
  lat: Array.from({ length: 400 }, (_, i) => 50 + i * 0.0001),
  lon: Array.from({ length: 400 }, (_, i) => Math.sin(i / 40) * 0.001),
  speed: Array.from({ length: 400 }, (_, i) => 5 + (i % 50) / 10),
  heartRate: new Array(400).fill(130),
  altitude: Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 30) * 20),
};
const data = prepareOverlayData(track);

function render(template: Template): number {
  const canvas = createCanvas(640, 360);
  const frame: FrameContext = { width: 640, height: 360, template, data, clipStart: 1100, clipEnd: 1200 };
  drawFrame(canvas.getContext('2d') as unknown as Ctx, frame, 1150);
  const { data: pixels } = canvas.getContext('2d').getImageData(0, 0, 640, 360);
  let painted = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
  return painted;
}

test('every kind of data draws on every kind of display', () => {
  for (const channel of CHANNELS) {
    for (const display of DISPLAYS) {
      const widget = { ...newWidget(channel.id, display.id as DisplayId, 0.1, 0.1), width: 0.6, height: 0.6, style: { hideWhenNoData: false } };
      const painted = render({ ...defaultTemplate, widgets: [widget] });
      assert.ok(painted > 0, `${channel.id} on ${display.id} drew nothing`);
    }
  }
});

test('every theme draws the default layout', () => {
  for (const theme of THEMES) assert.ok(render({ ...defaultTemplate, theme }) > 100, theme.name);
});

test('leaves out widgets the file has no data for, unless told otherwise', () => {
  const power = { ...newWidget('power', 'dial', 0.1, 0.1) };
  assert.equal(render({ ...defaultTemplate, widgets: [power] }), 0);
  assert.ok(render({ ...defaultTemplate, widgets: [{ ...power, style: { hideWhenNoData: false } }] }) > 0);
});

test('zones follow the rider, and a hand-set list wins', () => {
  const heart = newWidget('heartRate', 'dial');
  const zones = resolveStyle(heart, THEMES[0], { maxHeartRate: 200, ftp: 250 }).zones;
  assert.deepEqual(zones.slice(0, 4).map(z => z.upTo), [120, 140, 160, 180]);
  const power = resolveStyle(newWidget('power', 'dial'), THEMES[0], { maxHeartRate: 200, ftp: 200 });
  assert.deepEqual(power.zones.slice(0, 5).map(z => z.upTo), [110, 150, 180, 210, 240]);
  assert.equal(power.useZones, true);
  const mine = [{ upTo: 50, color: '#000000' }];
  assert.deepEqual(resolveStyle({ ...heart, style: { zones: mine } }, THEMES[0]).zones, mine);
  assert.equal(resolveStyle(newWidget('speed', 'dial'), THEMES[0]).useZones, false);
});

test('hidden widgets draw nothing', () => {
  const widgets = defaultTemplate.widgets.map(w => ({ ...w, hidden: true }));
  assert.equal(render({ ...defaultTemplate, widgets }), 0);
});

test('a widget setting beats the theme, and unset ones follow it', () => {
  const widget = { ...newWidget('speed', 'dial'), style: { color: '#123456' } };
  const style = resolveStyle(widget, THEMES[1]);
  assert.equal(style.color, '#123456');
  assert.equal(style.textColor, THEMES[1].text);
  assert.equal(style.max, 45);
});

test('reads saved layouts and rejects anything else', () => {
  const copy = JSON.parse(JSON.stringify(defaultTemplate));
  assert.equal(normaliseTemplate(copy).widgets.length, defaultTemplate.widgets.length);
  assert.throws(() => normaliseTemplate({ gauges: [] }), /layout/);
});
