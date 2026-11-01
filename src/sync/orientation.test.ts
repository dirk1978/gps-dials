import test from 'node:test';
import assert from 'node:assert/strict';
import { looksUpsideDown, skyVote } from './orientation.ts';

function frame(top: number, bottom: number): Uint8Array {
  const size = 3;
  const pixels = new Uint8Array(size * size).fill(100);
  pixels.fill(top, 0, size);
  pixels.fill(bottom, size * 2, size * 3);
  return pixels;
}

test('votes for where the bright sky is', () => {
  assert.equal(skyVote(frame(40, 220), 3), 1);
  assert.equal(skyVote(frame(220, 40), 3), -1);
  assert.equal(skyVote(frame(100, 105), 3), 0);
});

test('needs most frames to agree before calling a clip upside down', () => {
  assert.equal(looksUpsideDown([1, 1, 1, 1, 0]), true);
  assert.equal(looksUpsideDown([1, 1, 0, 0, 0]), false);
  assert.equal(looksUpsideDown([-1, -1, -1, 1, 0]), false);
});
