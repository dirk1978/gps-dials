import { drawText, rgba, setFont, spacedLabel, type DisplayDef } from './common.ts';

const CARDINALS: [number, string][] = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** A heading as a compass. The card turns under a fixed marker, or a needle turns over a fixed card. */
export const compass: DisplayDef = {
  id: 'compass',
  label: 'Compass',
  prefers: 'heading',
  draw(env) {
    const { ctx, box, style, value, valueText } = env;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = Math.min(box.w, box.h) / 2;
    const heading = value ?? 0;
    const cardTurns = style.compassMode === 'card';

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

    // The card, drawn around its centre so it can turn as one piece.
    ctx.save();
    ctx.translate(cx, cy);
    if (cardTurns) ctx.rotate(toRad(-heading));

    if (style.showTicks) {
      ctx.strokeStyle = style.tickColor;
      ctx.lineCap = 'butt';
      for (let a = 0; a < 360; a += 10) {
        const major = a % 30 === 0;
        const rad = toRad(a);
        const outer = R * 0.93;
        const inner = outer - R * style.tickLength * (major ? 1 : 0.5);
        ctx.lineWidth = R * style.tickWidth * (major ? 1 : 0.6);
        ctx.beginPath();
        ctx.moveTo(Math.sin(rad) * inner, -Math.cos(rad) * inner);
        ctx.lineTo(Math.sin(rad) * outer, -Math.cos(rad) * outer);
        ctx.stroke();
      }
    }

    if (style.showNumbers) {
      setFont(ctx, style, R * 0.2 * style.scaleSize);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const place = R * (0.8 - style.tickLength);
      for (const [a, letter] of CARDINALS) {
        const rad = toRad(a);
        const x = Math.sin(rad) * place;
        const y = -Math.cos(rad) * place;
        ctx.save();
        ctx.translate(x, y);
        // Letters turn with the card, as on a real compass, so they point out from the centre.
        ctx.rotate(rad);
        ctx.fillStyle = a === 0 ? style.color : style.tickColor;
        drawText(env, letter, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();

    // Whichever part stays still shows which way you're facing.
    ctx.save();
    ctx.translate(cx, cy);
    if (!cardTurns) ctx.rotate(toRad(heading));
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.99);
    ctx.lineTo(R * 0.09, -R * 0.8);
    ctx.lineTo(-R * 0.09, -R * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.showValue) {
      setFont(ctx, style, R * 0.38 * style.valueSize);
      ctx.fillStyle = style.textColor;
      drawText(env, valueText, cx, cy - R * 0.06);
      if (value != null) {
        setFont(ctx, style, R * 0.16 * style.unitsSize, false);
        ctx.fillStyle = style.mutedColor;
        drawText(env, `${Math.round(value) % 360}°`, cx, cy + R * 0.2);
      }
    }
    if (style.showLabel) spacedLabel(env, style.labelText, cx, cy + R * 0.42, R * 0.1 * style.labelSize, style.mutedColor);
  },
};
