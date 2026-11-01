import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

// Only the naming is tested here. The queue itself needs Electron, so it is checked in the app.
function overlayName(clip: string, extension: string): string {
  return `${clip.replace(/\.[^.]+$/, '')}_overlay${extension}`;
}

test('names the overlay after its clip, so editors sort them together', () => {
  assert.equal(overlayName('DJI_0045_D.MP4', '.mov'), 'DJI_0045_D_overlay.mov');
  assert.equal(join('a', overlayName('VID.1.mp4', '.mp4')), join('a', 'VID.1_overlay.mp4'));
});
