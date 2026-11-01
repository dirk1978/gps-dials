import type { TrackColumns } from '../../sync/timeline.ts';
import { rgba, type Ctx, type DrawEnv } from './common.ts';

type Project = (i: number) => [number, number];

/**
 * The points worth drawing, chosen by how far apart they land on screen. Keeping a fixed
 * share of the track looked fine zoomed out, but cut straight across bends zoomed in.
 */
export function visiblePoints(project: Project, from: number, to: number, minPixels: number): [number, number][] {
  const points: [number, number][] = [project(from)];
  let [lastX, lastY] = points[0];
  for (let i = from + 1; i < to; i++) {
    const point = project(i);
    if (Math.abs(point[0] - lastX) + Math.abs(point[1] - lastY) < minPixels) continue;
    points.push(point);
    [lastX, lastY] = point;
  }
  if (to > from) points.push(project(to));
  return points;
}

function strokeLine(ctx: Ctx, project: Project, from: number, to: number, minPixels: number, color: string, width: number, end?: [number, number]): void {
  if ((to <= from && !end) || width <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const [first, ...rest] = visiblePoints(project, from, to, minPixels);
  ctx.moveTo(...first);
  for (const point of rest) ctx.lineTo(...point);
  if (end) ctx.lineTo(...end);
  ctx.stroke();
}

/**
 * The track, split into the part ridden and the part to come, each with an optional
 * outline. `head` is the exact current position, so the ridden line reaches the marker
 * even when recorded points are many seconds apart.
 */
export function drawRoute(env: DrawEnv, project: Project, from: number, to: number, now: number, head: [number, number]): void {
  const { ctx, style, unit } = env;
  const minPixels = unit;
  const width = style.routeWidth * unit;
  const outline = style.routeOutlineWidth * 2 * unit;
  const ridden = Math.min(to, now);

  if (outline > 0) {
    if (style.showRemaining) strokeLine(ctx, project, from, to, minPixels, style.routeOutlineColor, width + outline);
    else strokeLine(ctx, project, from, ridden, minPixels, style.routeOutlineColor, width + outline, head);
  }
  // Nearly solid, or the dark outline beneath it shows through and the line reads as black.
  if (style.showRemaining) strokeLine(ctx, project, from, to, minPixels, rgba(style.trackColor, Math.max(style.trackOpacity, 0.92)), width);
  strokeLine(ctx, project, from, ridden, minPixels, style.color, width, head);
}

/** Your position, as a dot, ring or arrow. `angle` is the direction of travel on screen, in radians from up. */
export function drawMarker(env: DrawEnv, x: number, y: number, angle: number): void {
  const { ctx, style, unit } = env;
  const r = style.dotSize * unit;
  const fill = style.markerColor || style.textColor;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = fill;
  ctx.strokeStyle = style.color2;
  ctx.lineWidth = 3 * unit;
  if (style.markerStyle === 'arrow') {
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.7);
    ctx.lineTo(r * 1.15, r * 1.2);
    ctx.lineTo(0, r * 0.55);
    ctx.lineTo(-r * 1.15, r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (style.markerStyle === 'ring') {
      ctx.strokeStyle = fill;
      ctx.lineWidth = r * 0.5;
    } else {
      ctx.fill();
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function trackHeading(track: TrackColumns, index: number): number {
  const a = Math.max(0, index - 3);
  const b = Math.min(track.t.length - 1, index + 3);
  const midLat = (track.lat[index] * Math.PI) / 180;
  return Math.atan2((track.lon[b] - track.lon[a]) * Math.cos(midLat), track.lat[b] - track.lat[a]);
}
