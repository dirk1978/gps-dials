import { channelDef, type ChannelId } from './channels.ts';
import { THEMES } from './themes.ts';
import { DEFAULT_RIDER, defaultZones, type Rider, type Zone } from './zones.ts';

export type { Zone } from './zones.ts';
export { THEMES };

export type DisplayId = 'dial' | 'arc' | 'vsi' | 'compass' | 'tape' | 'tilt' | 'horizon' | 'scope' | 'bar' | 'zones' | 'graph' | 'counter' | 'stats' | 'text' | 'route' | 'profile' | 'map' | 'image';

/** The look shared across a layout. Changing the theme recolours everything not set by hand. */
export interface Theme {
  name: string;
  /** The heading it appears under in the picker. */
  group?: string;
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
  /** What a stats panel covers: the ride or clip, up to now or all of it. */
  statsSpan: 'rideSoFar' | 'ride' | 'soFar' | 'clip';
  /** Pictures for a home-made gauge, kept in the layout so it travels with it. */
  imageDial: string;
  imageNeedle: string;
  /** How the face follows the value when there's no needle. */
  imageMode: 'still' | 'fill' | 'scale';

  /** A graph shows the whole ride, or only the last stretch. */
  graphSpan: 'ride' | 'recent';
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
  /** Data to colour the route by, from the main colour at its lowest to the gradient end at its highest. */
  routeColorBy: '' | 'speed' | 'gradient' | 'altitude' | 'heartRate' | 'power';
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
  /** The speed a standing-start timer runs to, in m/s. */
  launchSpeed?: number;
  rider?: Rider;
  /** Still the built-in choice, so it can follow the activity until someone edits it. */
  auto?: boolean;
}

export const FONTS = ['Barlow Condensed', 'Arial', 'Segoe UI', 'Impact', 'Verdana', 'Georgia', 'Consolas'];

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
  tapeSteps: 4, skyColor: '#3f7fc4', groundColor: '#7a5533', scopeRange: 0.6, trailSeconds: 4, statsSpan: 'rideSoFar', imageDial: '', imageNeedle: '', imageMode: 'still',
  graphSpan: 'ride', graphAxis: 'time', windowMetres: 2000,
  windowSeconds: 60, fillArea: true, lineWidth: 3, showMarker: true,
  useZones: false, zones: [], hideWhenNoData: true,
  routeWidth: 5, routeOutlineColor: '#000000', routeOutlineWidth: 1.5, routeColorBy: '', dotSize: 8, markerStyle: 'dot', markerColor: '', showRemaining: true, zoomToClip: false, fullRide: true, profileSmoothing: 40,
  mapProvider: 'osm', mapCustomUrl: '', mapCredit: '', mapMode: 'follow', mapZoom: 16.5, mapRotate: false, mapShape: 'rounded',
  mapOpacity: 1, mapDarken: 0, mapSaturation: 1, mapBrightness: 1, mapContrast: 1,
};

const lightPanel = (theme: Theme) => theme.panelOpacity > 0.5 && parseInt(theme.panel.slice(1, 3), 16) > 180;

/** Zone colours are bright for dark panels, so on a pale one they need deepening to stay readable. */
function darker(hex: string): string {
  const channel = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.62).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** A widget's full style, with blanks filled from its theme and its data's defaults. */
export function resolveStyle(widget: Widget, theme: Theme, rider: Rider = DEFAULT_RIDER): Style {
  const def = channelDef(widget.channel);
  const zones = defaultZones(widget.channel, rider);
  const s: Style = {
    ...BASE_STYLE,
    bold: theme.bold,
    italic: theme.italic,
    // Layouts from before this choice existed set a window, and keep it.
    graphSpan: widget.style.windowSeconds != null || widget.style.windowMetres != null ? 'recent' : 'ride',
    useZones: zones != null,
    ...widget.style,
  };
  if (!widget.style.zones?.length) s.zones = (zones ?? []).map(z => (lightPanel(theme) ? { ...z, color: darker(z.color) } : z));
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
    launchSpeed: t.launchSpeed,
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
