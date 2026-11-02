import { formatValue, unitDef, type ChannelDef } from '../channels.ts';
import { fastestLap, lapAverage, type Lap } from '../data.ts';
import { drawPanel, drawText, rgba, setFont, spacedLabel, type DisplayDef, type DrawEnv } from './common.ts';

const MIN_ROW = 26;
const LARGEST_TEXT = 34;
const LARGEST_ROW = 56;
/** With one lap much like another, bars start part way up so the differences show. */
const BAR_FLOOR = 0.7;

const isLapData = (channel: ChannelDef) => channel.id.toLowerCase().includes('lap');

/** The laps to show, and which of them is running now. */
function lapsInView(env: DrawEnv): { laps: Lap[]; current: number } {
  const all = env.data.laps;
  const found = all.findIndex(lap => env.time >= lap.start && env.time < lap.end);
  const current = found >= 0 ? found : env.time < (all[0]?.start ?? 0) ? -1 : all.length - 1;
  return { laps: env.style.lapSpan === 'soFar' ? all.slice(0, current + 1) : all, current };
}

/** The lap's figure for this widget's data, or null where an average means nothing. */
function lapFigure(env: DrawEnv, lap: Lap): number | null {
  if (isLapData(env.channel)) return null;
  const value = lapAverage(env.data, env.channel.id, lap);
  return value == null ? null : unitDef(env.channel, env.style.unit).convert(value);
}

function noLaps(env: DrawEnv): void {
  const { ctx, box, style } = env;
  setFont(ctx, style, box.h * 0.14);
  ctx.fillStyle = style.mutedColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawText(env, 'No laps', box.x + box.w / 2, box.y + box.h / 2);
}

function title(env: DrawEnv, text: string, x: number, y: number, size: number): void {
  spacedLabel({ ...env, style: { ...env.style, align: 'center' } }, text, x, y, size * env.style.labelSize, env.style.mutedColor);
}

