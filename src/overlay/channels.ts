import type { ClipSensors } from '../devices/types.ts';
import { sensorValue, seriesValue, type OverlayData } from './data.ts';
import { DEFAULT_RIDER, defaultZones, type Rider } from './zones.ts';

export type ChannelId =
  | 'speed' | 'pace' | 'heartRate' | 'cadence' | 'power' | 'temperature'
  | 'altitude' | 'height' | 'gradient' | 'ascent' | 'verticalSpeed' | 'heading'
  | 'distance' | 'remaining' | 'homeDistance' | 'rideTime' | 'clipTime' | 'timeOfDay'
  | 'progress' | 'averageSpeed' | 'maxSpeed' | 'accelForward' | 'accelLateral' | 'gForce' | 'leanAngle'
  | 'heartZone' | 'powerZone' | 'latitude' | 'longitude' | 'date'
  | 'lapNumber' | 'lapTime' | 'lastLap' | 'bestLap' | 'splitKm' | 'splitMile' | 'launchTime' | 'cornerSpeed'
  | 'pitch' | 'iso' | 'shutter' | 'aperture' | 'whiteBalance';

export type ChannelFormat = 'number' | 'duration' | 'clock' | 'compass' | 'date' | 'shutter' | 'aperture';

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
export const GRAVITY = 9.80665;
const SPEED_UNITS = [unit('mph', 'mph', 2.23694), unit('kmh', 'km/h', 3.6), unit('kn', 'kn', 1.94384)];
const FORCE_UNITS = [unit('g', 'g', 1 / GRAVITY), unit('ms2', 'm/s²')];

