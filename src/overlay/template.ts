import { channelDef, type ChannelId } from './channels.ts';
import { DEFAULT_RIDER, defaultZones, type Rider, type Zone } from './zones.ts';

export type { Zone } from './zones.ts';

export type DisplayId = 'dial' | 'arc' | 'vsi' | 'compass' | 'tape' | 'tilt' | 'horizon' | 'scope' | 'bar' | 'zones' | 'graph' | 'counter' | 'stats' | 'text' | 'route' | 'profile' | 'map' | 'image';

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
  compassMode: 'card' | 'needle';
  /** How many numbered steps a tape shows at once. */
  tapeSteps: number;
  skyColor: string;
  groundColor: string;
  /** The g-force at a scope's rim. */
  scopeRange: number;
  trailSeconds: number;
  statsSpan: 'clip' | 'soFar';
  /** Pictures for a home-made gauge, kept in the layout so it travels with it. */
  imageDial: string;
  imageNeedle: string;

  graphAxis: 'time' | 'distance';
  windowMetres: number;
  windowSeconds: number;
  fillArea: boolean;
  lineWidth: number;
  showMarker: boolean;

  useZones: boolean;
  zones: Zone[];
  hideWhenNoData: boolean;

  routeWidth: number;
  routeOutlineColor: string;
  routeOutlineWidth: number;
  dotSize: number;
  markerStyle: 'dot' | 'ring' | 'arrow';
  markerColor: string;
  showRemaining: boolean;
  zoomToClip: boolean;
  fullRide: boolean;
  /** Metres of road a profile's shape is evened out over. */
  profileSmoothing: number;

  mapProvider: string;
  mapCustomUrl: string;
  mapCredit: string;
  mapMode: 'follow' | 'fitClip' | 'fitRide';
  mapZoom: number;
  mapRotate: boolean;
  mapShape: 'rounded' | 'square' | 'circle';
  mapOpacity: number;
  mapDarken: number;
  mapSaturation: number;
  mapBrightness: number;
  mapContrast: number;
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
  /** For built-in layouts: what to show here instead, best first, if the file has no data for this. */
  instead?: Swap[];
}

export interface Swap {
  channel: ChannelId;
  display: DisplayId;
  style?: Partial<Style>;
}

export interface Template {
  version: 2;
  name: string;
  theme: Theme;
  widgets: Widget[];
  /** Length of road gradient is measured over, in metres. Shorter reacts faster; longer ignores noise. */
  gradientSpan?: number;
  rider?: Rider;
  /** Still the built-in choice, so it can follow the activity until someone edits it. */
  auto?: boolean;
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
  compassMode: 'card',
  tapeSteps: 4, skyColor: '#3f7fc4', groundColor: '#7a5533', scopeRange: 0.6, trailSeconds: 4, statsSpan: 'soFar', imageDial: '', imageNeedle: '',
  graphAxis: 'time', windowMetres: 2000,
  windowSeconds: 60, fillArea: true, lineWidth: 3, showMarker: true,
  useZones: false, zones: [], hideWhenNoData: true,
  routeWidth: 5, routeOutlineColor: '#000000', routeOutlineWidth: 1.5, dotSize: 8, markerStyle: 'dot', markerColor: '', showRemaining: true, zoomToClip: false, fullRide: true, profileSmoothing: 40,
  mapProvider: 'osm', mapCustomUrl: '', mapCredit: '', mapMode: 'follow', mapZoom: 16.5, mapRotate: false, mapShape: 'rounded',
  mapOpacity: 1, mapDarken: 0, mapSaturation: 1, mapBrightness: 1, mapContrast: 1,
};

/** A widget's full style, with blanks filled from its theme and its data's defaults. */
export function resolveStyle(widget: Widget, theme: Theme, rider: Rider = DEFAULT_RIDER): Style {
  const def = channelDef(widget.channel);
  const zones = defaultZones(widget.channel, rider);
  const s: Style = {
    ...BASE_STYLE,
    bold: theme.bold,
    italic: theme.italic,
    // A route reads best whole; a profile is about the road around you.
    fullRide: widget.display !== 'profile',
    useZones: zones != null,
    ...widget.style,
  };
  if (!widget.style.zones?.length) s.zones = zones ?? [];
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
  dial: [0.15, 0.2667], arc: [0.15, 0.2667], vsi: [0.15, 0.2667], compass: [0.15, 0.2667], tape: [0.3, 0.1], tilt: [0.15, 0.17], horizon: [0.15, 0.2667], scope: [0.15, 0.2667],
  zones: [0.22, 0.1], stats: [0.22, 0.12], image: [0.15, 0.2667], bar: [0.25, 0.08], graph: [0.34, 0.18], counter: [0.11, 0.11], text: [0.24, 0.08], route: [0.2, 0.3556], profile: [0.5, 0.11], map: [0.2, 0.3556],
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
    widget('distance', 'map', 0.012, 0.025, 0.2, 0.3556, {}, 'Map'),
    widget('gradient', 'counter', 0.27, 0.025, 0.115, 0.11, { showSign: true }),
    widget('distance', 'counter', 0.385, 0.025, 0.115, 0.11),
    widget('rideTime', 'counter', 0.5, 0.025, 0.115, 0.11),
    widget('altitude', 'counter', 0.615, 0.025, 0.115, 0.11),
    widget('heartRate', 'dial', 0.838, 0.025, 0.15, 0.2667),
    widget('speed', 'dial', 0.838, 0.71, 0.15, 0.2667),
    widget('altitude', 'profile', 0.2, 0.865, 0.6, 0.11, {}, 'Elevation'),
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
    rider: t.rider,
    auto: t.auto,
    widgets: t.widgets.filter(w => w && typeof w === 'object').map(w => ({
      ...w,
      id: String(w.id ?? newId()),
      name: String(w.name || channelDef(w.channel).label),
      x: Number(w.x) || 0,
      y: Number(w.y) || 0,
      width: Number(w.width) || 0.1,
      height: Number(w.height) || 0.1,
      style: w.style ?? {},
    })),
  };
}
