import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VIDEO, frameAspect, outputFps, outputKbps, outputSize, videoFilter, type VideoSettings } from './video-settings.ts';

const uhd = { width: 3840, height: 2160 };
const set = (changes: Partial<VideoSettings>) => ({ ...DEFAULT_VIDEO, ...changes });

test('keeps the original size unless asked', () => {
  assert.deepEqual(outputSize(uhd, DEFAULT_VIDEO), uhd);
  assert.equal(frameAspect(DEFAULT_VIDEO), null);
});

test('crops inside the picture without adding pixels', () => {
  assert.deepEqual(outputSize(uhd, set({ frame: '1:1' })), { width: 2160, height: 2160 });
  assert.deepEqual(outputSize(uhd, set({ frame: '9:16' })), { width: 1216, height: 2160 });
  assert.deepEqual(outputSize({ width: 2160, height: 3840 }, set({ frame: '16:9' })), { width: 2160, height: 1216 });
});

test('a resolution sets the shorter side, whichever way round', () => {
  assert.deepEqual(outputSize(uhd, set({ resolution: '1080' })), { width: 1920, height: 1080 });
  assert.deepEqual(outputSize(uhd, set({ resolution: '1080', frame: '9:16' })), { width: 1080, height: 1920 });
  assert.deepEqual(outputSize(uhd, set({ resolution: '720', frame: '1:1' })), { width: 720, height: 720 });
});

test('a custom size wins and stays even, as video encoders need', () => {
  assert.deepEqual(outputSize(uhd, set({ resolution: 'custom', customWidth: 1281, customHeight: 719 })), { width: 1282, height: 720 });
  assert.ok(Math.abs(frameAspect(set({ resolution: 'custom', customWidth: 1000, customHeight: 500, frame: '1:1' }))! - 2) < 1e-9);
});

test('chooses the frame rate', () => {
  assert.equal(outputFps('60000/1001', DEFAULT_VIDEO), '60000/1001');
  assert.equal(outputFps('60000/1001', set({ fps: '30' })), '30');
  assert.equal(outputFps('60000/1001', set({ fps: 'custom', customFps: 48 })), '48');
});

test('matching the original scales down with the frame', () => {
  const half = { width: 1920, height: 1080 };
  assert.equal(outputKbps(100000, uhd, uhd, DEFAULT_VIDEO), 100000);
  assert.equal(outputKbps(100000, uhd, half, DEFAULT_VIDEO), 25000);
  assert.equal(outputKbps(100000, uhd, half, set({ bitrate: '40' })), 40000);
  assert.equal(outputKbps(100000, uhd, half, set({ bitrate: 'custom', customBitrate: 12.5 })), 12500);
});

test('puts the dials on after the crop', () => {
  const filter = videoFilter({ width: 1080, height: 1920 }, '30', 180, 0.25, 0.5, true);
  assert.ok(filter.startsWith('[0:v]hflip,vflip,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-ow)*0.25:(ih-oh)*0.5'));
  assert.ok(filter.indexOf('crop=') < filter.indexOf('overlay='));
  assert.equal(videoFilter(uhd, '30', 0, 0.5, 0.5, false).includes('overlay'), false);
});