/** Add a new kind of data here and every display type can show it. */
export const CHANNELS: ChannelDef[] = [
  { id: 'speed', label: 'Speed', units: SPEED_UNITS, min: 0, max: 45, step: 5, decimals: 1, format: 'number' },
  { id: 'pace', label: 'Pace', units: [unit('minmi', '/mi', METRES_PER_MILE), unit('minkm', '/km', 1000)], min: 240, max: 720, step: 60, decimals: 0, format: 'duration' },
  { id: 'heartRate', label: 'Heart rate', units: plain('bpm'), min: 40, max: 200, step: 20, decimals: 0, format: 'number' },
  { id: 'cadence', label: 'Cadence', units: [unit('rpm', 'rpm'), unit('spm', 'spm', 2)], min: 0, max: 140, step: 20, decimals: 0, format: 'number' },
  { id: 'power', label: 'Power', units: plain('W'), min: 0, max: 600, step: 100, decimals: 0, format: 'number' },
  { id: 'temperature', label: 'Temperature', units: [unit('c', '°C'), { id: 'f', label: '°F', convert: v => v * 1.8 + 32 }], min: -10, max: 40, step: 10, decimals: 0, format: 'number' },
  { id: 'altitude', label: 'Altitude', units: [unit('m', 'm'), unit('ft', 'ft', 3.28084)], min: 0, max: 1000, step: 200, decimals: 0, format: 'number' },
  { id: 'height', label: 'Height above start', units: [unit('m', 'm'), unit('ft', 'ft', 3.28084)], min: 0, max: 120, step: 20, decimals: 0, format: 'number' },
  { id: 'gradient', label: 'Gradient', units: plain('%'), min: -20, max: 20, step: 5, decimals: 1, format: 'number' },
  { id: 'ascent', label: 'Elevation gain', units: [unit('m', 'm'), unit('ft', 'ft', 3.28084)], min: 0, max: 2000, step: 500, decimals: 0, format: 'number' },
  { id: 'verticalSpeed', label: 'Climb rate', units: [unit('mh', 'm/h'), unit('fth', 'ft/h', 3.28084), unit('ms', 'm/s', 1 / 3600), unit('fpm', 'ft/min', 3.28084 / 60)], min: -1500, max: 1500, step: 500, decimals: 0, format: 'number' },
  { id: 'heading', label: 'Heading', units: plain('°'), min: 0, max: 360, step: 45, decimals: 0, format: 'compass' },
  { id: 'distance', label: 'Distance', units: [unit('mi', 'mi', 1 / METRES_PER_MILE), unit('km', 'km', 0.001)], min: 0, max: 100, step: 10, decimals: 1, format: 'number' },
  { id: 'remaining', label: 'Distance to go', units: [unit('mi', 'mi', 1 / METRES_PER_MILE), unit('km', 'km', 0.001)], min: 0, max: 100, step: 10, decimals: 1, format: 'number' },
  { id: 'homeDistance', label: 'Distance from start', units: [unit('m', 'm'), unit('km', 'km', 0.001), unit('mi', 'mi', 1 / METRES_PER_MILE)], min: 0, max: 1000, step: 200, decimals: 0, format: 'number' },
  { id: 'rideTime', label: 'Activity time', units: plain(''), min: 0, max: 3600, step: 600, decimals: 0, format: 'duration', clock: true },
  { id: 'clipTime', label: 'Clip time', units: plain(''), min: 0, max: 600, step: 60, decimals: 0, format: 'duration', clock: true },
  { id: 'timeOfDay', label: 'Time of day', units: plain(''), min: 0, max: 86400, step: 3600, decimals: 0, format: 'clock', clock: true },
  { id: 'date', label: 'Date', units: plain(''), min: 0, max: 86400, step: 3600, decimals: 0, format: 'date', clock: true },
  { id: 'progress', label: 'Progress', units: plain('%'), min: 0, max: 100, step: 20, decimals: 0, format: 'number' },
  { id: 'averageSpeed', label: 'Average speed', units: SPEED_UNITS, min: 0, max: 45, step: 5, decimals: 1, format: 'number' },
  { id: 'maxSpeed', label: 'Top speed', units: SPEED_UNITS, min: 0, max: 45, step: 5, decimals: 1, format: 'number' },
  { id: 'accelForward', label: 'Acceleration', units: FORCE_UNITS, min: -0.6, max: 0.6, step: 0.2, decimals: 2, format: 'number' },
  { id: 'accelLateral', label: 'Cornering force', units: FORCE_UNITS, min: -0.6, max: 0.6, step: 0.2, decimals: 2, format: 'number' },
  { id: 'gForce', label: 'G-force', units: FORCE_UNITS, min: 0, max: 1, step: 0.2, decimals: 2, format: 'number' },
  { id: 'leanAngle', label: 'Lean angle', units: plain('°'), min: -45, max: 45, step: 15, decimals: 0, format: 'number' },
  { id: 'heartZone', label: 'Heart rate zone', units: plain(''), min: 1, max: 5, step: 1, decimals: 0, format: 'number' },
  { id: 'powerZone', label: 'Power zone', units: plain(''), min: 1, max: 6, step: 1, decimals: 0, format: 'number' },
  { id: 'latitude', label: 'Latitude', units: plain('°'), min: -90, max: 90, step: 30, decimals: 5, format: 'number' },
  { id: 'longitude', label: 'Longitude', units: plain('°'), min: -180, max: 180, step: 60, decimals: 5, format: 'number' },
  { id: 'lapNumber', label: 'Lap', units: plain(''), min: 0, max: 20, step: 5, decimals: 0, format: 'number' },
  { id: 'lapTime', label: 'Lap time', units: plain(''), min: 0, max: 3600, step: 600, decimals: 0, format: 'duration' },
  { id: 'lastLap', label: 'Last lap', units: plain(''), min: 0, max: 3600, step: 600, decimals: 0, format: 'duration' },
  { id: 'bestLap', label: 'Best lap', units: plain(''), min: 0, max: 3600, step: 600, decimals: 0, format: 'duration' },
  { id: 'splitKm', label: 'Last kilometre', units: plain(''), min: 0, max: 600, step: 60, decimals: 0, format: 'duration' },
  { id: 'splitMile', label: 'Last mile', units: plain(''), min: 0, max: 900, step: 60, decimals: 0, format: 'duration' },
  { id: 'launchTime', label: 'Standing start', units: plain('s'), min: 0, max: 30, step: 5, decimals: 1, format: 'number' },
  { id: 'cornerSpeed', label: 'Corner speed', units: SPEED_UNITS, min: 0, max: 45, step: 5, decimals: 1, format: 'number' },
  { id: 'pitch', label: 'Pitch', units: plain('°'), min: -30, max: 30, step: 10, decimals: 0, format: 'number' },
  { id: 'iso', label: 'ISO', units: plain(''), min: 100, max: 6400, step: 1000, decimals: 0, format: 'number' },
  { id: 'shutter', label: 'Shutter speed', units: plain(''), min: 0, max: 0.04, step: 0.01, decimals: 0, format: 'shutter' },
  { id: 'aperture', label: 'Aperture', units: plain(''), min: 1, max: 16, step: 3, decimals: 1, format: 'aperture' },
  { id: 'whiteBalance', label: 'White balance', units: plain('K'), min: 2000, max: 10000, step: 2000, decimals: 0, format: 'number' },
];

