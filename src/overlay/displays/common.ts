import type { ChannelDef, ChannelId } from '../channels.ts';
import type { OverlayData } from '../data.ts';
import type { Style, Widget } from '../template.ts';

export type Ctx = CanvasRenderingContext2D;

export interface TileSource {
  image(url: string): CanvasImageSource | null;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Everything a display needs to draw itself for one moment. */
export interface DrawEnv {
  ctx: Ctx;
  box: Box;
  widget: Widget;
  style: Style;
  channel: ChannelDef;
  data: OverlayData;
  /** The value in the widget's unit, or null where there is no data. */
  value: number | null;
  /** The value as text. */
  valueText: string;
  unitLabel: string;
  time: number;
  clipStart: number;
  clipEnd: number;
  /** One pixel of a 1920 wide frame, so sizes hold at any resolution. */
  unit: number;
  upColor: string;
  downColor: string;
  /** Map images ready to draw. Missing ones are left blank, and the track still shows. */
  tiles?: TileSource;
  mapToken: string;
  /** A channel's value at another time, in the widget's unit, for graphs. */
  valueAt(time: number): number | null;
  /** Whether the camera, rather than the track, supplies this data. */
  fromCamera: boolean;
  /** Another channel's value right now, in its first unit, wherever it was recorded. */
  read(channel: ChannelId): number | null;
}

export interface DisplayDef {
  id: string;
  label: string;
  /** Draws a whole track rather than one number, so it ignores the channel's value. */
  usesTrack?: boolean;
  /** The data it was made for, chosen for you when you pick this display. */
  prefers?: ChannelId;
  draw(env: DrawEnv): void;
}

export function setFont(ctx: Ctx, style: Style, size: number, emphasis = true): void {
  const weight = emphasis && style.bold ? 700 : 600;
  ctx.font = `${style.italic && emphasis ? 'italic ' : ''}${weight} ${Math.max(1, Math.round(size))}px "${style.font}", Arial, sans-serif`;
}

/** Text with the optional outline, so it stays readable on any footage. */
export function drawText(env: DrawEnv, text: string, x: number, y: number): void {
  const { ctx, style, unit } = env;
  if (style.outlineWidth > 0) {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = style.outlineColor;
    ctx.lineWidth = style.outlineWidth * unit;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.restore();
  }
  ctx.fillText(text, x, y);
}

/** Canvases differ on letter spacing, so small capitals are placed one letter at a time. */
export function spacedLabel(env: DrawEnv, text: string, x: number, y: number, size: number, color: string): void {
  const { ctx, style } = env;
  setFont(ctx, style, size, false);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  const advance = size * 0.62;
  const label = text.toUpperCase();
  const width = (label.length - 1) * advance;
  const start = style.align === 'left' ? x + advance / 2 : style.align === 'right' ? x - width - advance / 2 : x - width / 2;
  ctx.textAlign = 'center';
  [...label].forEach((letter, i) => drawText(env, letter, start + i * advance, y));
}

export function rgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function drawPanel(env: DrawEnv): void {
  const { ctx, box, style, unit } = env;
  if (style.panelOpacity <= 0 && style.borderWidth <= 0) return;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(style.cornerRadius * unit, box.h / 2, box.w / 2));
  if (style.panelOpacity > 0) {
    ctx.fillStyle = rgba(style.panelColor, style.panelOpacity);
    ctx.fill();
  }
  if (style.panelOpacity > 0 && style.borderWidth > 0) {
    ctx.strokeStyle = rgba(style.borderColor, 0.14);
    ctx.lineWidth = style.borderWidth * unit;
    ctx.stroke();
  }
}

/** The colour for a value: its zone if zones are on, otherwise the main colour. */
export function valueColor(style: Style, value: number | null): string {
  if (!style.useZones || value == null || style.zones.length === 0) return style.color;
  return (style.zones.find(z => value < z.upTo) ?? style.zones[style.zones.length - 1]).color;
}

export function fraction(style: Style, value: number): number {
  const range = style.max - style.min;
  return range === 0 ? 0 : Math.min(1, Math.max(0, (value - style.min) / range));
}

/** Round figures for an automatic scale around the data this clip actually shows. */
export function autoRange(style: Style, env: Pick<DrawEnv, 'valueAt' | 'clipStart' | 'clipEnd'>): Style {
  if (!style.autoRange) return style;
  let low = Infinity;
  let high = -Infinity;
  const step = Math.max(1, (env.clipEnd - env.clipStart) / 200);
  for (let t = env.clipStart; t <= env.clipEnd; t += step) {
    const v = env.valueAt(t);
    if (v == null) continue;
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  if (!Number.isFinite(low)) return style;
  const margin = Math.max((high - low) * 0.1, style.step / 2);
  return {
    ...style,
    min: Math.floor((low - margin) / style.step) * style.step,
    max: Math.ceil((high + margin) / style.step) * style.step,
  };
}