/** Every lap in a table, following the one running now if they don't all fit. */
export const lapTable: DisplayDef = {
  id: 'laps',
  label: 'Lap table',
  usesTrack: true,
  prefers: 'speed',
  draw(env) {
    const { ctx, box, style, channel, unitLabel, unit, data } = env;
    if (data.laps.length === 0 && style.hideWhenNoData) return;
    if (data.laps.length === 0) {
      drawPanel(env);
      noLaps(env);
      return;
    }
    const { laps, current } = lapsInView(env);
    const fastest = fastestLap(data.laps, style.lapSpan === 'soFar' ? current : data.laps.length);
    const hasFigure = laps.some(lap => lapFigure(env, lap) != null);
    const pad = 10 * unit;
    const inner = box.w - pad * 2;
    const heading = (style.showLabel ? 1 : 0) * Math.min(box.h * 0.11, 30 * unit);
    const columns = Math.min(box.h * 0.08, 22 * unit);
    const top = box.y + pad + heading + columns;
    const space = box.h - pad * 2 - heading - columns;
    const fits = Math.max(1, Math.floor(space / (MIN_ROW * unit)));
    const shown = Math.min(fits, Math.max(1, laps.length));
    const row = Math.min(space / shown, LARGEST_ROW * unit);
    // The panel fits the laps, so a short activity doesn't leave a big empty box.
    drawPanel({ ...env, box: { ...box, h: pad * 2 + heading + columns + row * shown } });
    const first = Math.min(Math.max(0, current - Math.floor(shown / 2)), Math.max(0, laps.length - shown));

    if (style.showLabel) title(env, style.labelText === channel.label ? 'Laps' : style.labelText, box.x + box.w / 2, box.y + pad + heading * 0.4, heading * 0.62);
    const xLap = box.x + pad + inner * 0.1;
    const xTime = box.x + pad + inner * (hasFigure ? 0.44 : 0.72);
    const xFigure = box.x + pad + inner * 0.8;
    const y = box.y + pad + heading + columns * 0.5;
    title(env, 'Lap', xLap, y, columns * 0.62);
    title(env, 'Time', xTime, y, columns * 0.62);
    if (hasFigure) title(env, `${channel.label}${style.showUnits && unitLabel ? ` ${unitLabel}` : ''}`.slice(0, 16), xFigure, y, columns * 0.62);

    const size = Math.min(row * 0.66, LARGEST_TEXT * unit) * style.valueSize;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    laps.slice(first, first + shown).forEach((lap, i) => {
      const middle = top + row * (i + 0.5);
      const now = first + i === current;
      if (now) {
        ctx.fillStyle = rgba(style.color, 0.3);
        ctx.fillRect(box.x + pad / 2, middle - row / 2, box.w - pad, row);
      }
      const running = style.lapSpan === 'soFar' && now;
      const figure = running ? null : lapFigure(env, lap);
      setFont(ctx, style, size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = style.textColor;
      drawText(env, String(lap.number), xLap, middle);
      ctx.fillStyle = lap === fastest ? env.upColor : style.textColor;
      drawText(env, formatValue({ ...channel, format: 'duration' }, running ? env.time - lap.start : lap.time, 0), xTime, middle);
      ctx.fillStyle = style.textColor;
      if (hasFigure) drawText(env, formatValue(channel, figure, style.decimals), xFigure, middle);
    });
  },
};

/** A bar for each lap, so the shape of the whole activity shows at a glance. */
export const lapBars: DisplayDef = {
  id: 'lapbars',
  label: 'Lap bars',
  usesTrack: true,
  prefers: 'lapTime',
  draw(env) {
    const { ctx, box, style, channel, unit, data } = env;
    if (data.laps.length === 0 && style.hideWhenNoData) return;
    drawPanel(env);
    if (data.laps.length === 0) {
      noLaps(env);
      return;
    }
    const { laps, current } = lapsInView(env);
    const fastest = fastestLap(data.laps, style.lapSpan === 'soFar' ? current : data.laps.length);
    const pad = 10 * unit;
    const heading = style.showLabel ? box.h * 0.16 : 0;
    const figures = laps.map(lap => lapFigure(env, lap) ?? lap.time);
    // A short lap at the end would otherwise flatten all the others.
    const usual = fastestLap(data.laps, data.laps.length)?.distance ?? 0;
    const fair = figures.filter((_, i) => laps[i].distance >= usual * 0.9);
    const high = Math.max(...fair);
    const least = Math.min(...fair);
    const low = high > least ? Math.max(least - (high - least), least * BAR_FLOOR) : least * BAR_FLOOR;
    const across = box.w - pad * 2;
    const slot = across / Math.max(1, data.laps.length);
    const numbers = slot >= 18 * unit;
    const foot = numbers ? box.h * 0.13 : 0;
    const bottom = box.y + box.h - pad - foot;
    const tall = bottom - (box.y + pad + heading);
    if (style.showLabel) {
      const shownAs = isLapData(channel) ? { ...channel, format: 'duration' as const } : channel;
      const reading = laps[current] ? `  ${formatValue(shownAs, figures[current], style.decimals)}` : '';
      title(env, `${style.labelText === channel.label ? 'Laps' : style.labelText}${reading}`, box.x + box.w / 2, box.y + pad + heading * 0.4, heading * 0.5);
    }
    laps.forEach((lap, i) => {
      const height = Math.min(tall, Math.max(unit * 3, (tall * (figures[i] - low)) / Math.max(1e-9, high - low)));
      const x = box.x + pad + slot * i;
      ctx.fillStyle = i === current ? style.color : lap === fastest ? env.upColor : rgba(style.textColor, i < current ? 0.6 : 0.3);
      ctx.fillRect(x + slot * 0.12, bottom - height, slot * 0.76, height);
      if (numbers) {
        setFont(ctx, style, Math.min(foot * 0.8, slot * 0.55), false);
        ctx.fillStyle = style.mutedColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawText(env, String(lap.number), x + slot / 2, bottom + foot * 0.55);
      }
    });
  },
};
