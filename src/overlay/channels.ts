import { seriesValue, type OverlayData } from './data.ts';

export type ChannelId =
  | 'speed' | 'pace' | 'heartRate' | 'cadence' | 'power' | 'temperature'
  | 'altitude' | 'height' | 'gradient' | 'ascent' | 'verticalSpeed' | 'heading'
  | 'distance' | 'remaining' | 'homeDistance' | 'rideTime' | 'clipTime' | 'timeOfDay';

export type ChannelFormat = 'number' | 'duration' | 'clock' | 'compass';

export interface UnitDef {
  id: string;
  label: string;
  /** Converts from the channel's base unit. */
  convert(value: number): number;
}

export interface ChannelDef {
  id: ChannelId;
  label: string;
  units: UnitDef[];
  min: number;
  max: number;
  step: number;
  decimals: number;
  format: ChannelFormat;
  /** Worked out from the clock rather than recorded, so it is always available. */
  clock?: boolean;
}

const unit = (id: string, label: string, scale = 1): UnitDef => ({ id, label, convert: v => v * scale });
const plain = (label: string): UnitDef[] => [unit(label, label)];
const METRES_PER_MILE = 1609.344;

/** Add a new kind of data here and every display type can show it. */
export const CHANNELS: ChannelDef[] = [
  { id: 'speed', label: 'Speed', units: [unit('mph', 'mph', 2.23694), unit('kmh', 'km/h', 3.6), unit('kn', 'kn', 1.94384)], min: 0, max: 45, step: 5, decimals: 1, format: 'number' },
  { id: 'pace', label: 'Pace', units: [unit('minmi', '/mi', METRES_PER_MILE), unit('minkm', '/km', 1000)], min: 240, max: 720, step: 60, decimals: 0, format: 'duration' },
  { id: 'heartRate', label: 'Heart rate', units: plain('bpm'), min: 40, max: 200, step: 20, decimals: 0, format: 'number' },
  { id: 'cadence', label: 'Cadence', units: [unit('rpm', 'rpm'), unit('spm', 'spm', 2)], min: 0, max: 140, step: 20, decimals: 0, format: 'number' },
  { id: 'power', label: 'Power', units: plain('W'), min: 0, max: 600, step: 100, decimals: 0, format: 'number' },
  { id: 'temperature', label: 'Temperature', units: [unit('c', '°C'), { id: 'f', label: '°F', convert: v => v * 1.8 + 32 }], min: -10, max: 40, step: 10, decimals: 0, format: 'number' },
  { id: 'altitude', label: 'Altitude', units: [unit('m', 'm'), unit('ft', 'ft', 3.28084)], min: 0, max: 1000, step: 200, decimals: 0, format: 'number' },
  { id: 'height', label: 'Height above start', units: [unit('m', 'm'), unit('ft', 'ft', 3.28084)], min: 0, max: 120, step: 20, decimals: 0, format: 'number' },
  { id: 'gradient', label: 'Gradient', units: plain('%'), min: -20, max: 20, step: 5, decimals: 1, format: 'number' },
  { id: 'ascent', label: 'Elevation gain', units: [unit('m', 'm'), unit('ft', 'ft', 3.28084)], min: 0, max: 2000, step: 500, decimals: 0, format: 'number' },
  { id: 'verticalSpeed', label: 'Climb rate', units: [unit('mh', 'm/h'), unit('fth', 'ft/h', 3.28084)], min: -1500, max: 1500, step: 500, decimals: 0, format: 'number' },
  { id: 'heading', label: 'Heading', units: plain('°'), min: 0, max: 360, step: 45, decimals: 0, format: 'compass' },
  { id: 'distance', label: 'Distance', units: [unit('mi', 'mi', 1 / METRES_PER_MILE), unit('km', 'km', 0.001)], min: 0, max: 100, step: 10, decimals: 1, format: 'number' },
  { id: 'remaining', label: 'Distance to go', units: [unit('mi', 'mi', 1 / METRES_PER_MILE), unit('km', 'km', 0.001)], min: 0, max: 100, step: 10, decimals: 1, format: 'number' },
  { id: 'homeDistance', label: 'Distance from start', units: [unit('m', 'm'), unit('km', 'km', 0.001), unit('mi', 'mi', 1 / METRES_PER_MILE)], min: 0, max: 1000, step: 200, decimals: 0, format: 'number' },
  { id: 'rideTime', label: 'Activity time', units: plain(''), min: 0, max: 3600, step: 600, decimals: 0, format: 'duration', clock: true },
  { id: 'clipTime', label: 'Clip time', units: plain(''), min: 0, max: 600, step: 60, decimals: 0, format: 'duration', clock: true },
  { id: 'timeOfDay', label: 'Time of day', units: plain(''), min: 0, max: 86400, step: 3600, decimals: 0, format: 'clock', clock: true },
];

export const channelDef = (id: ChannelId): ChannelDef => CHANNELS.find(c => c.id === id) ?? CHANNELS[0];

export function unitDef(channel: ChannelDef, id?: string): UnitDef {
  return channel.units.find(u => u.id === id) ?? channel.units[0];
}

export interface TimeContext {
  clipStart: number;
}

/** A channel's value at `time`, in the unit asked for. */
export function readChannel(data: OverlayData, def: ChannelDef, unitId: string | undefined, time: number, clip: TimeContext, smoothing = 0): number | null {
  if (def.id === 'rideTime') return Math.max(0, time - data.track.t[0]);
  if (def.id === 'clipTime') return Math.max(0, time - clip.clipStart);
  if (def.id === 'timeOfDay') return time;
  const value = seriesValue(data, def.id, time, smoothing);
  return value == null ? null : unitDef(def, unitId).convert(value);
}

function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function formatValue(def: ChannelDef, value: number | null, decimals: number, showSign = false): string {
  if (value == null) return '--';
  if (def.format === 'duration') return duration(value);
  if (def.format === 'clock') {
    const d = new Date(value * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (def.format === 'compass') return COMPASS[Math.round(value / 45) % 8];
  const text = value.toFixed(decimals);
  return showSign && value > 0 ? `+${text}` : text;
}
