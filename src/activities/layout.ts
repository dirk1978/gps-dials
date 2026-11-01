import { channelDef, type ChannelId } from '../overlay/channels.ts';
import { THEMES, type DisplayId, type Style, type Swap, type Template, type Theme, type Widget } from '../overlay/template.ts';

/** Data, how to show it, left, top, width, height, any options, and what to show if the file lacks that data. */
export type Spec = [ChannelId, DisplayId, number, number, number, number, Partial<Style>?, Swap[]?];

/** Shared sizes, so built-in layouts line up with each other. */
export const DIAL_W = 0.15;
export const DIAL_H = 0.2667;
export const MAP_W = 0.2;
export const MAP_H = 0.3556;
export const LEFT = 0.012;
export const RIGHT_DIAL = 0.838;
export const BOTTOM_DIAL = 0.71;
export const COUNTER_H = 0.12;
export const STRIP_Y = 0.865;
export const STRIP_H = 0.11;

/** Close enough to see the map travel: at 14 a whole ride's clip moved it by barely 2 pixels a second. */
export const FOLLOW: Partial<Style> = { mapMode: 'follow', mapZoom: 16.5 };
export const SIGNED: Partial<Style> = { showSign: true };

export function layout(name: string, specs: Spec[], theme: Theme = THEMES[0]): Template {
  const seen = new Map<string, number>();
  const widgets: Widget[] = specs.map(([channel, display, x, y, width, height, style, instead]) => {
    const base = `${channel}-${display}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const widget: Widget = { id: n > 1 ? `${base}-${n}` : base, name: widgetName(channel, display), channel, display, x, y, width, height, style: style ?? {} };
    return instead ? { ...widget, instead } : widget;
  });
  return { version: 2, name, theme, widgets };
}

function widgetName(channel: ChannelId, display: DisplayId): string {
  return display === 'map' ? 'Map' : display === 'route' ? 'Route' : display === 'profile' ? 'Elevation' : channelDef(channel).label;
}

/** A widget showing the best thing it can from what the file has, keeping its place in the layout. */
export function bestForData(widget: Widget, available: Set<ChannelId>): Widget {
  const { instead, ...plain } = widget;
  if (!instead || available.has(widget.channel)) return plain;
  const swap = instead.find(s => available.has(s.channel));
  if (!swap) return plain;
  return { ...plain, id: `${swap.channel}-${swap.display}`, name: widgetName(swap.channel, swap.display), channel: swap.channel, display: swap.display, style: swap.style ?? {} };
}
