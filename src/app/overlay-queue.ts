import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { utilityProcess, type UtilityProcess } from 'electron';
import { bestVideoEncoder, encoderArgs } from '../overlay/encoders.ts';
import { clipGeometry } from '../overlay/export.ts';
import { FORMAT_EXTENSIONS, type OverlayFormat } from '../overlay/formats.ts';
import type { Template } from '../overlay/template.ts';
import { outputFps, outputKbps, outputSize, type VideoSettings } from '../overlay/video-settings.ts';

/** Enough to use the CPU well without starving the rest of the machine. */
const PARALLEL = 3;
/** Decoding and encoding 4K at once is heavy, even on a GPU. */
const VIDEO_PARALLEL = 2;

export interface OverlayRequest {
  clip: string;
  clipStart: number;
  extraRotation: number;
}

export interface OverlayBatch {
  items: OverlayRequest[];
  trackPath: string;
  format: OverlayFormat;
  template: Template;
  mapToken?: string;
  /** Defaults to an `overlays` folder beside the first clip. */
  outDir?: string;
}

export interface BatchProgress {
  clip: string;
  state: 'running' | 'done' | 'failed';
  fraction: number;
  error?: string;
}

export function overlayPath(clip: string, format: OverlayFormat, outDir?: string): string {
  const base = basename(clip, extname(clip));
  return join(outDir ?? join(dirname(clip), 'overlays'), `${base}_overlay${FORMAT_EXTENSIONS[format]}`);
}

let running: UtilityProcess[] = [];
let cancelled = false;
let missingTiles = 0;

export function cancelOverlays(): void {
  cancelled = true;
  for (const worker of running) worker.postMessage('cancel');
}

function renderOne(workerPath: string, clip: string, job: object, report: (p: BatchProgress) => void): Promise<void> {
  return new Promise(resolve => {
    const worker = utilityProcess.fork(workerPath, [], { serviceName: 'gps-dials overlay' });
    running.push(worker);
    let settled = false;
    const finish = (state: 'done' | 'failed', error?: string) => {
      if (settled) return;
      settled = true;
      running = running.filter(w => w !== worker);
      report({ clip, state, fraction: state === 'done' ? 1 : 0, error });
      resolve();
    };
    worker.on('message', message => {
      if (message.progress != null) report({ clip, state: 'running', fraction: message.progress });
      else if (message.done) {
        missingTiles += message.missingTiles ?? 0;
        finish('done');
      }
      else if (message.failed) finish('failed', message.failed);
    });
    worker.once('exit', () => finish('failed', 'Stopped unexpectedly'));
    worker.postMessage(job);
  });
}

export async function renderBatch(workerPath: string, batch: OverlayBatch, report: (p: BatchProgress) => void): Promise<{ done: number; failed: number; cancelled: boolean; outDir: string; missingTiles: number }> {
  cancelled = false;
  missingTiles = 0;
  const queue = [...batch.items];
  let done = 0;
  let failed = 0;
  const count = (p: BatchProgress) => {
    if (p.state === 'done') done++;
    if (p.state === 'failed' && !cancelled) failed++;
    report(p);
  };
  const lane = async () => {
    while (queue.length > 0 && !cancelled) {
      const item = queue.shift()!;
      await renderOne(workerPath, item.clip, {
        clip: item.clip,
        clipStart: item.clipStart,
        extraRotation: item.extraRotation,
        trackPath: batch.trackPath,
        format: batch.format,
        template: batch.template,
        mapToken: batch.mapToken ?? '',
        outPath: overlayPath(item.clip, batch.format, batch.outDir),
      }, count);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, lane));
  return { done, failed, cancelled, missingTiles, outDir: dirname(overlayPath(batch.items[0].clip, batch.format, batch.outDir)) };
}

export interface VideoItem {
  clip: string;
  clipStart: number | null;
  from: number;
  to: number;
  manualRotation: number;
  autoRotate: boolean;
}

export interface VideoBatch {
  items: VideoItem[];
  trackPath: string | null;
  template: Template;
  settings: VideoSettings;
  /** The finished file, or the folder for one file per clip. */
  outPath: string;
  mapToken?: string;
}

function sourceKbps(clip: string): number {
  const bits = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=bit_rate', '-of', 'csv=p=0', clip]).toString();
  return Number(bits) / 1000 || 20000;
}

/** What an export will produce. The first clip sets the size and rate, as joined clips must match. */
export function planVideo(item: VideoItem, settings: VideoSettings) {
  const encoder = bestVideoEncoder(settings.codec);
  if (!encoder) throw new Error('This PC can\'t write that video format. Choose another.');
  const source = clipGeometry(item.clip, item.manualRotation);
  const size = outputSize(source, settings);
  const kbps = outputKbps(sourceKbps(item.clip), source, size, settings);
  return { ...size, fps: outputFps(source.fps, settings), kbps, encoder: encoder.name, encoderArgs: encoderArgs(encoder, kbps) };
}

function joinParts(parts: string[], outPath: string): void {
  const list = `${outPath}.parts.txt`;
  writeFileSync(list, parts.map(p => `file '${p.replaceAll("'", "'\\''")}'`).join('\n'));
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outPath]);
  } finally {
    rmSync(list, { force: true });
  }
}

/** One finished video from every clip's kept stretch, or one for each. */
export async function exportVideo(workerPath: string, batch: VideoBatch, report: (p: BatchProgress) => void): Promise<{ done: number; failed: number; cancelled: boolean; missingTiles: number; outPath: string }> {
  cancelled = false;
  missingTiles = 0;
  const plan = planVideo(batch.items[0], batch.settings);
  const joined = batch.settings.join && batch.items.length > 1;
  const partsDir = `${batch.outPath}.parts`;
  const pathFor = (item: VideoItem, i: number) => {
    if (joined) return join(partsDir, `${String(i).padStart(4, '0')}.mp4`);
    if (batch.settings.join) return batch.outPath;
    return join(batch.outPath, `${basename(item.clip, extname(item.clip))}_export.mp4`);
  };
  const parts = batch.items.map(pathFor);
  const queue = batch.items.map((item, i) => ({ item, outPath: parts[i], key: `${item.clip}#${i}` }));
  let done = 0;
  let failed = 0;
  const count = (p: BatchProgress) => {
    if (p.state === 'done') done++;
    if (p.state === 'failed' && !cancelled) failed++;
    report(p);
  };
  const lane = async () => {
    while (queue.length > 0 && !cancelled) {
      const { item, outPath, key } = queue.shift()!;
      await renderOne(workerPath, key, {
        ...item,
        video: true,
        trackPath: batch.trackPath,
        template: batch.template,
        settings: batch.settings,
        size: { width: plan.width, height: plan.height },
        fps: plan.fps,
        encoderArgs: plan.encoderArgs,
        outPath,
        mapToken: batch.mapToken ?? '',
      }, count);
    }
  };
  mkdirSync(joined ? partsDir : dirname(parts[0]), { recursive: true });
  try {
    await Promise.all(Array.from({ length: VIDEO_PARALLEL }, lane));
    if (joined && !cancelled && failed === 0) joinParts(parts, batch.outPath);
  } finally {
    if (joined) rmSync(partsDir, { recursive: true, force: true });
  }
  return { done, failed, cancelled, missingTiles, outPath: batch.outPath };
}
