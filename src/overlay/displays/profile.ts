import { indexAtTime } from '../../sync/timeline.ts';
import { drawPanel, rgba, type DisplayDef } from './common.ts';

const MIN_SPAN_M = 400;
const SAMPLES = 200;

function indexAtDistance(distance: number[], d: number): number {
  let low = 0;
  let high = distance.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (distance[mid] <= d) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * The value at even steps along the road, using every recorded point. Skipping points
 * to save time turned short stretches into straight diagonal lines.
 */
export function sampleAlongRoad(distance: number[], series: (number | null)[], from: number, to: number, samples: number): ([number, number] | null)[] {
  const out: ([number, number] | null)[] = [];
  for (let k = 0; k <= samples; k++) {
    const d = from + ((to - from) * k) / samples;
    if (d < 0 || d > distance[distance.length - 1]) {
      out.push(null);
      continue;
    }
    const i = indexAtDistance(distance, d);
    const j = Math.min(i + 1, distance.length - 1);
    const a = series[i];
    const b = series[j];
    if (a == null || b == null) {
      out.push(a != null ? [d, a] : b != null ? [d, b] : null);
      continue;
    }
    const span = distance[j] - distance[i];
    out.push([d, a + (b - a) * (span > 0 ? (d - distance[i]) / span : 0)]);
  }
  return out;
}

/** Evens out altitude noise over about `metres` of road, with two passes so hills stay rounded. */
export function smoothAlongRoad(points: [number, number][], metres: number): [number, number][] {
  if (points.length < 3 || metres <= 0) return points;
  const stepM = (points[points.length - 1][0] - points[0][0]) / (points.length - 1);
  const reach = Math.round(metres / 2 / Math.max(stepM, 1e-6));
  if (reach < 1) return points;
  let current = points.map(p => p[1]);
  for (let pass = 0; pass < 2; pass++) {
    current = current.map((_, i) => {
      const from = Math.max(0, i - reach);
      const to = Math.min(current.length - 1, i + reach);
      let sum = 0;
      for (let k = from; k <= to; k++) sum += current[k];
      return sum / (to - from + 1);
    });
  }
  return points.map((p, i) => [p[0], current[i]]);
}

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

    const known = sampleAlongRoad(distance, series, from, to, SAMPLES).filter((p): p is [number, number] => p != null);
    if (known.length < 2) return;
    const points = smoothAlongRoad(known, style.profileSmoothing);
    const values = points.map(p => p[1]);
    const low = Math.min(...values);
    const high = Math.max(...values);

    const inner = { x: box.x + 14 * unit, y: box.y + 8 * unit, w: box.w - 28 * unit, h: box.h - 16 * unit };
    const range = Math.max(10, high - low);
    const px = (d: number) => inner.x + ((d - from) / (to - from)) * inner.w;
    const py = (v: number) => inner.y + inner.h * 0.9 - ((v - low) / range) * inner.h * 0.8;
    const base = inner.y + inner.h;
    const now = data.distance[indexAtTime(track.t, time)];

    const shape = (limit: number) => {
      ctx.beginPath();
      ctx.moveTo(px(points[0][0]), base);
      let edge = points[0][0];
      for (const [d, v] of points) {
        if (d > limit) break;
        ctx.lineTo(px(d), py(v));
        edge = d;
      }
      ctx.lineTo(px(edge), base);
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
