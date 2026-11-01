import type { ClipSensors } from '../devices/types.ts';
import { channelDef, formatValue, readChannel, unitDef, type ChannelDef, type ChannelId, type UnitDef } from './channels.ts';
import type { OverlayData } from './data.ts';
import { displayDef } from './displays/index.ts';
import type { Ctx, DrawEnv, TileSource } from './displays/common.ts';
import { resolveStyle, type Style, type Template, type Widget } from './template.ts';

export type { Ctx } from './displays/common.ts';
export const DISPLAY_FONT = '"Barlow Condensed"';
const RIDE_TOTALS: ChannelId[] = ['distance', 'remaining', 'ascent'];
const RIDE_SCALE_STEPS = 5;

export interface FrameContext {
  width: number;
  height: number;
  template: Template;
  data: OverlayData;
  /** Clip start and end on the track's clock. */
  clipStart: number;
  clipEnd: number;
  tiles?: TileSource;
  mapToken?: string;
  /** What the camera recorded about this clip, if anything. */
  sensors?: ClipSensors | null;
}

/** Data that builds over a ride scales to that ride, so a dial for a 30 mile ride isn't marked to 100. */
function fitToRide(style: Style, data: OverlayData, channel: ChannelDef, unit: UnitDef): void {
  const values = RIDE_TOTALS.includes(channel.id) ? data.series[channel.id] : null;
  if (!values) return;
  const total = unit.convert(Math.max(values[0] ?? 0, values[values.length - 1] ?? 0));
  if (total <= 0) return;
  const rough = total / RIDE_SCALE_STEPS;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find(n => n * power >= rough) ?? 10) * power;
  style.step = step;
  style.max = Math.ceil(total / step) * step;
}

function drawWidget(ctx: Ctx, widget: Widget, frame: FrameContext, time: number): void {
  const { width, height, template, data, clipStart, clipEnd, sensors } = frame;
  const unit = width / 1920;
  const style = resolveStyle(widget, template.theme, template.rider);
  const channel = channelDef(widget.channel);
  const display = displayDef(widget.display);
  if (style.hideWhenNoData && !display.usesTrack && !data.available.has(widget.channel) && !sensors?.series[widget.channel]) return;
  const unitInfo = unitDef(channel, style.unit);
  const clip = { clipStart, rider: template.rider, sensors };
  if (widget.style.max == null) fitToRide(style, data, channel, unitInfo);
  const value = readChannel(data, channel, style.unit, time, clip, style.smoothing);

  const env: DrawEnv = {
    ctx,
    box: { x: widget.x * width, y: widget.y * height, w: widget.width * width, h: widget.height * height },
    widget,
    style,
    channel,
    data,
    value,
    valueText: formatValue(channel, value, style.decimals, style.showSign),
    // A compass point is already a whole answer, and "W°" isn't a heading.
    unitLabel: channel.format === 'compass' ? '' : unitInfo.label,
    time,
    clipStart,
    clipEnd,
    unit,
    upColor: template.theme.up,
    downColor: template.theme.down,
    tiles: frame.tiles,
    mapToken: frame.mapToken ?? '',
    valueAt: t => readChannel(data, channel, style.unit, t, clip, style.smoothing),
    fromCamera: sensors?.series[widget.channel] != null,
    read: id => readChannel(data, channelDef(id), undefined, time, clip),
  };

  ctx.save();
  ctx.globalAlpha = style.opacity;
  if (style.shadow > 0) {
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadow * unit;
    ctx.shadowOffsetY = unit;
  }
  display.draw(env);
  ctx.restore();
}

/** Draws every visible widget for one moment. The canvas stays transparent everywhere else. */
export function drawFrame(ctx: Ctx, frame: FrameContext, time: number): void {
  for (const widget of frame.template.widgets) {
    if (!widget.hidden) drawWidget(ctx, widget, frame, time);
  }
}
