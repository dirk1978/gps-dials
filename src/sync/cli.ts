import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readActivity } from '../activity/index.ts';
import { findDevice } from '../devices/index.ts';
import { gpsYawRate, resample, slidingCorrelation, smooth, topPeaks } from './correlate.ts';

const HZ = 4;
const COURSE_SPAN_S = 4;
const SMOOTH_S = 5;
/** Camera clocks can be wrong by whole hours, plus this much. */
const CLOCK_SEARCH_S = 300;
/**
 * Provisional, set from two clips. Long clips score a lower r but stand out far
 * more clearly, so the lead over the next candidate does most of the work.
 */
const MIN_TURN_R = 0.4;
const MIN_SPEED_R = 0.5;
const MIN_LEAD = 0.25;

const args = process.argv.slice(2);
const deviceFlag = args.indexOf('--device');
const deviceId = deviceFlag >= 0 ? args.splice(deviceFlag, 2)[1] : undefined;
const [clip, activityPath] = args;
if (!clip || !activityPath) {
  console.error('Usage: npm run sync -- [--device <id>] <clip.mp4> <activity.fit>');
  process.exit(1);
}

const iso = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
const fmt = (n: number, d = 3) => n.toFixed(d);

function clipStartFromContainer(path: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=creation_time', '-of', 'csv=p=0', path]).toString().trim();
  return Date.parse(out) / 1000;
}

const track = readActivity(activityPath);
const gaps = track.slice(1).map((p, i) => p.t - track[i].t).sort((a, b) => a - b);
console.log(`Track: ${track.length} points, ${iso(track[0].t)} to ${iso(track[track.length - 1].t)}`);
console.log(`       one point every ${gaps[Math.floor(gaps.length / 2)]}s typically, up to ${gaps[gaps.length - 1]}s apart`);

const device = findDevice(clip, deviceId);
const motion = await device.readMotion(clip, HZ);
console.log(`Clip:  ${basename(clip)}, read as ${device.name}`);
console.log(`       ${fmt(motion.turnRate.length / HZ, 1)}s of motion from ${motion.source}`);

const smoothing = SMOOTH_S * HZ + 1;
const start = track[0].t;
const grid = resample(track, start, HZ);
const turn = slidingCorrelation(smooth(motion.turnRate, smoothing), smooth(gpsYawRate(grid, HZ, COURSE_SPAN_S), smoothing));
const speed = motion.roughness ? slidingCorrelation(smooth(motion.roughness, smoothing), smooth(grid.speed, smoothing)) : null;

const timeAt = (index: number) => start + (index + turn.origin) / HZ;
const clockTime = clipStartFromContainer(clip);
const inWindow = (i: number) => {
  const distance = timeAt(i) - clockTime;
  const hours = Math.round(distance / 3600);
  return Math.abs(hours) <= 2 && Math.abs(distance - hours * 3600) <= CLOCK_SEARCH_S;
};
const windowed = turn.scores.map((v, i) => (inWindow(i) ? v : -1));

const [best, runnerUp] = topPeaks(windowed, 2, 15 * HZ);
const bestTime = timeAt(best.index);
const lead = best.score - (runnerUp?.score ?? -1);
console.log(`\nClip's own clock says ${iso(clockTime)}. Searched within ${CLOCK_SEARCH_S}s of that, allowing whole-hour errors.`);
console.log(`Best match: clip starts ${iso(bestTime)} (camera clock is ${fmt(clockTime - bestTime, 2)}s ahead of the track)`);
const speedR = speed ? speed.scores[best.index] : null;
console.log(`  turning r=${fmt(best.score)}${speedR != null ? `, speed r=${fmt(speedR)}` : ''}, lead over next candidate ${fmt(lead)}`);
if (runnerUp) console.log(`  next candidate: ${iso(timeAt(runnerUp.index))}, r=${fmt(runnerUp.score)}`);

const confident = best.score >= MIN_TURN_R && (speedR == null || speedR >= MIN_SPEED_R) && lead >= MIN_LEAD;
console.log(confident ? '\nResult: AUTO-SYNC OK' : '\nResult: NOT SURE, send to manual sync');
console.log(`Offset from track start to video start: ${fmt(bestTime - start, 2)}s`);
