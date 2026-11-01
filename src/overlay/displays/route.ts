import { indexAtTime } from '../../sync/timeline.ts';
import { drawPanel, rgba, type DisplayDef } from './common.ts';

const MAX_POINTS = 1500;

export const route: DisplayDef = {
  id: 'route',
  label: 'Route path',
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
    const px = (lon: number) => left + (lon - minLon) * squash * scale;
    const py = (lat: number) => top + (maxLat - lat) * scale;

    const step = Math.max(1, Math.floor((to - from) / MAX_POINTS));
    const line = (a: number, b: number, color: string, width: number) => {
      if (b <= a) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px(track.lon[a]), py(track.lat[a]));
      for (let i = a + step; i < b; i += step) ctx.lineTo(px(track.lon[i]), py(track.lat[i]));
      ctx.lineTo(px(track.lon[b]), py(track.lat[b]));
      ctx.stroke();
    };

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(style.cornerRadius * unit, box.h / 2));
    ctx.clip();
    const now = Math.min(to, indexAtTime(track.t, time));
    if (style.showRemaining) line(from, to, rgba(style.trackColor, Math.max(style.trackOpacity, 0.45)), style.routeWidth * 0.8 * unit);
    line(from, now, style.color, style.routeWidth * unit);

    const position = { lat: track.lat[now], lon: track.lon[now] };
    ctx.fillStyle = style.textColor;
    ctx.strokeStyle = style.color2;
    ctx.lineWidth = 3 * unit;
    ctx.beginPath();
    ctx.arc(px(position.lon), py(position.lat), style.dotSize * unit, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },
};
