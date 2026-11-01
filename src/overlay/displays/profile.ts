import { indexAtTime } from '../../sync/timeline.ts';
import { drawPanel, rgba, type DisplayDef } from './common.ts';

const MIN_SPAN_M = 400;

/** A value against distance: shows the road ahead as well as behind, so it suits elevation best. */
export const profile: DisplayDef = {
  id: 'profile',
  label: 'Profile along the road',
  draw(env) {
    const { ctx, box, style, data, clipStart, clipEnd, time, unit, channel } = env;
    const { track, distance } = data;
    const series = data.series[channel.id];
    drawPanel(env);
    if (!series) return;

    // A clip spans a tiny part of a long ride, so show the road around it unless the whole ride is wanted.
    const first = style.fullRide ? 0 : indexAtTime(track.t, clipStart);
    const last = style.fullRide ? track.t.length - 1 : indexAtTime(track.t, clipEnd);
    const middle = (distance[first] + distance[last]) / 2;
    const span = style.fullRide ? distance[last] : Math.max(MIN_SPAN_M, (distance[last] - distance[first]) * 1.2);
    const from = middle - span / 2;
    const to = middle + span / 2;

    const points: [number, number][] = [];
    let low = Infinity;
    let high = -Infinity;
    const stride = Math.max(1, Math.floor(track.t.length / 2000));
    for (let i = 0; i < track.t.length; i += stride) {
      const v = series[i];
      if (v == null || distance[i] < from || distance[i] > to) continue;
      points.push([distance[i], v]);
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
    if (points.length < 2) return;

    const inner = { x: box.x + 14 * unit, y: box.y + 8 * unit, w: box.w - 28 * unit, h: box.h - 16 * unit };
    const range = Math.max(10, high - low);
    const px = (d: number) => inner.x + ((d - from) / (to - from)) * inner.w;
    const py = (v: number) => inner.y + inner.h * 0.9 - ((v - low) / range) * inner.h * 0.8;
    const base = inner.y + inner.h;
    const now = data.distance[indexAtTime(track.t, time)];

    const shape = (limit: number) => {
      ctx.beginPath();
      ctx.moveTo(px(points[0][0]), base);
      for (const [d, v] of points) {
        if (d > limit) break;
        ctx.lineTo(px(d), py(v));
      }
      ctx.lineTo(px(Math.min(limit, points[points.length - 1][0])), base);
      ctx.closePath();
      ctx.fill();
    };

    ctx.save();
    ctx.shadowColor = 'transparent';
    if (style.showRemaining) {
      ctx.fillStyle = rgba(style.trackColor, Math.max(style.trackOpacity, 0.18));
      shape(Infinity);
    }
    const gradient = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
    gradient.addColorStop(0, style.color);
    gradient.addColorStop(1, style.color2);
    ctx.fillStyle = gradient;
    shape(now);
    ctx.restore();

    if (style.showMarker) {
      ctx.strokeStyle = style.textColor;
      ctx.lineWidth = 2.5 * unit;
      ctx.beginPath();
      ctx.moveTo(px(now), inner.y);
      ctx.lineTo(px(now), base);
      ctx.stroke();
    }
  },
};
