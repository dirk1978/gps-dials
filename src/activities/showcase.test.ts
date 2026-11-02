import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, type ChannelId } from '../overlay/channels.ts';
import { ACTIVITIES } from './index.ts';
import { allDials } from './showcase.ts';

const everything = new Set(CHANNELS.map(c => c.id));

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  const slack = 1e-6;
  return a.x + a.width > b.x + slack && b.x + b.width > a.x + slack && a.y + a.height > b.y + slack && b.y + b.height > a.y + slack;
}

test('every activity fills the frame with dials that fit and never overlap', () => {
  for (const activity of ACTIVITIES) {
    for (const aspect of [16 / 9, 4 / 3, 1, 9 / 16]) {
      const { widgets } = allDials(activity.id, everything, aspect);
      assert.ok(widgets.length > 15, activity.id);
      assert.equal(new Set(widgets.map(w => w.id)).size, widgets.length);
      for (const w of widgets) {
        assert.ok(w.x >= 0 && w.y >= 0 && w.x + w.width <= 1 + 1e-6 && w.y + w.height <= 1 + 1e-6, `${activity.id} ${w.id}`);
      }
      for (const [i, a] of widgets.entries()) for (const b of widgets.slice(i + 1)) assert.equal(overlaps(a, b), false, `${activity.id} ${a.id} ${b.id}`);
    }
  }
});

test('shows only what the file has data for', () => {
  const available = new Set<ChannelId>(['speed', 'distance', 'altitude', 'heading', 'height']);
  const { widgets } = allDials('drone', available);
  assert.ok(widgets.every(w => available.has(w.channel)));
  assert.ok(widgets.length >= 8);
});

test('shows every kind of data the activity lists', () => {
  for (const activity of ACTIVITIES) {
    const shown = new Set(allDials(activity.id, everything).widgets.map(w => w.channel));
    for (const channel of activity.channels) assert.ok(shown.has(channel), `${activity.id} ${channel}`);
  }
});

test('names the layout after the activity, and an unknown one falls back', () => {
  assert.equal(allDials('drone', everything).name, 'All drone dials');
  assert.ok(allDials('other', everything).widgets.length > 0);
});

test('stays as chosen when another activity is opened', () => {
  assert.notEqual(allDials('cycling', everything).auto, true);
});
