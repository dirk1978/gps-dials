import { drawPanel, drawText, fraction, rgba, setFont, spacedLabel, valueColor, type DisplayDef } from './common.ts';

/** The widest the pointer swings each way from upright. */
const SWING = 75;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** A half circle with a pointer leaning from upright, for lean angle or anything centred on zero. */
export const tilt: DisplayDef = {
  id: 'tilt',
  label: 'Tilt indicator',
  prefers: 'leanAngle',
  draw(env) {
    const { ctx, box, style, value, valueText, unitLabel } = env;
    drawPanel(env);
    const cx = box.x + box.w / 2;
    const hub = box.y + box.h * 0.72;
    const R = Math.min(box.w * 0.44, box.h * 0.62);
    // Upright is straight up, so angles here are measured from the top.
    const angleOf = (v: number) => (fraction(style, v) * 2 - 1) * SWING;
    const arc = (from: number, to: number) => {
      ctx.beginPath();
      ctx.arc(cx, hub, R, toRad(from - 90), toRad(to - 90));
      ctx.stroke();
    };

    ctx.lineCap = 'butt';
    ctx.lineWidth = R * style.thickness;
    ctx.strokeStyle = rgba(style.trackColor, Math.max(style.trackOpacity, 0.16));
    arc(-SWING, SWING);
    const color = valueColor(style, value);
    const a = value == null ? 0 : angleOf(value);
    if (value != null) {
      ctx.strokeStyle = color;
      arc(Math.min(0, a), Math.max(0, a));
    }

    if (style.showTicks || style.showNumbers) {
      setFont(ctx, style, R * 0.17 * style.scaleSize);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = Math.ceil(style.min / style.step); i * style.step <= style.max + 1e-6; i++) {
        const v = i * style.step;
        const rad = toRad(angleOf(v));
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);
        const outer = R * (1 - style.thickness / 2);
        const inner = outer - R * style.tickLength;
        if (style.showTicks) {
          ctx.strokeStyle = style.tickColor;
          ctx.lineWidth = R * style.tickWidth;
          ctx.beginPath();
          ctx.moveTo(cx + sin * inner, hub - cos * inner);
          ctx.lineTo(cx + sin * outer, hub - cos * outer);
          ctx.stroke();
        }
        if (style.showNumbers) {
          ctx.fillStyle = style.tickColor;
          const place = inner - R * 0.13;
          drawText(env, String(Math.abs(Math.round(v * 100) / 100)), cx + sin * place, hub - cos * place);
        }
      }
    }

    const reach = R * style.needleLength;
    ctx.strokeStyle = style.needleColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = R * style.needleWidth;
    ctx.beginPath();
    ctx.moveTo(cx, hub);
    ctx.lineTo(cx + Math.sin(toRad(a)) * reach, hub - Math.cos(toRad(a)) * reach);
    ctx.stroke();
    ctx.fillStyle = style.needleColor;
    ctx.beginPath();
    ctx.arc(cx, hub, R * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const below = box.y + box.h - hub;
    if (style.showValue) {
      setFont(ctx, style, below * 0.52 * style.valueSize);
      ctx.fillStyle = color;
      drawText(env, `${value == null ? valueText : valueText.replace('-', '')}${style.showUnits ? unitLabel : ''}`, cx, hub + below * 0.4);
    }
    if (style.showLabel) spacedLabel(env, style.labelText, cx, hub + below * 0.82, below * 0.2 * style.labelSize, style.mutedColor);
  },
};
