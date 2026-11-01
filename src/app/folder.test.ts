import test from 'node:test';
import assert from 'node:assert/strict';
import { clipFitsTrack, rankTracks } from './folder.ts';

test('accepts clips with a clock a couple of hours out, but not other days', () => {
  assert.equal(clipFitsTrack({ clockTime: 1000 }, 1000, 2000), true);
  assert.equal(clipFitsTrack({ clockTime: 1000 - 2 * 3600 }, 1000, 2000), true);
  assert.equal(clipFitsTrack({ clockTime: 1000 - 24 * 3600 }, 1000, 2000), false);
});

test('prefers the track with most clips, then the more detailed recording', () => {
  const coarse = { name: 'coarse', clips: 5, points: 100, start: 0, end: 1000 };
  const fine = { name: 'fine', clips: 5, points: 1000, start: 0, end: 1000 };
  const other = { name: 'other', clips: 9, points: 10, start: 0, end: 1000 };
  assert.deepEqual(rankTracks([coarse, fine, other]).map(t => t.name), ['other', 'fine', 'coarse']);
});