/** The camera's own readings, offered whatever the activity. */
export const CAMERA_CHANNELS: ChannelId[] = ['iso', 'shutter', 'aperture', 'whiteBalance', 'pitch'];

export const channelDef = (id: ChannelId): ChannelDef => CHANNELS.find(c => c.id === id) ?? CHANNELS[0];

export function unitDef(channel: ChannelDef, id?: string): UnitDef {
  return channel.units.find(u => u.id === id) ?? channel.units[0];
}

export interface TimeContext {
  clipStart: number;
  /** Whose zones to use. */
  rider?: Rider;
  /** What the camera recorded, which beats any estimate from the track. */
  sensors?: ClipSensors | null;
}

/** The numbered zone a reading falls in, counting from 1. */
function zoneNumber(source: ChannelId, value: number | null, rider: Rider): number | null {
  if (value == null) return null;
  const zones = defaultZones(source, rider) ?? [];
  const index = zones.findIndex(z => value < z.upTo);
  return (index < 0 ? zones.length - 1 : index) + 1;
}

/** A channel's value at `time`, in the unit asked for. */
export function readChannel(data: OverlayData, def: ChannelDef, unitId: string | undefined, time: number, clip: TimeContext, smoothing = 0): number | null {
  if (def.id === 'rideTime') return Math.max(0, time - data.track.t[0]);
  if (def.id === 'clipTime') return Math.max(0, time - clip.clipStart);
  if (def.id === 'timeOfDay' || def.id === 'date') return time;
  if (def.id === 'heartZone') return zoneNumber('heartRate', seriesValue(data, 'heartRate', time, smoothing), clip.rider ?? DEFAULT_RIDER);
  if (def.id === 'powerZone') return zoneNumber('power', seriesValue(data, 'power', time, smoothing), clip.rider ?? DEFAULT_RIDER);
  const value = clip.sensors?.series[def.id]
    ? sensorValue(clip.sensors, def.id, time - clip.clipStart, smoothing)
    : seriesValue(data, def.id, time, smoothing);
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatValue(def: ChannelDef, value: number | null, decimals: number, showSign = false): string {
  if (value == null) return '--';
  if (def.format === 'duration') return duration(value);
  if (def.format === 'clock') {
    const d = new Date(value * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (def.format === 'date') {
    const d = new Date(value * 1000);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (def.format === 'shutter') return value <= 0 ? '--' : value >= 0.5 ? `${value.toFixed(1)}s` : `1/${Math.round(1 / value)}`;
  if (def.format === 'aperture') return `f/${value.toFixed(1)}`;
  if (def.format === 'compass') return COMPASS[Math.round(value / 45) % 8];
  const text = value.toFixed(decimals);
  return showSign && value > 0 ? `+${text}` : text;
}
