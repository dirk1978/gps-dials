import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import type { TrackColumns } from '../sync/timeline.ts';
import { CHANNELS } from './channels.ts';
import { prepareOverlayData } from './data.ts';
import { DISPLAYS } from './displays/index.ts';
import { drawFrame, type Ctx, type FrameContext } from './draw.ts';
import { FONTS, THEMES, defaultTemplate, newWidget, normaliseTemplate, resolveStyle, type DisplayId, type Template } from './template.ts';

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

test('shows a widget the camera has data for, even when the track has none', () => {
  const iso = newWidget('iso', 'counter', 0.1, 0.1);
  const template = { ...defaultTemplate, widgets: [iso] };
  assert.equal(render(template), 0);
  const canvas = createCanvas(640, 360);
  const sensors = { t: [0, 1], series: { iso: [400, 800] } };
  drawFrame(canvas.getContext('2d') as unknown as Ctx, { width: 640, height: 360, template, data, clipStart: 1100, clipEnd: 1200, sensors }, 1100.5);
  const { data: pixels } = canvas.getContext('2d').getImageData(0, 0, 640, 360);
  assert.ok(pixels.some((v, i) => i % 4 === 3 && v > 0));
});

test('colours a route by its data', () => {
  const route = { ...newWidget('distance', 'route', 0.1, 0.1), width: 0.6, height: 0.6, style: { routeColorBy: 'speed' as const } };
  assert.ok(render({ ...defaultTemplate, widgets: [route] }) > 0);
});

test('new profiles and graphs cover the whole ride, and saved windows stay', () => {
  assert.equal(resolveStyle(newWidget('altitude', 'profile'), THEMES[0]).fullRide, true);
  assert.equal(resolveStyle(newWidget('speed', 'graph'), THEMES[0]).graphSpan, 'ride');
  const saved = { ...newWidget('speed', 'graph'), style: { windowSeconds: 120 } };
  assert.equal(resolveStyle(saved, THEMES[0]).graphSpan, 'recent');
});

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, c] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * c;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test('every theme stays readable, and has a name and heading of its own', () => {
  assert.equal(new Set(THEMES.map(t => t.name)).size, THEMES.length);
  for (const theme of THEMES) {
    assert.ok(theme.group, theme.name);
    assert.ok(FONTS.includes(theme.font), theme.name);
    if (theme.panelOpacity >= 0.4) {
      assert.ok(contrast(theme.text, theme.panel) >= 4.5, `${theme.name} text`);
      assert.ok(contrast(theme.muted, theme.panel) >= 3, `${theme.name} labels`);
      assert.ok(contrast(theme.accent, theme.panel) >= 3, `${theme.name} accent`);
    } else {
      assert.ok(theme.shadow >= 3, `${theme.name} needs a shadow with no panel behind it`);
    }
  }
});

test('deepens zone colours on pale panels so they stay readable', () => {
  const paper = THEMES.find(t => t.name === 'Paper')!;
  const dark = resolveStyle(newWidget('gradient', 'counter'), THEMES[0]).zones[1].color;
  const light = resolveStyle(newWidget('gradient', 'counter'), paper).zones[1].color;
  assert.ok(contrast(light, paper.panel) > contrast(dark, paper.panel));
  assert.ok(contrast(light, paper.panel) >= 2.5, light);
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
