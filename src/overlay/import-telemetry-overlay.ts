import type { ChannelId } from './channels.ts';
import { THEMES, defaultTemplate, newId, type DisplayId, type Style, type Template, type Widget } from './template.ts';

type Rgb = [number, number, number, number?];

interface ToGauge {
  id?: string;
  type: string;
  custom?: { streams?: string[] };
  visual?: {
    name?: string;
    hidden?: boolean;
    position?: [number, number];
    size?: number;
    colors?: Record<string, Rgb>;
    units?: { unit?: string };
    max?: { set?: boolean; value?: number };
    min?: { set?: boolean; value?: number };
    text?: { decimals?: number; value?: boolean; sign?: boolean; size?: number };
    ticks?: { large?: number; small?: number };
    labels?: { title?: boolean; units?: boolean };
    gauge?: { rounded?: boolean };
    shape?: { reverse?: boolean };
  };
}

interface ToFile {
  project?: { colors?: Record<string, Rgb> };
  gauges?: ToGauge[];
}

const TYPES: Record<string, [ChannelId, DisplayId]> = {
  Speedometer: ['speed', 'dial'],
  'Heart Rate': ['heartRate', 'dial'],
  'Heart Rate [mini]': ['heartRate', 'counter'],
  Power: ['power', 'counter'],
  Pace: ['pace', 'counter'],
  Slope: ['gradient', 'counter'],
  Distance: ['distance', 'counter'],
  'Elevation Gain': ['ascent', 'counter'],
  'Vertical Speed': ['verticalSpeed', 'counter'],
  'Altitude vs Distance': ['altitude', 'profile'],
  'Altitude vs Time': ['altitude', 'graph'],
  'GPS Path': ['distance', 'route'],
  'GPS Path + Compass': ['distance', 'route'],
  'Dynamic Map': ['distance', 'route'],
};

const STREAMS: Record<string, ChannelId> = { Cadence: 'cadence', Power: 'power', 'Heart rate': 'heartRate', Temperature: 'temperature' };

const UNITS: Record<string, string> = { 'km/h': 'kmh', mph: 'mph', km: 'km', mi: 'mi', m: 'm', ft: 'ft' };

/** Its files give a size number, not dimensions, so these were measured from its own screen. */
const SIZE_SCALE: Record<DisplayId, [number, number]> = {
  dial: [0.06, 0.1067], arc: [0.06, 0.1067], bar: [0.1, 0.03], counter: [0.05, 0.045], graph: [0.11, 0.05], text: [0.1, 0.03], route: [0.072, 0.128], profile: [0.11, 0.035],
};
/** Numbers are sized by their text setting rather than the gauge size. */
const COUNTER_WIDTH_PER_TEXT = 0.022;
const COUNTER_HEIGHT_PER_TEXT = 0.012;
const DEFAULT_TEXT_SIZE = 4;

function hex(color?: Rgb): string | undefined {
  if (!color) return undefined;
  return `#${color.slice(0, 3).map(v => Math.round(v ?? 0).toString(16).padStart(2, '0')).join('')}`;
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function convertGauge(gauge: ToGauge, skipped: Set<string>): Widget | null {
  const customStream = gauge.custom?.streams?.[0];
  const mapped = gauge.type === 'Custom circular' && customStream && STREAMS[customStream]
    ? [STREAMS[customStream], 'dial'] as [ChannelId, DisplayId]
    : TYPES[gauge.type];
  if (!mapped) {
    skipped.add(gauge.type);
    return null;
  }
  const [channel, display] = mapped;
  const v = gauge.visual ?? {};
  const size = Number(v.size) || 1;
  const [scaleW, scaleH] = SIZE_SCALE[display];
  const textSize = v.text?.size ?? DEFAULT_TEXT_SIZE;
  const width = Math.min(1, display === 'counter' ? textSize * COUNTER_WIDTH_PER_TEXT : scaleW * size);
  const height = Math.min(1, display === 'counter' ? textSize * COUNTER_HEIGHT_PER_TEXT : scaleH * size);
  const [cx, cy] = v.position ?? [0.5, 0.5];

  const style: Partial<Style> = { panelOpacity: 0, cornerRadius: 0 };
  const accent = hex(v.colors?.gauge);
  const text = hex(v.colors?.text);
  const ticks = hex(v.colors?.ticks);
  if (accent) style.color = accent;
  if (text) style.textColor = text;
  if (ticks) style.tickColor = ticks;
  const unit = v.units?.unit && UNITS[v.units.unit];
  if (unit) style.unit = unit;
  if (v.max?.set && v.max.value != null) style.max = v.max.value;
  if (v.min?.set && v.min.value != null) style.min = v.min.value;
  if (v.text?.decimals != null) style.decimals = v.text.decimals;
  if (v.text?.value === false) style.showValue = false;
  if (v.text?.sign) style.showSign = true;
  if (v.gauge?.rounded) style.roundEnds = true;
  if (v.shape?.reverse) style.reverse = true;
  if (v.labels?.title === false) style.showLabel = false;

  return {
    id: newId(),
    name: v.name ?? gauge.type,
    channel,
    display,
    x: clamp(cx - width / 2),
    y: clamp(cy - height / 2),
    width,
    height,
    hidden: v.hidden === true,
    style,
  };
}

/** Telemetry Overlay's `.toptrn` and `.toproj` files are plain JSON, so their layouts can be brought across. */
export function importTelemetryOverlay(raw: unknown, name: string): { template: Template; skipped: string[] } {
  const file = raw as ToFile | null;
  if (!file || !Array.isArray(file.gauges)) throw new Error('That isn\'t a Telemetry Overlay template.');
  const skipped = new Set<string>();
  const widgets = file.gauges.map(g => convertGauge(g, skipped)).filter((w): w is Widget => w != null);
  const colors = file.project?.colors;
  const theme = {
    ...THEMES[2],
    name: 'Imported',
    accent: hex(colors?.gauge) ?? THEMES[2].accent,
    accent2: hex(colors?.path) ?? THEMES[2].accent2,
    text: hex(colors?.text) ?? THEMES[2].text,
    up: hex(colors?.up) ?? THEMES[2].up,
    down: hex(colors?.down) ?? THEMES[2].down,
  };
  return { template: { ...defaultTemplate, name, theme, widgets }, skipped: [...skipped] };
}
