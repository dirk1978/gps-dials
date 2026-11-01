import { drawPanel, drawText, rgba, setFont, spacedLabel, type DisplayDef } from './common.ts';

const PLAIN_BLOCKS = 5;

/** A row of blocks, one a zone, with the one you're in lit up. */
export const zones: DisplayDef = {
  id: 'zones',
  label: 'Zone blocks',
  draw(env) {
    const { ctx, box, style, value, valueText, unitLabel, unit } = env;
    drawPanel(env);
    const pad = 10 * unit;
    // Data without zones of its own is split evenly across its scale.
    const blocks = style.zones.length > 0
      ? style.zones
      : Array.from({ length: PLAIN_BLOCKS }, (_, i) => ({ upTo: style.min + ((style.max - style.min) * (i + 1)) / PLAIN_BLOCKS, color: style.color }));
    const found = value == null ? -1 : blocks.findIndex(z => value < z.upTo);
    const active = value == null ? -1 : found < 0 ? blocks.length - 1 : found;

    const headline = style.showValue || style.showLabel ? (box.h - pad * 2) * 0.5 : 0;
    const top = box.y + pad + headline;
    const height = box.h - pad * 2 - headline;
    const gap = 4 * unit;
    const width = (box.w - pad * 2 - gap * (blocks.length - 1)) / blocks.length;
    blocks.forEach((zone, i) => {
      const x = box.x + pad + i * (width + gap);
      ctx.fillStyle = i === active ? zone.color : rgba(zone.color, 0.28);
      ctx.beginPath();
      ctx.roundRect(x, top, width, height, 3 * unit);
      ctx.fill();
      setFont(ctx, style, height * 0.6 * style.scaleSize);
      ctx.fillStyle = i === active ? style.panelColor : style.mutedColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x + width / 2, top + height / 2);
    });

    const mid = box.y + pad + headline * 0.45;
    if (style.showValue) {
      setFont(ctx, style, headline * 0.85 * style.valueSize);
      ctx.fillStyle = style.textColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      drawText(env, `${valueText}${style.showUnits && unitLabel ? ` ${unitLabel}` : ''}`, box.x + box.w - pad, mid);
    }
    if (style.showLabel) {
      spacedLabel({ ...env, style: { ...style, align: 'left' } }, style.labelText, box.x + pad, mid, headline * 0.42 * style.labelSize, style.mutedColor);
    }
  },
};
