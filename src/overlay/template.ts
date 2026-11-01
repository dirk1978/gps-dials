import { channelDef, type ChannelId } from './channels.ts';

export type DisplayId = 'dial' | 'arc' | 'bar' | 'graph' | 'counter' | 'text' | 'route' | 'profile';

export interface Zone {
  upTo: number;
  color: string;
}

/** The look shared across a layout. Changing the theme recolours everything not set by hand. */
export interface Theme {
  name: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  panel: string;
  panelOpacity: number;
  border: string;
  track: string;
  up: string;
  down: string;
  font: string;
  italic: boolean;
  bold: boolean;
  cornerRadius: number;
  shadow: number;
}

/** Every option a widget can set. Anything left unset comes from the theme or the data's own defaults. */
export interface Style {
  opacity: number;
  color: string;
  color2: string;
  textColor: string;
  mutedColor: string;
  trackColor: string;
  trackOpacity: number;
  tickColor: string;
  needleColor: string;
  panelColor: string;
  panelOpacity: number;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  shadow: number;
  shadowColor: string;
  outlineColor: string;
  outlineWidth: number;

  font: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  valueSize: number;
  labelSize: number;
  unitsSize: number;
  scaleSize: number;

  showValue: boolean;
  showLabel: boolean;
  showUnits: boolean;
  labelText: string;
  text: string;
  unit: string;
  decimals: number;
  showSign: boolean;
  smoothing: number;

  autoRange: boolean;
  min: number;
  max: number;
  step: number;
  minorTicks: number;
  showTicks: boolean;
  showNumbers: boolean;
  tickLength: number;
  tickWidth: number;

  thickness: number;
  roundEnds: boolean;
  startAngle: number;
  sweepAngle: number;
  reverse: boolean;
  showNeedle: boolean;
  needleLength: number;
  needleWidth: number;
  showHub: boolean;

  orientation: 'horizontal' | 'vertical';

  windowSeconds: number;
  fillArea: boolean;
  lineWidth: number;
  showMarker: boolean;

  useZones: boolean;
  zones: Zone[];

  routeWidth: number;
  dotSize: number;
  showRemaining: boolean;
  zoomToClip: boolean;
  fullRide: boolean;
}

export interface Widget {
  id: string;
  name: string;
  channel: ChannelId;
  display: DisplayId;
  /** Fractions of the frame, so a layout fits any resolution. */
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
  /** Only what differs from the defaults. */
  style: Partial<Style>;
}

export interface Template {
  version: 2;
  name: string;
  theme: Theme;
  widgets: Widget[];
  /** Length of road gradient is measured over, in metres. Shorter reacts faster; longer ignores noise. */
  gradientSpan?: number;
}

export const FONTS = ['Barlow Condensed', 'Arial', 'Segoe UI', 'Impact', 'Verdana', 'Georgia', 'Consolas'];

export const THEMES: Theme[] = [
  {
    name: 'RideWorld', accent: '#ff9a3d', accent2: '#ff3d7f', text: '#ffffff', muted: '#c3cad6', panel: '#0e121e', panelOpacity: 0.72,
    border: '#ffffff', track: '#ffffff', up: '#ff6b5e', down: '#4fd67a', font: 'Barlow Condensed', italic: true, bold: true, cornerRadius: 16, shadow: 4,
  },
  {
    name: 'Clean white', accent: '#ffffff', accent2: '#d7dde6', text: '#ffffff', muted: '#e6e9ee', panel: '#000000', panelOpacity: 0,
    border: '#ffffff', track: '#ffffff', up: '#ffffff', down: '#ffffff', font: 'Segoe UI', italic: false, bold: true, cornerRadius: 0, shadow: 8,
  },
  {
    name: 'Amber', accent: '#ffbe3d', accent2: '#5fad60', text: '#ffffff', muted: '#ffffff', panel: '#000000', panelOpacity: 0,
    border: '#ffffff', track: '#ffffff', up: '#ff4d85', down: '#80ffd1', font: 'Arial', italic: false, bold: true, cornerRadius: 0, shadow: 5,
  },
  {
    name: 'Neon', accent: '#29f3e1', accent2: '#b84dff', text: '#f2fbff', muted: '#a9d9e8', panel: '#070b18', panelOpacity: 0.6,
    border: '#29f3e1', track: '#29f3e1', up: '#ff4d9d', down: '#29f3a0', font: 'Barlow Condensed', italic: false, bold: true, cornerRadius: 6, shadow: 10,
  },
];

const HEART_ZONES: Zone[] = [
  { upTo: 110, color: '#9aa3b2' },
  { upTo: 130, color: '#4a9eff' },
  { upTo: 150, color: '#4fd67a' },
  { upTo: 165, color: '#ffc23d' },
  { upTo: 999, color: '#ff4d5e' },
];

