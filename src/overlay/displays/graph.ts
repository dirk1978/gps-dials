import { seriesValue, timeAtDistance } from '../data.ts';
import { autoRange, drawPanel, drawText, fraction, rgba, setFont, spacedLabel, valueColor, type DisplayDef } from './common.ts';

const SAMPLES = 240;

/** A value over the whole ride or the last stretch, against time or distance, with the current reading marked. */
export const graph: DisplayDef = {
  id: 'graph',
  label: 'Graph',
  draw(env) {
    const { ctx, box, time, valueAt, valueText, unitLabel, unit } = env;
    const { t } = env.data.track;
    const wholeRide = env.style.graphSpan === 'ride';
    const style = autoRange(env.style, wholeRide ? { ...env, clipStart: t[0], clipEnd: t[t.length - 1] } : env);
    drawPanel(env);
    const pad = 10 * unit;
    const headline = style.showValue || style.showLabel ? box.h * 0.26 : 0;
    const plot = { x: box.x + pad, y: box.y + pad + headline, w: box.w - pad * 2, h: box.h - pad * 2 - headline };

    const points: [number, number][] = [];
    const readings: number[] = [];
    const here = seriesValue(env.data, 'distance', time) ?? 0;
    const byDistance = style.graphAxis === 'distance';
    const total = env.data.distance[env.data.distance.length - 1];
    for (let i = 0; i <= SAMPLES; i++) {
      const along = i / SAMPLES;
      // The whole ride fills the width, with the line reaching only as far as now.
      const metres = wholeRide ? total * along : here - style.windowMetres * (1 - along);
      const moment = wholeRide ? t[0] + (t[t.length - 1] - t[0]) * along : time - style.windowSeconds * (1 - along);
      if (byDistance ? metres < 0 || metres > here + 1e-6 : moment > time + 1e-6) continue;
      const v = valueAt(byDistance ? timeAtDistance(env.data, metres) : moment);
      if (v == null) continue;
      points.push([plot.x + (i / SAMPLES) * plot.w, plot.y + plot.h * (1 - fraction(style, v))]);
      readings.push(v);
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
      ctx.lineWidth = style.lineWidth * unit;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (style.useZones && style.zones.length > 0) {
        for (let i = 1; i < points.length; i++) {
          ctx.strokeStyle = valueColor(style, readings[i]);
          ctx.beginPath();
          ctx.moveTo(...points[i - 1]);
          ctx.lineTo(...points[i]);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
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
