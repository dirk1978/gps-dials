import { autoRange, drawText, fraction, rgba, setFont, spacedLabel, valueColor, type DisplayDef, type DrawEnv } from './common.ts';

const ZONE_TRACK_OPACITY = 0.38;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

function drawGauge(env: DrawEnv, needle: boolean): void {
  const { ctx, box, value, valueText, unitLabel } = env;
  const style = autoRange(env.style, env);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const R = Math.min(box.w, box.h) / 2;
  const band = R * (1 - style.thickness * 0.5 - 0.08);
  const start = toRad(style.startAngle);
  const sweep = toRad(style.sweepAngle) * (style.reverse ? -1 : 1);
  const angleOf = (v: number) => start + sweep * fraction(style, v);

  if (style.panelOpacity > 0) {
    ctx.fillStyle = rgba(style.panelColor, Math.min(1, style.panelOpacity + 0.06));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    if (style.borderWidth > 0) {
      ctx.strokeStyle = rgba(style.borderColor, 0.16);
      ctx.lineWidth = style.borderWidth * env.unit;
      ctx.stroke();
    }
  }

  ctx.lineCap = style.roundEnds ? 'round' : 'butt';
  ctx.lineWidth = R * style.thickness;
  if (style.useZones && style.zones.length > 0) {
    // The whole scale shows its zones faintly, so you can see what's coming as well as where you are.
    let from = style.min;
    for (const zone of style.zones) {
      const to = Math.min(zone.upTo, style.max);
      if (to > from) {
        ctx.strokeStyle = rgba(zone.color, ZONE_TRACK_OPACITY);
        ctx.beginPath();
        ctx.arc(cx, cy, band, angleOf(from), angleOf(to), style.reverse);
        ctx.stroke();
        from = to;
      }
    }
  } else if (style.trackOpacity > 0) {
    ctx.strokeStyle = rgba(style.trackColor, style.trackOpacity);
    ctx.beginPath();
    ctx.arc(cx, cy, band, start, start + sweep, style.reverse);
    ctx.stroke();
  }
  const color = valueColor(style, value);
  if (value != null) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, band, start, angleOf(value), style.reverse);
    ctx.stroke();
  }

  if (style.showTicks || style.showNumbers) {
    setFont(ctx, style, R * 0.165 * style.scaleSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const outer = band - R * (style.thickness * 0.5 + 0.03);
    const inner = outer - R * style.tickLength;
    const minorTotal = style.minorTicks + 1;
    for (let v = style.min, i = 0; v <= style.max + 1e-6; v = style.min + (++i) * (style.step / minorTotal)) {
      const major = i % minorTotal === 0;
      const a = angleOf(v);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      if (style.showTicks) {
        ctx.strokeStyle = style.tickColor;
        ctx.lineCap = 'butt';
        ctx.lineWidth = R * style.tickWidth * (major ? 1 : 0.6);
        const from = major ? inner : outer - R * style.tickLength * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + cos * from, cy + sin * from);
        ctx.lineTo(cx + cos * outer, cy + sin * outer);
        ctx.stroke();
      }
      if (style.showNumbers && major) {
        ctx.fillStyle = style.tickColor;
        const place = inner - R * 0.12;
        drawText(env, String(Math.round(v * 100) / 100), cx + cos * place, cy + sin * place);
      }
    }
  }

  const hubY = style.showValue || style.showLabel ? cy - R * 0.16 : cy;
  if (needle && value != null) {
    const a = angleOf(value);
    ctx.lineCap = 'round';
    ctx.lineWidth = R * style.needleWidth;
    ctx.strokeStyle = style.needleColor;
    ctx.beginPath();
    ctx.moveTo(cx, hubY);
    ctx.lineTo(cx + Math.cos(a) * R * style.needleLength, cy + Math.sin(a) * R * style.needleLength);
    ctx.stroke();
  }
  if (needle && style.showHub) {
    ctx.fillStyle = style.needleColor;
    ctx.strokeStyle = rgba(style.panelColor, 1);
    ctx.lineWidth = R * 0.03;
    ctx.beginPath();
    ctx.arc(cx, hubY, R * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (style.showLabel) spacedLabel(env, style.labelText, cx, cy + R * 0.14, R * 0.115 * style.labelSize, style.mutedColor);
  ctx.textAlign = 'center';
  if (style.showValue) {
    setFont(ctx, style, R * 0.42 * style.valueSize);
    ctx.fillStyle = color;
    drawText(env, valueText, cx, cy + R * 0.44);
  }
  if (style.showUnits && unitLabel) {
    setFont(ctx, style, R * 0.13 * style.unitsSize, false);
    ctx.fillStyle = style.mutedColor;
    drawText(env, unitLabel, cx, cy + R * 0.74);
  }
}

export const dial: DisplayDef = { id: 'dial', label: 'Dial', draw: env => drawGauge(env, env.style.showNeedle) };
export const arc: DisplayDef = { id: 'arc', label: 'Arc (no needle)', draw: env => drawGauge(env, false) };
