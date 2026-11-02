import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyFolder, folderSize, removeSyncNotes } from './cache.ts';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'gps-dials-cache-'));
}

test('measures and empties a folder, including what is inside it', () => {
  const dir = folder();
  mkdirSync(join(dir, 'tiles'));
  writeFileSync(join(dir, 'a.bin'), Buffer.alloc(100));
  writeFileSync(join(dir, 'tiles', 'b.bin'), Buffer.alloc(50));
  assert.equal(folderSize(dir), 150);
  assert.deepEqual(emptyFolder(dir), { freed: 150, left: 0 });
  assert.deepEqual(readdirSync(dir), []);
  assert.ok(existsSync(dir));
  rmSync(dir, { recursive: true });
});

test('a folder that was never made holds nothing', () => {
  const dir = join(tmpdir(), 'gps-dials-never-made');
  assert.equal(folderSize(dir), 0);
  assert.deepEqual(emptyFolder(dir), { freed: 0, left: 0 });
});

test('removes sync notes and never the clips beside them', () => {
  const dir = folder();
  const clip = join(dir, 'clip.mp4');
  const other = join(dir, 'other.mp4');
  writeFileSync(clip, 'video');
  writeFileSync(other, 'video');
  writeFileSync(`${clip}.gpsdials.json`, '{}');
  writeFileSync(join(dir, 'activity.fit'), 'track');
  assert.equal(removeSyncNotes([clip, other]), 1);
  assert.deepEqual(readdirSync(dir).sort(), ['activity.fit', 'clip.mp4', 'other.mp4']);
  rmSync(dir, { recursive: true });
});
