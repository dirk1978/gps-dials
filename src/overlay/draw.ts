import type { ClipSensors } from '../devices/types.ts';
import { channelDef, formatValue, readChannel, unitDef } from './channels.ts';
import type { OverlayData } from './data.ts';
import { displayDef } from './displays/index.ts';
import type { Ctx, DrawEnv, TileSource } from './displays/common.ts';
import { resolveStyle, type Template, type Widget } from './template.ts';

export type { Ctx } from './displays/common.ts';
export const DISPLAY_FONT = '"Barlow Condensed"';

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

function drawWidget(ctx: Ctx, widget: Widget, frame: FrameContext, time: number): void {
  const { width, height, template, data, clipStart, clipEnd, sensors } = frame;
  const unit = width / 1920;
  const style = resolveStyle(widget, template.theme, template.rider);
  const channel = channelDef(widget.channel);
  const display = displayDef(widget.display);
  if (style.hideWhenNoData && !display.usesTrack && !data.available.has(widget.channel) && !sensors?.series[widget.channel]) return;
  const unitInfo = unitDef(channel, style.unit);
  const clip = { clipStart, rider: template.rider, sensors };
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
