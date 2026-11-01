import { basename } from 'node:path';
import { readActivity } from '../activity/index.ts';
import { syncClip } from './engine.ts';

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

const track = readActivity(activityPath);
const gaps = track.slice(1).map((p, i) => p.t - track[i].t).sort((a, b) => a - b);
console.log(`Track: ${track.length} points, ${iso(track[0].t)} to ${iso(track[track.length - 1].t)}`);
console.log(`       one point every ${gaps[Math.floor(gaps.length / 2)]}s typically, up to ${gaps[gaps.length - 1]}s apart`);

const r = await syncClip(clip, track, deviceId);
console.log(`Clip:  ${basename(clip)}, read as ${r.deviceName}`);
console.log(`       ${fmt(r.motionSeconds, 1)}s of motion from ${r.source}`);
console.log(`\nClip's own clock says ${iso(r.clockTime)}.`);
console.log(`Best match: clip starts ${iso(r.clipStart)} (camera clock is ${fmt(r.clockTime - r.clipStart, 2)}s ahead of the track)`);
console.log(`  turning r=${fmt(r.turnR)}${r.speedR != null ? `, speed r=${fmt(r.speedR)}` : ''}, lead over next candidate ${fmt(r.lead)}`);
if (r.runnerUp) console.log(`  next candidate: ${iso(r.runnerUp.clipStart)}, r=${fmt(r.runnerUp.turnR)}`);
console.log(r.confident ? '\nResult: AUTO-SYNC OK' : '\nResult: NOT SURE, send to manual sync');
console.log(`Offset from track start to video start: ${fmt(r.clipStart - track[0].t, 2)}s`);
