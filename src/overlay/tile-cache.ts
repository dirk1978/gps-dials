import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage, type Image } from '@napi-rs/canvas';

/** OpenStreetMap asks for no more than two connections at once. */
const CONNECTIONS = 2;
const CACHE_DAYS = 30;
const CONTACT = 'https://github.com/dirk1978/gps-dials';

function cacheDir(): string {
  const dir = process.env.GPS_DIALS_TILE_CACHE ?? join(tmpdir(), 'gps-dials-tiles');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Tokens are left out of the name, so a cached file never records a key. */
function cachePath(url: string): string {
  const key = url.replace(/([?&]access_token=)[^&]*/, '$1');
  return join(cacheDir(), `${createHash('sha1').update(key).digest('hex')}.tile`);
}

function readCache(path: string): Buffer | null {
  try {
    const age = Date.now() - statSync(path).mtimeMs;
    return age < CACHE_DAYS * 86400e3 ? readFileSync(path) : null;
  } catch {
    return null;
  }
}

async function fetchTile(url: string): Promise<Buffer | null> {
  const path = cachePath(url);
  const cached = readCache(path);
  if (cached) return cached;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': `gps-dials/${process.env.npm_package_version ?? process.env.GPS_DIALS_VERSION ?? 'dev'} (+${CONTACT})`, Referer: CONTACT },
    });
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    writeFileSync(path, body);
    return body;
  } catch {
    return null;
  }
}

export interface LoadedTiles {
  images: Map<string, Image>;
  missing: number;
}

/** Fetches only the tiles this clip passes through, reusing any already on disk. */
export async function loadTiles(urls: Iterable<string>): Promise<LoadedTiles> {
  const queue = [...new Set(urls)];
  const images = new Map<string, Image>();
  let missing = 0;
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const body = await fetchTile(url);
      try {
        if (!body) throw new Error('no tile');
        images.set(url, await loadImage(body));
      } catch {
        missing++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONNECTIONS }, worker));
  return { images, missing };
}
