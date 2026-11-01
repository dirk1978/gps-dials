import { seriesValue } from '../data.ts';
import { drawText, fraction, rgba, setFont, spacedLabel, type DisplayDef } from './common.ts';

const ROLL_MARKS = [-60, -45, -30, 30, 45, 60];
const PITCH_MARKS = [-20, -10, 10, 20];
/** How far the picture moves for a degree of pitch, as a share of the radius. */
const PITCH_SCALE = 0.025;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** An artificial horizon: banks with the data, and rises and falls with the slope. */
export const horizon: DisplayDef = {
  id: 'horizon',
  label: 'Artificial horizon',
  prefers: 'leanAngle',
  draw(env) {
    const { ctx, box, style, data, time, value, valueText, unitLabel, unit } = env;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) / 2;
    const halfRange = (style.max - style.min) / 2;
    // Any data can drive it, spread across its scale. For a lean angle that is simply the angle.
    const roll = value == null ? 0 : (fraction(style, value) * 2 - 1) * halfRange;
    const slope = seriesValue(data, 'gradient', time) ?? 0;
    const pitch = (Math.atan(slope / 100) * 180) / Math.PI;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.shadowColor = 'transparent';
    ctx.translate(cx, cy);
    ctx.rotate(toRad(-roll));
    ctx.translate(0, pitch * PITCH_SCALE * R);
    ctx.fillStyle = style.skyColor;
    ctx.fillRect(-R * 2, -R * 4, R * 4, R * 4);
    ctx.fillStyle = style.groundColor;
    ctx.fillRect(-R * 2, 0, R * 4, R * 4);
    ctx.strokeStyle = style.tickColor;
    ctx.lineWidth = Math.max(1, R * 0.015);
    ctx.beginPath();
    ctx.moveTo(-R * 2, 0);
    ctx.lineTo(R * 2, 0);
    for (const mark of PITCH_MARKS) {
      const width = R * (Math.abs(mark) === 20 ? 0.3 : 0.18);
      const y = -mark * PITCH_SCALE * R;
      ctx.moveTo(-width, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = style.tickColor;
    ctx.fillStyle = style.tickColor;
    ctx.lineWidth = Math.max(1, R * 0.02);
    for (const mark of ROLL_MARKS) {
      const a = toRad(mark);
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * R * 0.86, -Math.cos(a) * R * 0.86);
      ctx.lineTo(Math.sin(a) * R * 0.97, -Math.cos(a) * R * 0.97);
      ctx.stroke();
    }
    // The pointer stays with the horizon, so it reads the bank against the fixed marks.
    ctx.rotate(toRad(-roll));
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.84);
    ctx.lineTo(R * 0.06, -R * 0.74);
    ctx.lineTo(-R * 0.06, -R * 0.74);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The fixed marker for the vehicle itself.
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = R * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.42, cy);
    ctx.lineTo(cx - R * 0.14, cy);
    ctx.lineTo(cx, cy + R * 0.09);
    ctx.lineTo(cx + R * 0.14, cy);
    ctx.lineTo(cx + R * 0.42, cy);
    ctx.stroke();

    if (style.borderWidth > 0) {
      ctx.strokeStyle = rgba(style.borderColor, 0.3);
      ctx.lineWidth = style.borderWidth * unit;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.showValue) {
      setFont(ctx, style, R * 0.26 * style.valueSize);
      ctx.fillStyle = style.textColor;
      drawText(env, `${valueText}${style.showUnits ? unitLabel : ''}`, cx, cy + R * 0.56);
    }
    if (style.showLabel) spacedLabel(env, style.labelText, cx, cy + R * 0.78, R * 0.085 * style.labelSize, style.textColor);
  },
};
