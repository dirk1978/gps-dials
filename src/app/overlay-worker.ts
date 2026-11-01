import { toColumns } from '../activity/columns.ts';
import { readActivity } from '../activity/index.ts';
import { renderOverlay } from '../overlay/export.ts';
import type { OverlayFormat } from '../overlay/formats.ts';
import type { Template } from '../overlay/template.ts';

interface Job {
  clip: string;
  clipStart: number;
  trackPath: string;
  format: OverlayFormat;
  outPath: string;
  extraRotation: number;
  template: Template;
}

/** Renders one overlay in its own process, so several can run side by side. */
const port = process.parentPort;
const cancel = new AbortController();
port.on('message', async ({ data }: { data: Job | 'cancel' }) => {
  if (data === 'cancel') {
    cancel.abort();
    return;
  }
  try {
    let lastSent = 0;
    await renderOverlay({ ...data, track: toColumns(readActivity(data.trackPath)) }, fraction => {
      if (fraction - lastSent >= 0.02) {
        lastSent = fraction;
        port.postMessage({ progress: fraction });
      }
    }, cancel.signal);
    port.postMessage({ done: true });
  } catch (error) {
    port.postMessage({ failed: String((error as Error)?.message ?? error) });
  }
  process.exit(0);
});
