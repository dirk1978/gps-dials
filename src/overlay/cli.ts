import { toColumns } from '../activity/columns.ts';
import { readActivity } from '../activity/index.ts';
import { renderOverlay } from './export.ts';
import type { OverlayFormat } from './formats.ts';
import { defaultTemplate } from './template.ts';

const [clip, activity, clipStartIso, outPath, format = 'prores-alpha', hz] = process.argv.slice(2);
if (!clip || !activity || !clipStartIso || !outPath) {
  console.error('Usage: npm run overlay -- <clip.mp4> <activity.fit> <clip start, ISO time> <out file> [prores-alpha|chroma-h264] [updates per second]');
  process.exit(1);
}

const stats = await renderOverlay({
  clip,
  clipStart: Date.parse(clipStartIso) / 1000,
  track: toColumns(readActivity(activity)),
  template: defaultTemplate,
  format: format as OverlayFormat,
  outPath,
  updateHz: hz ? Number(hz) : undefined,
}, fraction => {
  if (Math.round(fraction * 100) % 25 === 0) process.stdout.write(`${Math.round(fraction * 100)}% `);
});
console.log(`\n${stats.frames} dial updates in ${stats.seconds.toFixed(1)} s`);
