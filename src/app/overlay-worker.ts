import { toColumns } from '../activity/columns.ts';
import { readActivity } from '../activity/index.ts';
import { renderVideo, type VideoJob } from '../overlay/composite.ts';
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
  mapToken: string;
}

/** Renders one overlay in its own process, so several can run side by side. */
const port = process.parentPort;
const cancel = new AbortController();
type VideoMessage = Omit<VideoJob, 'track'> & { video: true; trackPath: string | null };

port.on('message', async ({ data }: { data: Job | VideoMessage | 'cancel' }) => {
  if (data === 'cancel') {
    cancel.abort();
    return;
  }
  try {
    let lastSent = 0;
    const report = (fraction: number) => {
      if (fraction - lastSent >= 0.02) {
        lastSent = fraction;
        port.postMessage({ progress: fraction });
      }
    };
    if ('video' in data) {
      const needsTrack = data.trackPath && data.clipStart != null && data.settings.dials;
      const track = needsTrack ? toColumns(readActivity(data.trackPath!)) : null;
      const { missingTiles } = await renderVideo({ ...data, track }, report, cancel.signal);
      port.postMessage({ done: true, missingTiles });
    } else {
      const stats = await renderOverlay({ ...data, track: toColumns(readActivity(data.trackPath)) }, report, cancel.signal);
      port.postMessage({ done: true, missingTiles: stats.missingTiles });
    }
  } catch (error) {
    port.postMessage({ failed: String((error as Error)?.message ?? error) });
  }
  process.exit(0);
});
