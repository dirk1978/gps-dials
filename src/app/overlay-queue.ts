import { basename, dirname, extname, join } from 'node:path';
import { utilityProcess, type UtilityProcess } from 'electron';
import { FORMAT_EXTENSIONS, type OverlayFormat } from '../overlay/formats.ts';
import type { Template } from '../overlay/template.ts';

/** Enough to use the CPU well without starving the rest of the machine. */
const PARALLEL = 3;

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

export function cancelOverlays(): void {
  cancelled = true;
  for (const worker of running) worker.postMessage('cancel');
}

function renderOne(workerPath: string, item: OverlayRequest, batch: OverlayBatch, report: (p: BatchProgress) => void): Promise<void> {
  return new Promise(resolve => {
    const worker = utilityProcess.fork(workerPath, [], { serviceName: 'gps-dials overlay' });
    running.push(worker);
    let settled = false;
    const finish = (state: 'done' | 'failed', error?: string) => {
      if (settled) return;
      settled = true;
      running = running.filter(w => w !== worker);
      report({ clip: item.clip, state, fraction: state === 'done' ? 1 : 0, error });
      resolve();
    };
    worker.on('message', message => {
      if (message.progress != null) report({ clip: item.clip, state: 'running', fraction: message.progress });
      else if (message.done) finish('done');
      else if (message.failed) finish('failed', message.failed);
    });
    worker.once('exit', () => finish('failed', 'Stopped unexpectedly'));
    worker.postMessage({
      clip: item.clip,
      clipStart: item.clipStart,
      extraRotation: item.extraRotation,
      trackPath: batch.trackPath,
      format: batch.format,
      template: batch.template,
      outPath: overlayPath(item.clip, batch.format, batch.outDir),
    });
  });
}

export async function renderBatch(workerPath: string, batch: OverlayBatch, report: (p: BatchProgress) => void): Promise<{ done: number; failed: number; cancelled: boolean; outDir: string }> {
  cancelled = false;
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
      await renderOne(workerPath, queue.shift()!, batch, count);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, lane));
  return { done, failed, cancelled, outDir: dirname(overlayPath(batch.items[0].clip, batch.format, batch.outDir)) };
}
