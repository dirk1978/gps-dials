import { execFileSync, spawn } from 'node:child_process';

const WIDTH = 160;
const HEIGHT = 90;
const FPS = 10;
const MAX_SHIFT_X = 10;
const MAX_SHIFT_Y = 4;
/** Only the top of the frame: the bottom often holds handlebars or the wearer, which turn with the camera. */
const BAND_TOP = 0.05;
const BAND_BOTTOM = 0.45;
const ASSUMED_HFOV_RAD = (120 * Math.PI) / 180;
const PROGRESS_EVERY = 20;

/** Best sideways shift between two frames, in pixels, with a sub-pixel estimate. */
function horizontalShift(prev: Uint8Array, cur: Uint8Array): number {
  const top = Math.floor(HEIGHT * BAND_TOP) + MAX_SHIFT_Y;
  const bottom = Math.floor(HEIGHT * BAND_BOTTOM);
  const costs = new Float64Array(2 * MAX_SHIFT_X + 1).fill(Infinity);
  for (let sy = -MAX_SHIFT_Y; sy <= MAX_SHIFT_Y; sy++) {
    for (let sx = -MAX_SHIFT_X; sx <= MAX_SHIFT_X; sx++) {
      let cost = 0;
      for (let y = top; y < bottom; y += 2) {
        const row = y * WIDTH;
        const shifted = (y + sy) * WIDTH + sx;
        for (let x = MAX_SHIFT_X; x < WIDTH - MAX_SHIFT_X; x += 2) {
          cost += Math.abs(prev[row + x] - cur[shifted + x]);
        }
      }
      if (cost < costs[sx + MAX_SHIFT_X]) costs[sx + MAX_SHIFT_X] = cost;
    }
  }
  let best = 0;
  for (let i = 1; i < costs.length; i++) if (costs[i] < costs[best]) best = i;
  if (best === 0 || best === costs.length - 1) return best - MAX_SHIFT_X;
  const curve = costs[best - 1] - 2 * costs[best] + costs[best + 1];
  const refine = curve > 0 ? (costs[best - 1] - costs[best + 1]) / (2 * curve) : 0;
  return best - MAX_SHIFT_X + refine;
}

/**
 * Rate of turn measured from the picture alone, in radians per second at `hz`,
 * positive clockwise. The scale is approximate but correlation ignores scale.
 */
export async function imageYawRate(clip: string, hz: number, upsideDown = false, onProgress?: (fraction: number) => void): Promise<Float64Array> {
  // An inverted picture would swap left and right, and put the handlebars in the analysed band.
  const turn = upsideDown ? 'hflip,vflip,' : '';
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error', '-hwaccel', 'auto', '-i', clip, '-map', '0:v:0',
    '-vf', `${turn}fps=${FPS},scale=${WIDTH}:${HEIGHT},format=gray`, '-f', 'rawvideo', '-',
  ], { stdio: ['ignore', 'pipe', 'inherit'] });

  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]).toString());
  const expected = Math.max(1, duration * FPS);
  const frameSize = WIDTH * HEIGHT;
  const shifts: number[] = [];
  let pending = Buffer.alloc(0);
  let prev: Uint8Array | null = null;
  for await (const chunk of ffmpeg.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let off = 0;
    while (pending.length - off >= frameSize) {
      const frame = Uint8Array.from(pending.subarray(off, off + frameSize));
      off += frameSize;
      if (prev) shifts.push(horizontalShift(prev, frame));
      prev = frame;
      if (onProgress && shifts.length % PROGRESS_EVERY === 0) onProgress(Math.min(1, shifts.length / expected));
    }
    pending = pending.subarray(off);
  }

  const n = Math.floor((shifts.length / FPS) * hz);
  const out = new Float64Array(n);
  const count = new Float64Array(n);
  const radPerPixel = ASSUMED_HFOV_RAD / WIDTH;
  shifts.forEach((dx, i) => {
    const bin = Math.floor(((i + 1) / FPS) * hz);
    if (bin >= n) return;
    // The scene sliding left means the camera turned right.
    out[bin] += -dx * radPerPixel * FPS;
    count[bin]++;
  });
  return out.map((v, i) => (count[i] ? v / count[i] : 0));
}
