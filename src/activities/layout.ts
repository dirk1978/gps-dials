import { channelDef, type ChannelId } from '../overlay/channels.ts';
import { THEMES, type DisplayId, type Style, type Template, type Theme, type Widget } from '../overlay/template.ts';

/** Data, how to show it, left, top, width, height, and any options. Positions are fractions of the frame. */
export type Spec = [ChannelId, DisplayId, number, number, number, number, Partial<Style>?];

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

export const FOLLOW: Partial<Style> = { mapMode: 'follow', mapZoom: 14 };
export const LIVE: Partial<Style> = { fullRide: false };
export const SIGNED: Partial<Style> = { showSign: true };

export function layout(name: string, specs: Spec[], theme: Theme = THEMES[0]): Template {
  const seen = new Map<string, number>();
  const widgets: Widget[] = specs.map(([channel, display, x, y, width, height, style]) => {
    const base = `${channel}-${display}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const name = display === 'map' ? 'Map' : display === 'route' ? 'Route' : display === 'profile' ? 'Elevation' : channelDef(channel).label;
    return { id: n > 1 ? `${base}-${n}` : base, name, channel, display, x, y, width, height, style: style ?? {} };
  });
  return { version: 2, name, theme, widgets };
}
