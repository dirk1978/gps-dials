import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, activityForExtension, activityForFitSport } from '../activities/index.ts';
import { PRESETS, layoutFor } from './presets.ts';

test('every preset stays inside the frame', () => {
  for (const preset of PRESETS) {
    for (const w of preset.widgets) {
      assert.ok(w.x >= 0 && w.y >= 0, `${preset.name}: ${w.id}`);
      assert.ok(w.x + w.width <= 1.0001 && w.y + w.height <= 1.0001, `${preset.name}: ${w.id} runs off the frame`);
    }
  }
});

test('no two widgets in a preset overlap', () => {
  for (const preset of PRESETS) {
    const { widgets } = preset;
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const a = widgets[i];
        const b = widgets[j];
        const apart = a.x + a.width <= b.x + 1e-6 || b.x + b.width <= a.x + 1e-6 || a.y + a.height <= b.y + 1e-6 || b.y + b.height <= a.y + 1e-6;
        assert.ok(apart, `${preset.name}: ${a.id} overlaps ${b.id}`);
      }
    }
  }
});

test('widget ids are unique within a preset', () => {
  for (const preset of PRESETS) {
    assert.equal(new Set(preset.widgets.map(w => w.id)).size, preset.widgets.length, preset.name);
  }
});

test('every activity has a layout of its own in the presets', () => {
  for (const activity of ACTIVITIES) {
    assert.equal(layoutFor(activity.id).name, activity.name);
    assert.ok(PRESETS.some(p => p.name === activity.name), activity.name);
  }
  assert.equal(layoutFor('other').name, 'Cycling');
  assert.equal(layoutFor('drone').auto, true);
});

test('recognises activities from FIT sport numbers and file types', () => {
  assert.equal(activityForFitSport(2), 'cycling');
  assert.equal(activityForFitSport(1), 'running');
  assert.equal(activityForFitSport(32), 'boating');
  assert.equal(activityForFitSport(20), 'flying');
  assert.equal(activityForFitSport(5), 'other');
  assert.equal(activityForFitSport(undefined), 'other');
  assert.equal(activityForExtension('.srt'), 'drone');
});

test('every built-in elevation profile covers the whole ride', () => {
  for (const preset of PRESETS) {
    for (const w of preset.widgets) if (w.display === 'profile') assert.notEqual(w.style.fullRide, false, preset.name);
  }
});

test('hands out a copy, so editing a layout leaves the preset alone', () => {
  const copy = layoutFor('cycling');
  copy.widgets[0].x = 0.9;
  assert.notEqual(layoutFor('cycling').widgets[0].x, 0.9);
});
