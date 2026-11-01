import { indexAtTime, positionAt } from '../../sync/timeline.ts';
import { drawPanel, type DisplayDef } from './common.ts';
import { drawMarker, drawRoute, trackHeading } from './route-line.ts';

/** The track's shape alone, for when a plain line suits better than a map. */
export const route: DisplayDef = {
  id: 'route',
  label: 'Route shape',
  usesTrack: true,
  draw(env) {
    const { ctx, box, style, data, time, clipStart, clipEnd, unit } = env;
    const { track } = data;
    drawPanel(env);

    const last = track.t.length - 1;
    const from = style.fullRide ? 0 : indexAtTime(track.t, clipStart);
    const to = style.fullRide ? last : indexAtTime(track.t, clipEnd);
    const view = style.zoomToClip
      ? { from: indexAtTime(track.t, clipStart), to: indexAtTime(track.t, clipEnd) }
      : { from, to };

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (let i = view.from; i <= view.to; i++) {
      minLat = Math.min(minLat, track.lat[i]);
      maxLat = Math.max(maxLat, track.lat[i]);
      minLon = Math.min(minLon, track.lon[i]);
      maxLon = Math.max(maxLon, track.lon[i]);
    }
    const squash = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max(1e-6, (maxLon - minLon) * squash);
    const spanY = Math.max(1e-6, maxLat - minLat);
    const scale = Math.min(box.w / spanX, box.h / spanY) * 0.84;
    const left = box.x + (box.w - spanX * scale) / 2;
    const top = box.y + (box.h - spanY * scale) / 2;
    const place = (lat: number, lon: number): [number, number] => [left + (lon - minLon) * squash * scale, top + (maxLat - lat) * scale];
    const project = (i: number) => place(track.lat[i], track.lon[i]);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(style.cornerRadius * unit, box.h / 2));
    ctx.clip();
    const now = Math.min(to, indexAtTime(track.t, time));
    const here = positionAt(track, time);
    const head = place(here.lat, here.lon);
    drawRoute(env, project, from, to, now, head);
    drawMarker(env, head[0], head[1], trackHeading(track, now));
    ctx.restore();
  },
};
