import { binned, latest, sensorTimes } from '../sensors.ts';
import type { ClipSensors } from '../types.ts';
import { readDjmdSettings, type DjmdFrame } from './djmd.ts';

/** The exposure settings and any attitude in a DJI clip, gathered at gauge speed. */
export function djiSettings(clip: string): ClipSensors | null {
  const frames = readDjmdSettings(clip);
  if (frames.length === 0) return null;
  const t = sensorTimes(frames[frames.length - 1].t);
  const at = frames.map(f => f.t);
  const series: ClipSensors['series'] = {};
  const add = (id: keyof ClipSensors['series'], key: keyof DjmdFrame, gather = binned) => {
    const values = frames.map(f => f[key] ?? null);
    if (values.some(v => v != null)) series[id] = gather(t, at, values);
  };
  add('iso', 'iso');
  add('shutter', 'shutter', latest);
  add('aperture', 'aperture', latest);
  add('whiteBalance', 'whiteBalance');
  add('pitch', 'pitch');
  add('leanAngle', 'roll');
  if (frames.some(f => f.yaw != null)) series.heading = latest(t, at, frames.map(f => (f.yaw == null ? null : (f.yaw + 360) % 360)));
  return { t, series };
}
