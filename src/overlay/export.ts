import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { once } from 'node:events';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import type { TrackColumns } from '../sync/timeline.ts';
import { prepareOverlayData } from './data.ts';
import { drawFrame, type Ctx } from './draw.ts';
import { bestH264Encoder } from './encoders.ts';
import { FORMAT_EXTENSIONS, type OverlayFormat } from './formats.ts';
import type { Template } from './template.ts';


/** Dials change far slower than the picture, so most frames can be repeats. */
export const DEFAULT_UPDATE_HZ = 10;
const CHROMA_GREEN = '#00ff00';

export interface ClipGeometry {
  width: number;
  height: number;
  fps: string;
  duration: number;
}

export interface OverlayJob {
  clip: string;
  clipStart: number;
  track: TrackColumns;
  template: Template;
  format: OverlayFormat;
  outPath: string;
  updateHz?: number;
  /** Extra clockwise turn the viewer has applied, which can swap width and height. */
  extraRotation?: number;
}

/** Size and rate of the clip as it is displayed, so the overlay lines up in an editor. */
export function clipGeometry(clip: string, extraRotation = 0): ClipGeometry {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,duration:stream_side_data=rotation:format=duration', '-of', 'json', clip]).toString();
  const info = JSON.parse(out);
  const stream = info.streams[0];
  const fileRotation = Number(stream.side_data_list?.find((d: { rotation?: number }) => d.rotation != null)?.rotation ?? 0);
  const sideways = (fileRotation + extraRotation) % 180 !== 0;
  return {
    width: sideways ? stream.height : stream.width,
    height: sideways ? stream.width : stream.height,
    fps: stream.r_frame_rate,
    // The file can run on past the picture, because audio often ends later.
    duration: Number(stream.duration ?? info.format.duration),
  };
}

/**
 * ProRes stores every frame whole, so at the clip's own rate a 40 second overlay is 1.6 GB.
 * It stays at the dial update rate instead, which editors place correctly by time.
 * H.264 stores repeats for almost nothing, so it can match the clip exactly.
 */
function encoderArgs(format: OverlayFormat, fps: string, duration: number): string[] {
  if (format === 'prores-alpha') {
    return ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-qscale:v', '11'];
  }
  return ['-vf', `fps=${fps}`, '-t', String(duration), '-pix_fmt', 'yuv420p', ...bestH264Encoder().args];
}

const FONT_FILES = ['600-normal', '700-normal', '600-italic', '700-italic'];
let fontsReady = false;

/** The app points this at its own copy of the fonts. Running from source, they're in node_modules. */
function fontPath(file: string): string {
  const dir = process.env.GPS_DIALS_FONT_DIR;
  if (dir) return join(dir, file);
  return createRequire(join(process.cwd(), 'package.json')).resolve(`@fontsource/barlow-condensed/files/${file}`);
}

/** The export has no browser to load the display font, so it registers the same files. */
function registerFonts(): void {
  if (fontsReady) return;
  GlobalFonts.loadSystemFonts();
  for (const weight of FONT_FILES) {
    GlobalFonts.registerFromPath(fontPath(`barlow-condensed-latin-${weight}.woff2`), 'Barlow Condensed');
  }
  fontsReady = true;
}

export interface RenderStats {
  frames: number;
  seconds: number;
}

/** Renders one overlay file. It appears at `outPath` only once it is complete. */
export async function renderOverlay(
  job: OverlayJob,
  onProgress: (fraction: number) => void = () => {},
  signal?: AbortSignal,
): Promise<RenderStats> {
  const started = Date.now();
  registerFonts();
  const { width, height, fps, duration } = clipGeometry(job.clip, job.extraRotation);
  const hz = job.updateHz ?? DEFAULT_UPDATE_HZ;
  const frames = Math.ceil(duration * hz);
  const frame = {
    width,
    height,
    template: job.template,
    data: prepareOverlayData(job.track, job.template.gradientSpan),
    clipStart: job.clipStart,
    clipEnd: job.clipStart + duration,
  };

  mkdirSync(dirname(job.outPath), { recursive: true });
  const extension = FORMAT_EXTENSIONS[job.format];
  const partial = `${job.outPath}.part${extension}`;
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(hz), '-i', '-',
    ...encoderArgs(job.format, fps, duration), '-an', partial,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '';
  ffmpeg.stderr.on('data', d => { errors += d; });
  const finished = new Promise<number>((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => resolve(code ?? 1));
  });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new Error('Cancelled');
      if (job.format === 'chroma-h264') {
        ctx.fillStyle = CHROMA_GREEN;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
      drawFrame(ctx as unknown as Ctx, frame, job.clipStart + i / hz);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      if (!ffmpeg.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength))) await once(ffmpeg.stdin, 'drain');
      onProgress((i + 1) / frames);
    }
    ffmpeg.stdin.end();
    const code = await finished;
    if (code !== 0) throw new Error(errors.trim() || `ffmpeg exited with ${code}`);
    renameSync(partial, job.outPath);
  } catch (error) {
    ffmpeg.kill();
    await finished.catch(() => {});
    rmSync(partial, { force: true });
    throw error;
  }
  return { frames, seconds: (Date.now() - started) / 1000 };
}
