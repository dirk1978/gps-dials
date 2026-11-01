import { GRAVITY } from '../channels.ts';
import { seriesValue } from '../data.ts';
import { drawText, rgba, setFont, spacedLabel, type DisplayDef, type DrawEnv } from './common.ts';

const TRAIL_POINTS = 40;

/** Where the forces at `time` sit, as fractions of the scope's radius, kept inside its rim. */
function forceAt(env: DrawEnv, time: number): [number, number] | null {
  const { data, style } = env;
  const side = seriesValue(data, 'accelLateral', time, style.smoothing);
  const ahead = seriesValue(data, 'accelForward', time, style.smoothing);
  if (side == null || ahead == null) return null;
  const x = side / GRAVITY / style.scopeRange;
  const y = ahead / GRAVITY / style.scopeRange;
  const reach = Math.hypot(x, y);
  return reach > 1 ? [x / reach, y / reach] : [x, y];
}

/** Cornering across and braking up and down, as a dot with a fading trail. */
export const scope: DisplayDef = {
  id: 'scope',
  label: 'G-force scope',
  prefers: 'gForce',
  draw(env) {
    const { ctx, box, style, time, valueText, unitLabel, unit } = env;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) / 2;
    const inner = R * 0.82;

    if (style.panelOpacity > 0) {
      ctx.fillStyle = rgba(style.panelColor, Math.min(1, style.panelOpacity + 0.06));
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(style.trackColor, Math.max(0.3, style.trackOpacity));
    ctx.lineWidth = unit;
    for (const ring of [0.5, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, inner * ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - inner, cy);
    ctx.lineTo(cx + inner, cy);
    ctx.moveTo(cx, cy - inner);
    ctx.lineTo(cx, cy + inner);
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = style.color;
    const alpha = ctx.globalAlpha;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const age = 1 - i / TRAIL_POINTS;
      const force = forceAt(env, time - age * style.trailSeconds);
      if (!force) continue;
      ctx.globalAlpha = alpha * (1 - age) * 0.55;
      ctx.beginPath();
      ctx.arc(cx + force[0] * inner, cy - force[1] * inner, R * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const now = forceAt(env, time);
    if (now) {
      ctx.fillStyle = style.color;
      ctx.strokeStyle = style.textColor;
      ctx.lineWidth = R * 0.02;
      ctx.beginPath();
      ctx.arc(cx + now[0] * inner, cy - now[1] * inner, R * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.showValue) {
      setFont(ctx, style, R * 0.22 * style.valueSize);
      ctx.fillStyle = style.textColor;
      drawText(env, `${valueText}${style.showUnits && unitLabel ? ` ${unitLabel}` : ''}`, cx, cy + R * 0.62);
    }
    if (style.showLabel) spacedLabel(env, style.labelText, cx, cy - R * 0.9 + R * 0.28, R * 0.09 * style.labelSize, style.mutedColor);
  },
};
