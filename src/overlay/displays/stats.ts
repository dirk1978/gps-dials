import { formatValue } from '../channels.ts';
import { drawPanel, drawText, setFont, spacedLabel, type DisplayDef, type DrawEnv } from './common.ts';

const SAMPLES = 200;

/** Lowest, average and highest over the clip, sampled evenly so every frame costs the same. */
function summarise(env: DrawEnv): [number, number, number] | null {
  const from = env.clipStart;
  const to = env.style.statsSpan === 'soFar' ? Math.max(from, env.time) : env.clipEnd;
  let low = Infinity;
  let high = -Infinity;
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const v = env.valueAt(from + ((to - from) * i) / SAMPLES);
    if (v == null) continue;
    low = Math.min(low, v);
    high = Math.max(high, v);
    sum += v;
    count++;
  }
  return count ? [low, sum / count, high] : null;
}

const HEADINGS = ['Min', 'Avg', 'Max'];

/** Lowest, average and highest side by side. */
export const stats: DisplayDef = {
  id: 'stats',
  label: 'Min, average, max',
  draw(env) {
    const { ctx, box, style, channel, unitLabel, unit } = env;
    drawPanel(env);
    const pad = 10 * unit;
    const label = style.showLabel ? (box.h - pad * 2) * 0.26 : 0;
    const summary = summarise(env);
    const column = (box.w - pad * 2) / 3;
    const top = box.y + pad + label;
    const height = box.h - pad * 2 - label;
    if (style.showLabel) {
      const text = `${style.labelText}${style.showUnits && unitLabel ? ` (${unitLabel})` : ''}`;
      spacedLabel(env, text, box.x + box.w / 2, box.y + pad + label * 0.4, label * 0.6 * style.labelSize, style.mutedColor);
    }
    HEADINGS.forEach((heading, i) => {
      const x = box.x + pad + column * (i + 0.5);
      setFont(ctx, style, height * 0.56 * style.valueSize);
      ctx.fillStyle = style.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawText(env, formatValue(channel, summary?.[i] ?? null, style.decimals), x, top + height * 0.36);
      spacedLabel({ ...env, style: { ...style, align: 'center' } }, heading, x, top + height * 0.84, height * 0.2 * style.labelSize, style.mutedColor);
    });
  },
};
