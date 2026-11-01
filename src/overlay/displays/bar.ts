import { autoRange, drawPanel, drawText, fraction, rgba, setFont, spacedLabel, valueColor, type DisplayDef } from './common.ts';

export const bar: DisplayDef = {
  id: 'bar',
  label: 'Bar',
  draw(env) {
    const { ctx, box, value, valueText, unitLabel } = env;
    const style = autoRange(env.style, env);
    drawPanel(env);
    const horizontal = style.orientation === 'horizontal';
    const textShare = style.showValue ? 0.3 : 0;
    const pad = Math.min(box.w, box.h) * 0.14;
    const track = horizontal
      ? { x: box.x + pad, y: box.y + box.h * 0.5 - (box.h * style.thickness * 3) / 2, w: box.w * (1 - textShare) - pad * 2, h: box.h * style.thickness * 3 }
      : { x: box.x + box.w * 0.5 - (box.w * style.thickness * 3) / 2, y: box.y + pad + box.h * textShare, w: box.w * style.thickness * 3, h: box.h * (1 - textShare) - pad * 2 };

    const radius = style.roundEnds ? Math.min(track.w, track.h) / 2 : 0;
    ctx.fillStyle = rgba(style.trackColor, style.trackOpacity);
    ctx.beginPath();
    ctx.roundRect(track.x, track.y, track.w, track.h, radius);
    ctx.fill();

    if (value != null) {
      const f = fraction(style, value);
      const gradient = horizontal
        ? ctx.createLinearGradient(track.x, 0, track.x + track.w, 0)
        : ctx.createLinearGradient(0, track.y + track.h, 0, track.y);
      gradient.addColorStop(0, valueColor(style, value));
      gradient.addColorStop(1, style.useZones ? valueColor(style, value) : style.color2);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      if (horizontal) ctx.roundRect(track.x, track.y, track.w * f, track.h, radius);
      else ctx.roundRect(track.x, track.y + track.h * (1 - f), track.w, track.h * f, radius);
      ctx.fill();
    }

    if (style.showValue) {
      const size = (horizontal ? box.h * 0.46 : box.w * 0.34) * style.valueSize;
      setFont(ctx, style, size);
      ctx.fillStyle = style.textColor;
      ctx.textAlign = horizontal ? 'right' : 'center';
      ctx.textBaseline = 'middle';
      const text = `${valueText}${style.showUnits && unitLabel ? ` ${unitLabel}` : ''}`;
      if (horizontal) drawText(env, text, box.x + box.w - pad, box.y + box.h * (style.showLabel ? 0.42 : 0.5));
      else drawText(env, text, box.x + box.w / 2, box.y + box.h * 0.13);
    }
    if (style.showLabel) {
      const size = (horizontal ? box.h * 0.17 : box.w * 0.13) * style.labelSize;
      const x = horizontal ? box.x + box.w - pad : box.x + box.w / 2;
      spacedLabel(env, style.labelText, horizontal ? x - box.w * 0.1 : x, box.y + box.h * (horizontal ? 0.8 : 0.24), size, style.mutedColor);
    }
  },
};
