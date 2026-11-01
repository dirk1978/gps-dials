import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, type ChannelId } from '../overlay/channels.ts';
import { ACTIVITIES, channelGroups, layoutFor } from './index.ts';

test('puts the current activity first with all its data', () => {
  for (const activity of ACTIVITIES) {
    const [first] = channelGroups(activity.id);
    assert.equal(first.name, activity.name);
    assert.deepEqual(first.channels, activity.channels);
  }
});

test('offers every kind of data exactly once', () => {
  for (const id of [...ACTIVITIES.map(a => a.id), 'other']) {
    const offered = channelGroups(id).flatMap(g => g.channels);
    assert.equal(new Set(offered).size, offered.length);
    assert.deepEqual([...offered].sort(), CHANNELS.map(c => c.id).sort());
  }
});

test('a gauge the file has no data for gives way to the next best', () => {
  const available = new Set<ChannelId>(['speed', 'gForce', 'leanAngle', 'accelForward']);
  const { widgets } = layoutFor('cycling', available);
  assert.equal(widgets.some(w => w.channel === 'power' || w.channel === 'cadence'), false);
  assert.ok(widgets.some(w => w.id === 'gForce-scope'));
  assert.ok(widgets.some(w => w.id === 'accelForward-vsi'));
  assert.equal(new Set(widgets.map(w => w.id)).size, widgets.length);
  assert.equal(widgets.some(w => 'instead' in w), false);
});

test('keeps a gauge when its sensor is there, and when nothing can replace it', () => {
  const power = layoutFor('cycling', new Set<ChannelId>(['power', 'speed'])).widgets;
  assert.ok(power.some(w => w.id === 'power-dial'));
  assert.ok(power.some(w => w.id === 'cadence-dial'));
});

test('an activity lists the data its own layout shows', () => {
  for (const activity of ACTIVITIES) {
    for (const w of activity.layout.widgets) {
      if (w.display === 'map' || w.display === 'route') continue;
      assert.ok(activity.channels.includes(w.channel), `${activity.name} shows ${w.channel}`);
    }
  }
});
