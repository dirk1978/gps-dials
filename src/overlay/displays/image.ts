import { drawPanel, drawText, fraction, setFont, type DisplayDef, type Ctx } from './common.ts';

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Fits a picture inside the widget without stretching it. */
function drawFitted(ctx: Ctx, image: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const iw = (image as HTMLImageElement).width;
  const ih = (image as HTMLImageElement).height;
  const scale = Math.min(w / iw, h / ih);
  ctx.drawImage(image, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
}

/** Your own pictures: a logo that stays put, one that fills or grows with the value, or a dial face with a turning needle. */
export const imageGauge: DisplayDef = {
  id: 'image',
  label: 'Your own image',
  draw(env) {
    const { ctx, box, style, value, valueText, tiles } = env;
    const face = style.imageDial ? tiles?.image(style.imageDial) : null;
    const needle = style.imageNeedle ? tiles?.image(style.imageNeedle) : null;
    const share = fraction(style, value ?? style.min);
    if (face && style.imageMode === 'fill') {
      // Reveals the picture from the left as the value climbs.
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w * share, box.h);
      ctx.clip();
      drawFitted(ctx, face, box.x, box.y, box.w, box.h);
      ctx.restore();
    } else if (face && style.imageMode === 'scale') {
      const w = box.w * share;
      const h = box.h * share;
      if (w > 0 && h > 0) drawFitted(ctx, face, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    } else if (face) {
      drawFitted(ctx, face, box.x, box.y, box.w, box.h);
    }
    if (needle) {
      const angle = style.startAngle + style.sweepAngle * share * (style.reverse ? -1 : 1);
      ctx.save();
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      // Angles start from the right, and the picture points up.
      ctx.rotate(toRad(angle + 90));
      drawFitted(ctx, needle, -box.w / 2, -box.h / 2, box.w, box.h);
      ctx.restore();
    }
    if (!face && !needle) drawPanel(env);
    if (style.showValue) {
      setFont(ctx, style, Math.min(box.w, box.h) * 0.2 * style.valueSize);
      ctx.fillStyle = style.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawText(env, face || needle ? valueText : 'Choose an image', box.x + box.w / 2, box.y + box.h * 0.75);
    }
  },
};
