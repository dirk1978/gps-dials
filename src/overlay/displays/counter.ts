import { drawPanel, drawText, setFont, spacedLabel, valueColor, type DisplayDef } from './common.ts';

export const counter: DisplayDef = {
  id: 'counter',
  label: 'Number',
  draw(env) {
    const { ctx, box, style, value, valueText, unitLabel, widget } = env;
    drawPanel(env);
    const pad = box.w * 0.08;
    const x = style.align === 'left' ? box.x + pad : style.align === 'right' ? box.x + box.w - pad : box.x + box.w / 2;
    const hasLabel = style.showLabel;
    const size = box.h * (hasLabel ? 0.56 : 0.72) * style.valueSize;

    if (style.showValue) {
      const units = style.showUnits && unitLabel ? unitLabel : '';
      setFont(ctx, style, size);
      ctx.textAlign = style.align;
      ctx.textBaseline = 'middle';
      // Gradient and similar read better coloured by direction, unless a colour has been chosen.
      const signed = widget.channel === 'gradient' && value != null && !style.useZones && !widget.style.color;
      ctx.fillStyle = signed ? (value >= 0 ? env.upColor : env.downColor) : style.useZones ? valueColor(style, value) : widget.style.color ? style.color : style.textColor;
      const reading = `${valueText}${units && units.length <= 2 ? units : units ? ` ${units}` : ''}`;
      // Dates and coordinates run long, so they shrink to stay inside the panel.
      const width = ctx.measureText(reading).width;
      if (width > box.w - pad) setFont(ctx, style, size * ((box.w - pad) / width));
      drawText(env, reading, x, box.y + box.h * (hasLabel ? 0.4 : 0.5));
    }
    if (hasLabel) {
      // Narrow panels, such as in a vertical crop, need the label smaller to stay inside.
      const fits = (box.w - pad) / (style.labelText.length * 0.62);
      spacedLabel(env, style.labelText, x, box.y + box.h * 0.8, Math.min(box.h * 0.15 * style.labelSize, fits), style.mutedColor);
    }
  },
};