const BASE_STYLE: Style = {
  opacity: 1,
  color: '', color2: '', textColor: '', mutedColor: '', trackColor: '', trackOpacity: 0.16, tickColor: '', needleColor: '',
  panelColor: '', panelOpacity: -1, borderColor: '', borderWidth: 1.5, cornerRadius: -1, shadow: -1, shadowColor: '#000000',
  outlineColor: '#000000', outlineWidth: 0,
  font: '', bold: true, italic: true, align: 'center', valueSize: 1, labelSize: 1, unitsSize: 1, scaleSize: 1,
  showValue: true, showLabel: true, showUnits: true, labelText: '', text: '{value} {units}', unit: '', decimals: -1, showSign: false, smoothing: 0,
  autoRange: false, min: NaN, max: NaN, step: NaN, minorTicks: 0, showTicks: true, showNumbers: true, tickLength: 0.1, tickWidth: 0.016,
  thickness: 0.085, roundEnds: false, startAngle: 135, sweepAngle: 270, reverse: false, showNeedle: true, needleLength: 0.74, needleWidth: 0.04, showHub: true,
  orientation: 'horizontal',
  windowSeconds: 60, fillArea: true, lineWidth: 3, showMarker: true,
  useZones: false, zones: [],
  routeWidth: 3.5, dotSize: 7, showRemaining: true, zoomToClip: false, fullRide: true,
};

/** A widget's full style, with blanks filled from its theme and its data's defaults. */
export function resolveStyle(widget: Widget, theme: Theme): Style {
  const def = channelDef(widget.channel);
  const s: Style = {
    ...BASE_STYLE,
    bold: theme.bold,
    italic: theme.italic,
    // A route reads best whole; a profile is about the road around you.
    fullRide: widget.display !== 'profile',
    ...widget.style,
  };
  s.color ||= theme.accent;
  s.color2 ||= theme.accent2;
  s.textColor ||= theme.text;
  s.mutedColor ||= theme.muted;
  s.trackColor ||= theme.track;
  s.tickColor ||= theme.text;
  s.needleColor ||= theme.text;
  s.panelColor ||= theme.panel;
  s.borderColor ||= theme.border;
  s.font ||= theme.font;
  if (s.panelOpacity < 0) s.panelOpacity = theme.panelOpacity;
  if (s.cornerRadius < 0) s.cornerRadius = theme.cornerRadius;
  if (s.shadow < 0) s.shadow = theme.shadow;
  if (Number.isNaN(s.min)) s.min = def.min;
  if (Number.isNaN(s.max)) s.max = def.max;
  if (Number.isNaN(s.step)) s.step = def.step;
  if (s.decimals < 0) s.decimals = def.decimals;
  s.labelText ||= def.label;
  return s;
}

export function newId(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const DEFAULT_SIZES: Record<DisplayId, [number, number]> = {
  dial: [0.12, 0.2133], arc: [0.12, 0.2133], bar: [0.2, 0.06], graph: [0.3, 0.14], counter: [0.1, 0.09], text: [0.2, 0.06], route: [0.135, 0.24], profile: [0.5, 0.09],
};

export function newWidget(channel: ChannelId, display: DisplayId, x = 0.4, y = 0.4): Widget {
  const [width, height] = DEFAULT_SIZES[display];
  return { id: newId(), name: channelDef(channel).label, channel, display, x, y, width, height, style: {} };
}

function widget(channel: ChannelId, display: DisplayId, x: number, y: number, width: number, height: number, style: Partial<Style> = {}, name?: string): Widget {
  return { id: `${channel}-${display}`, name: name ?? channelDef(channel).label, channel, display, x, y, width, height, style };
}

export const defaultTemplate: Template = {
  version: 2,
  name: 'Default',
  theme: THEMES[0],
  widgets: [
    widget('distance', 'route', 0.012, 0.025, 0.135, 0.24, {}, 'Route'),
    widget('gradient', 'counter', 0.3, 0.025, 0.1, 0.09, { showSign: true }),
    widget('distance', 'counter', 0.4, 0.025, 0.1, 0.09),
    widget('rideTime', 'counter', 0.5, 0.025, 0.1, 0.09),
    widget('altitude', 'counter', 0.6, 0.025, 0.1, 0.09),
    widget('heartRate', 'dial', 0.868, 0.025, 0.12, 0.2133, { useZones: true, zones: HEART_ZONES }),
    widget('speed', 'dial', 0.868, 0.76, 0.12, 0.2133),
    widget('altitude', 'profile', 0.2, 0.89, 0.6, 0.085, {}, 'Elevation'),
  ],
};

/** Accepts a saved or hand-edited layout, dropping anything that can't be drawn. */
export function normaliseTemplate(raw: unknown): Template {
  const t = raw as Partial<Template> | null;
  if (!t || t.version !== 2 || !Array.isArray(t.widgets)) throw new Error('That isn\'t a gps-dials layout.');
  return {
    version: 2,
    name: String(t.name ?? 'Untitled'),
    theme: { ...THEMES[0], ...t.theme },
    gradientSpan: t.gradientSpan,
    widgets: t.widgets.filter(w => w && typeof w === 'object').map(w => ({
      ...w,
      id: String(w.id ?? newId()),
      name: String(w.name ?? 'Widget'),
      x: Number(w.x) || 0,
      y: Number(w.y) || 0,
      width: Number(w.width) || 0.1,
      height: Number(w.height) || 0.1,
      style: w.style ?? {},
    })),
  };
}
