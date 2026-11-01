import { readActivity } from '../activity/index.ts';
import { readClipSensors } from '../devices/index.ts';
import { syncClip, syncSession } from '../sync/engine.ts';

interface Job {
  clip?: string;
  upsideDown?: boolean;
  clips?: string[];
  sensors?: string;
  trackPath?: string;
}

/** Runs in its own process, because motion analysis would otherwise freeze the window. */
const port = process.parentPort;
port.once('message', async ({ data }: { data: Job }) => {
  try {
    if (data.sensors) {
      port.postMessage({ ok: true, result: readClipSensors(data.sensors) });
      process.exit(0);
    }
    const track = readActivity(data.trackPath!);
    const result = data.clips
      ? await syncSession(data.clips.map(path => ({ path })), track, (done, total) => port.postMessage({ progress: true, done, total }), data.trackPath)
      : await syncClip(data.clip!, track, undefined, data.upsideDown);
    port.postMessage({ ok: true, result });
  } catch (error) {
    port.postMessage({ ok: false, error: String((error as Error)?.message ?? error) });
  }
  process.exit(0);
});
