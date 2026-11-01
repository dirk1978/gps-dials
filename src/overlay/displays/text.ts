import { drawPanel, drawText, setFont, type DisplayDef } from './common.ts';

/** Free text, where {value}, {units} and {label} are filled in. */
export const text: DisplayDef = {
  id: 'text',
  label: 'Custom text',
  draw(env) {
    const { ctx, box, style, valueText, unitLabel } = env;
    drawPanel(env);
    const content = style.text
      .replaceAll('{value}', valueText)
      .replaceAll('{units}', unitLabel)
      .replaceAll('{label}', style.labelText);
    setFont(ctx, style, box.h * 0.66 * style.valueSize);
    ctx.fillStyle = style.textColor;
    ctx.textAlign = style.align;
    ctx.textBaseline = 'middle';
    const pad = box.w * 0.04;
    const x = style.align === 'left' ? box.x + pad : style.align === 'right' ? box.x + box.w - pad : box.x + box.w / 2;
    drawText(env, content, x, box.y + box.h / 2);
  },
};
