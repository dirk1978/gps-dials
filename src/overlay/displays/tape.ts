import { formatValue } from '../channels.ts';
import { drawPanel, drawText, rgba, setFont, spacedLabel, valueColor, type DisplayDef } from './common.ts';

const MINORS_PER_STEP = 5;

/** A scale sliding past a fixed pointer, like the heading or altitude tape on an aircraft display. */
export const tape: DisplayDef = {
  id: 'tape',
  label: 'Sliding tape',
  draw(env) {
    const { ctx, box, style, channel, value, valueText, unitLabel, unit } = env;
    drawPanel(env);
    const vertical = style.orientation === 'vertical';
    const wraps = channel.format === 'compass';
    const centre = value ?? style.min;
    const span = style.step * style.tapeSteps;
    const length = vertical ? box.h : box.w;
    const across = vertical ? box.w : box.h;
    const perUnit = length / span;
    const minor = style.step / MINORS_PER_STEP;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const tick = across * style.tickLength * 2.5;
    const size = Math.min(across * 0.3, 30 * unit) * style.scaleSize;

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    setFont(ctx, style, size);
    ctx.textBaseline = 'middle';
    ctx.textAlign = vertical ? 'left' : 'center';
    ctx.strokeStyle = ctx.fillStyle = style.tickColor;
    for (let n = Math.ceil((centre - span / 2) / minor); n * minor <= centre + span / 2; n++) {
      const v = n * minor;
      if (!wraps && (v < style.min - 1e-6 || v > style.max + 1e-6)) continue;
      const major = n % MINORS_PER_STEP === 0;
      const offset = (v - centre) * perUnit;
      const x = vertical ? box.x : cx + offset;
      const y = vertical ? cy - offset : box.y;
      const reach = tick * (major ? 1 : 0.55);
      ctx.lineWidth = Math.max(1, across * style.tickWidth * (major ? 0.5 : 0.3));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(vertical ? x + reach : x, vertical ? y : y + reach);
      ctx.stroke();
      if (major && style.showNumbers) {
        const text = wraps ? formatValue(channel, ((v % 360) + 360) % 360, 0) : String(Math.round(v * 100) / 100);
        drawText(env, text, vertical ? x + tick + size * 0.4 : x, vertical ? y : y + tick + size * 0.7);
      }
    }
    ctx.restore();

    // The fixed pointer, and the exact reading beside it.
    const color = valueColor(style, value);
    const point = across * 0.1;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(box.x + point * 1.4, cy);
      ctx.lineTo(box.x, cy - point);
      ctx.lineTo(box.x, cy + point);
    } else {
      ctx.moveTo(cx, box.y + point * 1.4);
      ctx.lineTo(cx - point, box.y);
      ctx.lineTo(cx + point, box.y);
    }
    ctx.closePath();
    ctx.fill();

    if (style.showValue) {
      const reading = `${valueText}${style.showUnits && unitLabel ? ` ${unitLabel}` : ''}`;
      const big = Math.min(across * 0.34, 44 * unit) * style.valueSize;
      setFont(ctx, style, big);
      const w = ctx.measureText(reading).width + big * 0.7;
      const h = big * 1.25;
      const x = vertical ? box.x + box.w - w - 4 * unit : cx - w / 2;
      const y = vertical ? cy - h / 2 : box.y + box.h - h - 3 * unit;
      ctx.fillStyle = rgba(style.panelColor, Math.max(0.85, style.panelOpacity));
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6 * unit);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawText(env, reading, x + w / 2, y + h / 2);
    }
    if (style.showLabel && !vertical) {
      spacedLabel({ ...env, style: { ...style, align: 'left' } }, style.labelText, box.x + 8 * unit, box.y + box.h - across * 0.14, across * 0.11 * style.labelSize, style.mutedColor);
    }
  },
};
