import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HEIGHT = 720;
/** Close keyframes make scrubbing land instantly. */
const KEYFRAME_INTERVAL = 12;

const ENCODE = ['-c:v', 'h264_nvenc', '-preset', 'p1', '-tune', 'ull', '-rc', 'constqp', '-qp', '30', '-bf', '0', '-g', String(KEYFRAME_INTERVAL)];
const AUDIO_AND_OUTPUT = ['-map', '0:v:0', '-map', '0:a:0?', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart'];

interface Attempt {
  name: string;
  args(input: string): string[];
}

/** Proxies keep the sensor's pixels as they are. The app applies rotation itself, so no route can lose it. */
const RAW_PIXELS = ['-display_rotation', '0'];

/** Fastest first, so a machine without an NVIDIA GPU still gets a proxy. */
const ATTEMPTS: Attempt[] = [
  {
    name: 'GPU decode, scale and encode',
    args: input => [
      '-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', ...RAW_PIXELS, '-i', input,
      '-vf', `scale_cuda=-2:${HEIGHT}:format=yuv420p`, ...ENCODE, ...AUDIO_AND_OUTPUT,
    ],
  },
  {
    name: 'GPU decode and encode',
    args: input => ['-hwaccel', 'cuda', ...RAW_PIXELS, '-i', input, '-vf', `scale=-2:${HEIGHT},format=yuv420p`, ...ENCODE, ...AUDIO_AND_OUTPUT],
  },
  {
    name: 'Intel GPU',
    args: input => [
      '-hwaccel', 'auto', ...RAW_PIXELS, '-i', input, '-vf', `scale=-2:${HEIGHT},format=yuv420p`,
      '-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '30', '-g', String(KEYFRAME_INTERVAL), ...AUDIO_AND_OUTPUT,
    ],
  },
  {
    name: 'AMD GPU',
    args: input => [
      '-hwaccel', 'auto', ...RAW_PIXELS, '-i', input, '-vf', `scale=-2:${HEIGHT},format=yuv420p`,
      '-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '30', '-qp_p', '30', '-g', String(KEYFRAME_INTERVAL), ...AUDIO_AND_OUTPUT,
    ],
  },
  {
    name: 'CPU',
    args: input => [
      ...RAW_PIXELS, '-i', input, '-vf', `scale=-2:${HEIGHT},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-g', String(KEYFRAME_INTERVAL), ...AUDIO_AND_OUTPUT,
    ],
  },
];

export interface ProxyResult {
  path: string;
  method: string;
}

function encode(attempt: Attempt, input: string, output: string, duration: number, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-y', '-progress', 'pipe:1', ...attempt.args(input), output], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    ffmpeg.stderr.on('data', d => { errors += d; });
    ffmpeg.stdout.on('data', d => {
      const m = String(d).match(/out_time_us=(\d+)/);
      if (m) onProgress(Math.min(1, Number(m[1]) / 1e6 / duration));
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(errors.trim() || `ffmpeg exited with ${code}`))));
  });
}

/** Makes a small, quick-seeking copy for the screen. The original is never changed. */
export async function ensureProxy(clip: string, cacheDir: string, duration: number, onProgress: (fraction: number) => void): Promise<ProxyResult> {
  mkdirSync(cacheDir, { recursive: true });
  const { size, mtimeMs } = statSync(clip);
  const key = createHash('sha1').update(`raw|${clip}|${size}|${mtimeMs}`).digest('hex').slice(0, 16);
  const path = join(cacheDir, `${key}.mp4`);
  if (existsSync(path)) return { path, method: 'cached' };

  const partial = `${path}.part.mp4`;
  let lastError: unknown;
  for (const attempt of ATTEMPTS) {
    try {
      await encode(attempt, clip, partial, duration, onProgress);
      renameSync(partial, path);
      return { path, method: attempt.name };
    } catch (error) {
      lastError = error;
      rmSync(partial, { force: true });
    }
  }
  throw lastError;
}
