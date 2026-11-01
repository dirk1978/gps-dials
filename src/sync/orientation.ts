import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const THUMB = 32;
const SAMPLES = 9;
/** Brightness difference, out of 255, that counts as a clear sky at one end of the frame. */
const SKY_MARGIN = 14;
const MIN_VOTES = 0.6;

export type Rotation = 0 | 90 | 180 | 270;

/** The clockwise turn the file asks for in its display matrix. */
export function displayRotation(clip: string): Rotation {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream_side_data=rotation', '-of', 'csv=p=0', clip]).toString();
  const value = Number(out.match(/-?\d+/)?.[0] ?? 0);
  return (((-value % 360) + 360) % 360) as Rotation;
}

/** Whether a frame, given as rows of grey pixels, has its sky at the bottom (1), top (-1) or neither (0). */
export function skyVote(pixels: Uint8Array, size: number): number {
  const third = Math.floor(size / 3);
  const mean = (fromRow: number, toRow: number) => {
    let sum = 0;
    for (let i = fromRow * size; i < toRow * size; i++) sum += pixels[i];
    return sum / ((toRow - fromRow) * size);
  };
  const difference = mean(size - third, size) - mean(0, third);
  if (difference > SKY_MARGIN) return 1;
  if (difference < -SKY_MARGIN) return -1;
  return 0;
}

/** Most frames must show the sky at the bottom, and those must outnumber the frames showing it at the top. */
export function looksUpsideDown(votes: number[]): boolean {
  const bottom = votes.filter(v => v > 0).length;
  const top = votes.filter(v => v < 0).length;
  return bottom >= votes.length * MIN_VOTES && bottom > top;
}

async function grabFrame(clip: string, seconds: number, inputArgs: string[]): Promise<Uint8Array | null> {
  const { stdout } = await run('ffmpeg', [
    '-v', 'error', ...inputArgs, '-ss', String(seconds), '-i', clip, '-map', '0:v:0', '-frames:v', '1',
    '-vf', `scale=${THUMB}:${THUMB},format=gray`, '-f', 'rawvideo', '-',
  ], { encoding: 'buffer', maxBuffer: 1 << 20 });
  return stdout.length === THUMB * THUMB ? stdout : null;
}

/**
 * Looks for the sky in frames across the clip. It misses plenty on grey days and can
 * misfire, so it is only a backstop: a file that states its rotation is believed.
 */
export async function isUpsideDown(clip: string, inputArgs: string[] = []): Promise<boolean> {
  if (inputArgs.length === 0 && displayRotation(clip) !== 0) return false;
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]);
  const duration = Number(stdout);
  const votes: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const frame = await grabFrame(clip, (duration * (i + 0.5)) / SAMPLES, inputArgs);
    if (frame) votes.push(skyVote(frame, THUMB));
  }
  return votes.length > 0 && looksUpsideDown(votes);
}
