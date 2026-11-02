import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import type { TrackColumns } from '../sync/timeline.ts';
import { isUpsideDown } from '../sync/orientation.ts';
import { drawFrame, type Ctx } from './draw.ts';
import { DEFAULT_UPDATE_HZ, clipGeometry, overlayFrame } from './export.ts';
import type { Template } from './template.ts';
import { videoFilter, type Size, type VideoSettings } from './video-settings.ts';

const AUDIO_ARGS = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];

export interface VideoJob {
  clip: string;
  /** On the track's clock. Null for a clip that hasn't been synced, which gets no dials. */
  clipStart: number | null;
  from: number;
  to: number;
  manualRotation: number;
  autoRotate: boolean;
  track: TrackColumns | null;
  template: Template;
  settings: VideoSettings;
  size: Size;
  fps: string;
  encoderArgs: string[];
  outPath: string;
  mapToken?: string;
}

function hasAudio(clip: string): boolean {
  return execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', clip]).toString().trim() !== '';
}

/** Renders one stretch of one clip, with its dials drawn on, into a finished file. */
export async function renderVideo(job: VideoJob, onProgress: (fraction: number) => void = () => {}, signal?: AbortSignal): Promise<{ missingTiles: number }> {
  const { clip, from, to, size, fps, settings } = job;
  const duration = to - from;
  const rotation = (job.manualRotation + (job.autoRotate && await isUpsideDown(clip) ? 180 : 0)) % 360;
  const withDials = settings.dials && job.track != null && job.clipStart != null;
  const prepared = withDials
    ? await overlayFrame({ clip, clipStart: job.clipStart!, track: job.track!, template: job.template, mapToken: job.mapToken }, size.width, size.height, clipGeometry(clip).duration)
    : null;

  const inputs = ['-hwaccel', 'auto', '-ss', String(from), '-t', String(duration), '-i', clip];
  if (prepared) inputs.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${size.width}x${size.height}`, '-framerate', String(DEFAULT_UPDATE_HZ), '-i', '-');
  // Joined clips must all match, so a silent clip still needs a sound track.
  const sound = settings.audio && hasAudio(clip);
  const silent = settings.audio && !sound;
  if (silent) inputs.push('-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=r=48000:cl=stereo');
  const audio = sound ? ['-map', '0:a:0', ...AUDIO_ARGS] : silent ? ['-map', `${prepared ? 2 : 1}:a`, ...AUDIO_ARGS] : ['-an'];

  mkdirSync(dirname(job.outPath), { recursive: true });
  const partial = `${job.outPath}.part.mp4`;
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error', '-y', '-nostats', '-progress', 'pipe:1', ...inputs,
    '-filter_complex', videoFilter(size, fps, rotation, settings.cropX, settings.cropY, prepared != null),
    '-map', '[out]', ...audio, ...job.encoderArgs, '-t', String(duration), '-movflags', '+faststart', partial,
  ], { stdio: [prepared ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let errors = '';
  ffmpeg.stderr!.on('data', d => { errors += d; });
  ffmpeg.stdout!.on('data', chunk => {
    const made = /out_time_us=(\d+)/.exec(String(chunk));
    if (made) onProgress(Math.min(1, Number(made[1]) / 1e6 / duration));
  });
  // ffmpeg stops reading once it has enough, which isn't an error here.
  ffmpeg.stdin?.on('error', () => {});
  const finished = new Promise<number>((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => resolve(code ?? 1));
  });
  const cancel = () => ffmpeg.kill();
  signal?.addEventListener('abort', cancel);

  try {
    if (prepared) {
      const canvas = createCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      const frames = Math.ceil(duration * DEFAULT_UPDATE_HZ);
      for (let i = 0; i < frames && ffmpeg.exitCode == null; i++) {
        if (signal?.aborted) throw new Error('Cancelled');
        ctx.clearRect(0, 0, size.width, size.height);
        drawFrame(ctx as unknown as Ctx, prepared.frame, job.clipStart! + from + i / DEFAULT_UPDATE_HZ);
        const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
        if (!ffmpeg.stdin!.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) {
          await Promise.race([once(ffmpeg.stdin!, 'drain'), finished]);
        }
      }
      ffmpeg.stdin!.end();
    }
    const code = await finished;
    if (signal?.aborted) throw new Error('Cancelled');
    if (code !== 0) throw new Error(errors.trim() || `ffmpeg exited with ${code}`);
    try {
      renameSync(partial, job.outPath);
    } catch (error) {
      const failure = (error as NodeJS.ErrnoException).code;
      if (failure === 'EBUSY' || failure === 'EPERM') throw new Error(`${basename(job.outPath)} is open in another program. Close it there and export again.`);
      throw error;
    }
  } catch (error) {
    ffmpeg.kill();
    await finished.catch(() => {});
    rmSync(partial, { force: true });
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
  return { missingTiles: prepared?.missing ?? 0 };
}
