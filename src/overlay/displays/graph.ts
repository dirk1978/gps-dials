import { autoRange, drawPanel, drawText, fraction, rgba, setFont, spacedLabel, type DisplayDef } from './common.ts';

const SAMPLES = 240;

/** A value over time: the last stretch up to now, with the current reading marked at the end. */
export const graph: DisplayDef = {
  id: 'graph',
  label: 'Graph over time',
  draw(env) {
    const { ctx, box, time, valueAt, valueText, unitLabel, unit } = env;
    const style = autoRange(env.style, env);
    drawPanel(env);
    const pad = 10 * unit;
    const headline = style.showValue || style.showLabel ? box.h * 0.26 : 0;
    const plot = { x: box.x + pad, y: box.y + pad + headline, w: box.w - pad * 2, h: box.h - pad * 2 - headline };

    const points: [number, number][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const v = valueAt(time - style.windowSeconds * (1 - i / SAMPLES));
      if (v == null) continue;
      points.push([plot.x + (i / SAMPLES) * plot.w, plot.y + plot.h * (1 - fraction(style, v))]);
    }

    if (points.length > 1) {
      const gradient = ctx.createLinearGradient(plot.x, 0, plot.x + plot.w, 0);
      gradient.addColorStop(0, style.color);
      gradient.addColorStop(1, style.color2);
      if (style.fillArea) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha *= 0.32;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0][0], plot.y + plot.h);
        for (const [x, y] of points) ctx.lineTo(x, y);
        ctx.lineTo(points[points.length - 1][0], plot.y + plot.h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = gradient;
      ctx.lineWidth = style.lineWidth * unit;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      if (style.showMarker) {
        const [x, y] = points[points.length - 1];
        ctx.fillStyle = style.textColor;
        ctx.beginPath();
        ctx.arc(x, y, style.dotSize * 0.7 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = rgba(style.trackColor, style.trackOpacity);
      ctx.lineWidth = unit;
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y + plot.h);
      ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
      ctx.stroke();
    }

    const reading = `${valueText}${style.showUnits && unitLabel ? ` ${unitLabel}` : ''}`;
    setFont(ctx, style, headline * 0.9 * style.valueSize);
    const readingWidth = style.showValue ? ctx.measureText(reading).width : 0;
    if (style.showValue) {
      ctx.fillStyle = style.textColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      drawText(env, reading, box.x + box.w - pad, box.y + headline * 0.62);
    }
    if (style.showLabel) {
      // A small graph has room for one or the other, and the reading matters more.
      const size = headline * 0.42 * style.labelSize;
      const labelWidth = style.labelText.length * size * 0.62;
      if (labelWidth + readingWidth + pad * 3 <= box.w) {
        spacedLabel({ ...env, style: { ...style, align: 'left' } }, style.labelText, box.x + pad, box.y + headline * 0.62, size, style.mutedColor);
      }
    }
  },
};
