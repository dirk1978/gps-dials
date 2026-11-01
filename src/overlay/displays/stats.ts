import { indexAtTime } from '../../sync/timeline.ts';
import { formatValue, unitDef } from '../channels.ts';
import { drawPanel, drawText, setFont, spacedLabel, type DisplayDef, type DrawEnv } from './common.ts';

const SAMPLES = 200;
/** Running figures for a whole ride, worked out once, as long rides have too many points to total each frame. */
const running = new WeakMap<object, { low: number[]; mean: number[]; high: number[] }>();

function runningFigures(values: (number | null)[]): { low: number[]; mean: number[]; high: number[] } {
  let figures = running.get(values);
  if (figures) return figures;
  let low = NaN;
  let high = NaN;
  let sum = 0;
  let count = 0;
  figures = { low: [], mean: [], high: [] };
  for (const v of values) {
    if (v != null) {
      low = Number.isNaN(low) ? v : Math.min(low, v);
      high = Number.isNaN(high) ? v : Math.max(high, v);
      sum += v;
      count++;
    }
    figures.low.push(low);
    figures.mean.push(count ? sum / count : NaN);
    figures.high.push(high);
  }
  running.set(values, figures);
  return figures;
}

/** Lowest, average and highest over the whole ride, up to now or to the end. */
function summariseRide(env: DrawEnv, values: (number | null)[]): [number, number, number] | null {
  const { t } = env.data.track;
  const figures = runningFigures(values);
  const i = env.style.statsSpan === 'ride' ? t.length - 1 : indexAtTime(t, env.time);
  const { convert } = unitDef(env.channel, env.style.unit);
  return Number.isNaN(figures.mean[i]) ? null : [convert(figures.low[i]), convert(figures.mean[i]), convert(figures.high[i])];
}

/** Lowest, average and highest, with a clip sampled evenly so every frame costs the same. */
function summarise(env: DrawEnv): [number, number, number] | null {
  const wholeRide = env.style.statsSpan === 'ride' || env.style.statsSpan === 'rideSoFar';
  const values = env.data.series[env.channel.id];
  if (wholeRide && values && !env.fromCamera) return summariseRide(env, values);
  const from = env.clipStart;
  const to = env.style.statsSpan === 'clip' || env.style.statsSpan === 'ride' ? env.clipEnd : Math.max(from, env.time);
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
