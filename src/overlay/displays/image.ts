import { drawPanel, drawText, fraction, setFont, type DisplayDef, type Ctx } from './common.ts';

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Fits a picture inside the widget without stretching it. */
function drawFitted(ctx: Ctx, image: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const iw = (image as HTMLImageElement).width;
  const ih = (image as HTMLImageElement).height;
  const scale = Math.min(w / iw, h / ih);
  ctx.drawImage(image, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
}

/** A gauge from your own pictures: a dial face, and a needle pointing up that turns with the value. */
export const imageGauge: DisplayDef = {
  id: 'image',
  label: 'Your own image',
  draw(env) {
    const { ctx, box, style, value, valueText, tiles } = env;
    const face = style.imageDial ? tiles?.image(style.imageDial) : null;
    const needle = style.imageNeedle ? tiles?.image(style.imageNeedle) : null;
    if (face) drawFitted(ctx, face, box.x, box.y, box.w, box.h);
    if (needle) {
      const angle = style.startAngle + style.sweepAngle * fraction(style, value ?? style.min) * (style.reverse ? -1 : 1);
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
