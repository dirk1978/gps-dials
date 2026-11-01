// Downloads the FFmpeg that ships inside the installers, for the platform this runs on.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BTBN = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest';
const FFMPEG_STATIC = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';
const OUT = join('vendor', 'ffmpeg');

const exe = process.platform === 'win32' ? '.exe' : '';

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name) {
      return path;
    }
  }
  return null;
}

/** BtbN's stable-branch GPL builds, which include NVIDIA, Intel and AMD encoders. */
async function fetchBtbn(platform, extension) {
  const name = `ffmpeg-n8.1-latest-${platform}-gpl-8.1.${extension}`;
  const [archive, sums] = await Promise.all([download(`${BTBN}/${name}`), download(`${BTBN}/checksums.sha256`)]);
  const expected = sums.toString().split('\n').find(line => line.endsWith(name))?.split(/\s+/)[0];
  const actual = createHash('sha256').update(archive).digest('hex');
  if (!expected || expected !== actual) throw new Error(`Checksum mismatch for ${name}`);

  const work = mkdtempSync(join(tmpdir(), 'ffmpeg-'));
  const file = join(work, name);
  writeFileSync(file, archive);
  execFileSync('tar', ['-xf', file, '-C', work]);
  for (const tool of ['ffmpeg', 'ffprobe']) copyFileSync(findFile(work, `${tool}${exe}`), join(OUT, `${tool}${exe}`));
  copyFileSync(findFile(work, 'license.txt'), join(OUT, 'FFMPEG-LICENSE.txt'));
  rmSync(work, { recursive: true, force: true });
}

async function fetchMac() {
  for (const tool of ['ffmpeg', 'ffprobe']) {
    writeFileSync(join(OUT, tool), await download(`${FFMPEG_STATIC}/${tool}-darwin-${process.arch}`));
  }
  writeFileSync(join(OUT, 'FFMPEG-LICENSE.txt'), await download(`${FFMPEG_STATIC}/darwin-${process.arch}.LICENSE`));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (process.platform === 'win32') await fetchBtbn('win64', 'zip');
else if (process.platform === 'linux') await fetchBtbn('linux64', 'tar.xz');
else await fetchMac();

for (const tool of ['ffmpeg', 'ffprobe']) {
  const path = join(OUT, `${tool}${exe}`);
  if (!existsSync(path)) throw new Error(`${path} is missing`);
  chmodSync(path, 0o755);
  console.log(path, `${(statSync(path).size / 1e6).toFixed(0)} MB`);
}
