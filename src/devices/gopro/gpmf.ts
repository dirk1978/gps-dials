import { execFileSync } from 'node:child_process';
import type { TrackPoint } from '../../activity/types.ts';
import { binned, latest, sensorTimes } from '../sensors.ts';
import type { ClipMotion, ClipSensors } from '../types.ts';

/** GoPro's published format: a four letter key, a type, a size, a repeat count, then the data padded to 4 bytes. */
const HEADER = 8;
const NESTED = 0;
/** Below this the camera has no fix. 2 is a 2D fix and 3 a 3D one. */
const MIN_FIX = 2;
const STANDARD_GRAVITY = 9.80665;
/** Seconds of accelerometer averaged to find which way is up. */
const UP_SPAN_S = 2;
const GPS_EPOCH_2000 = Date.UTC(2000, 0, 1) / 1000;

interface Klv {
  key: string;
  type: string;
  size: number;
  repeat: number;
  start: number;
  end: number;
}

/** One stream from one payload. Payloads last about a second each. */
export interface GpmfStream {
  rows: number[][];
  /** Seconds since the Unix epoch at the first row, for GPS5. */
  utc?: number;
  fix?: number;
}

export interface GpmfPayload {
  /** Seconds from the start of the clip. */
  t: number;
  duration: number;
  streams: Map<string, GpmfStream>;
}

function entries(b: Buffer, start: number, end: number): Klv[] {
  const out: Klv[] = [];
  for (let p = start; p + HEADER <= end;) {
    const key = b.toString('latin1', p, p + 4);
    if (key === '\0\0\0\0') break;
    const size = b[p + 5];
    const repeat = b.readUInt16BE(p + 6);
    const length = size * repeat;
    const bodyEnd = p + HEADER + length;
    if (bodyEnd > end) break;
    out.push({ key, type: String.fromCharCode(b[p + 4]), size, repeat, start: p + HEADER, end: bodyEnd });
    p += HEADER + ((length + 3) & ~3);
  }
  return out;
}

const SIZES: Record<string, number> = { b: 1, B: 1, s: 2, S: 2, l: 4, L: 4, f: 4, d: 8, j: 8, J: 8, q: 4, Q: 8 };

function readValue(b: Buffer, p: number, type: string): number {
  switch (type) {
    case 'b': return b.readInt8(p);
    case 'B': return b[p];
    case 's': return b.readInt16BE(p);
    case 'S': return b.readUInt16BE(p);
    case 'l': return b.readInt32BE(p);
    case 'L': return b.readUInt32BE(p);
    case 'f': return b.readFloatBE(p);
    case 'd': return b.readDoubleBE(p);
    case 'j': return Number(b.readBigInt64BE(p));
    case 'J': return Number(b.readBigUInt64BE(p));
    case 'q': return b.readInt32BE(p) / 65536;
    case 'Q': return Number(b.readBigInt64BE(p)) / 2 ** 32;
    default: throw new Error(`Unknown GPMF type ${type}`);
  }
}

/** Each sample as a row. A complex sample mixes types, which `layout` lists one letter per value. */
function readRows(b: Buffer, klv: Klv, layout: string | undefined): number[][] {
  const types = klv.type === '?' ? layout ?? '' : klv.type.repeat(Math.max(1, Math.floor(klv.size / (SIZES[klv.type] ?? 1))));
  const rows: number[][] = [];
  for (let i = 0; i < klv.repeat; i++) {
    let p = klv.start + i * klv.size;
    const row: number[] = [];
    for (const type of types) {
      row.push(readValue(b, p, type));
      p += SIZES[type];
    }
    rows.push(row);
  }
  return rows;
}

/** A GPS time in the form yymmddhhmmss.sss, always UTC. */
export function gpsTime(text: string): number | undefined {
  const m = /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d(?:\.\d+)?)/.exec(text);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(2000 + Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) / 1000 + Number(s);
}

/** The values each key should be divided by. One value can apply to every column. */
function scaled(rows: number[][], scale: number[]): number[][] {
  if (scale.length === 0) return rows;
  return rows.map(row => row.map((v, i) => v / (scale.length === 1 ? scale[0] : scale[i] ?? 1) || 0));
}

const STREAM_KEYS = new Set(['GPS5', 'GPS9', 'ACCL', 'GYRO', 'ISOE', 'SHUT', 'WBAL']);

function readStream(b: Buffer, strm: Klv): [string, GpmfStream] | null {
  const items = entries(b, strm.start, strm.end);
  const scale = items.find(i => i.key === 'SCAL');
  const layout = items.find(i => i.key === 'TYPE');
  const body = items.find(i => STREAM_KEYS.has(i.key));
  if (!body) return null;
  const rows = readRows(b, body, layout ? b.toString('latin1', layout.start, layout.end).replace(/\0+$/, '') : undefined);
  const stream: GpmfStream = { rows: scaled(rows, scale ? readRows(b, scale, undefined).flat() : []) };
  const utc = items.find(i => i.key === 'GPSU');
  if (utc) stream.utc = gpsTime(b.toString('latin1', utc.start, utc.end));
  const fix = items.find(i => i.key === 'GPSF');
  if (fix) stream.fix = readRows(b, fix, undefined)[0]?.[0];
  return [body.key, stream];
}

/** Reads the telemetry packets. Anything this camera doesn't record is simply absent. */
export function parsePayloads(data: Buffer, packets: { t: number; duration: number; size: number }[]): GpmfPayload[] {
  const payloads: GpmfPayload[] = [];
  let offset = 0;
  for (const packet of packets) {
    const streams = new Map<string, GpmfStream>();
    const end = Math.min(data.length, offset + packet.size);
    for (const devc of entries(data, offset, end)) {
      if (devc.key !== 'DEVC' || devc.type !== String.fromCharCode(NESTED)) continue;
      for (const strm of entries(data, devc.start, devc.end)) {
        if (strm.key !== 'STRM') continue;
        const found = readStream(data, strm);
        if (found) streams.set(found[0], found[1]);
      }
    }
    offset += packet.size;
    payloads.push({ t: packet.t, duration: packet.duration, streams });
  }
  return payloads;
}

interface GpsSample {
  /** Seconds from the start of the clip. */
  at: number;
  utc: number;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
}

/**
 * Good position fixes from either GPS format. Older cameras give one time per payload, so
 * samples are spaced across it. HERO11 and later timestamp every sample themselves.
 */
function gpsSamples(payloads: GpmfPayload[]): GpsSample[] {
  const out: GpsSample[] = [];
  for (const [i, payload] of payloads.entries()) {
    const nine = payload.streams.get('GPS9');
    for (const [j, row] of (nine?.rows ?? []).entries()) {
      if (row[8] < MIN_FIX) continue;
      out.push({
        at: payload.t + (j / nine!.rows.length) * payload.duration,
        utc: GPS_EPOCH_2000 + row[5] * 86400 + row[6],
        lat: row[0], lon: row[1], altitude: row[2], speed: row[3],
      });
    }
    const five = payload.streams.get('GPS5');
    if (nine || !five?.utc || (five.fix ?? 0) < MIN_FIX) continue;
    const next = payloads[i + 1]?.streams.get('GPS5')?.utc;
    const span = next != null && next > five.utc ? next - five.utc : payload.duration;
    for (const [j, row] of five.rows.entries()) {
      const into = (j / five.rows.length) * span;
      out.push({ at: payload.t + into, utc: five.utc + into, lat: row[0], lon: row[1], altitude: row[2], speed: row[3] });
    }
  }
  return out.filter(s => s.lat !== 0 || s.lon !== 0);
}

/** The clip's GPS as a track on real GPS time, so it needs no matching to anything. */
export function gpsTrack(payloads: GpmfPayload[]): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const s of gpsSamples(payloads)) {
    if (points.length && s.utc <= points[points.length - 1].t) continue;
    points.push({ t: s.utc, lat: s.lat, lon: s.lon, altitude: s.altitude, speed: s.speed });
  }
  return points;
}

/** The true time of the first frame, or null if the camera never got a fix. */
export function gpsClipStart(payloads: GpmfPayload[]): number | null {
  const first = gpsSamples(payloads)[0];
  return first ? first.utc - first.at : null;
}

/** Each sample of a stream with its time in the clip. */
function timed(payloads: GpmfPayload[], key: string): { at: number; row: number[] }[] {
  return payloads.flatMap(p => {
    const rows = p.streams.get(key)?.rows ?? [];
    return rows.map((row, i) => ({ at: p.t + (i / rows.length) * p.duration, row }));
  });
}

/**
 * Turning about the vertical. The accelerometer shows which way is up, and the gyro how fast
 * the camera turns about it. They share axes, so this works however the camera is mounted.
 * Which way round the axes are isn't documented for every model, so the sign is left open.
 */
export function gyroMotion(payloads: GpmfPayload[], hz: number): Pick<ClipMotion, 'turnRate' | 'roughness'> | null {
  const gyro = timed(payloads, 'GYRO');
  const accel = timed(payloads, 'ACCL');
  if (gyro.length === 0 || accel.length === 0) return null;
  const n = Math.floor(Math.max(gyro[gyro.length - 1].at, accel[accel.length - 1].at) * hz);
  const sum = Array.from({ length: n }, () => [0, 0, 0]);
  const count = new Float64Array(n);
  const shake = new Float64Array(n);
  accel.forEach(({ at, row }, i) => {
    const bin = Math.floor(at * hz);
    if (bin >= n) return;
    for (let k = 0; k < 3; k++) sum[bin][k] += row[k];
    count[bin]++;
    if (i > 0) shake[bin] += row.reduce((total, v, k) => total + (v - accel[i - 1].row[k]) ** 2, 0);
  });
  const reach = Math.round((UP_SPAN_S * hz) / 2);
  const up = sum.map((_, bin) => {
    const v = [0, 0, 0];
    for (let j = Math.max(0, bin - reach); j <= Math.min(n - 1, bin + reach); j++) for (let k = 0; k < 3; k++) v[k] += sum[j][k];
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return v.map(c => c / length);
  });
  const turn = new Float64Array(n);
  const turnCount = new Float64Array(n);
  for (const { at, row } of gyro) {
    const bin = Math.floor(at * hz);
    if (bin >= n) continue;
    turn[bin] += -(row[0] * up[bin][0] + row[1] * up[bin][1] + row[2] * up[bin][2]);
    turnCount[bin]++;
  }
  return {
    turnRate: turn.map((v, i) => (turnCount[i] ? v / turnCount[i] : 0)),
    roughness: shake.map((v, i) => (count[i] ? Math.sqrt(v / count[i]) / STANDARD_GRAVITY : 0)),
  };
}

/** ISO, shutter speed and white balance, where this camera records them. */
export function cameraSettings(payloads: GpmfPayload[]): ClipSensors | null {
  const last = payloads[payloads.length - 1];
  if (!last) return null;
  const t = sensorTimes(last.t + last.duration);
  const series: ClipSensors['series'] = {};
  const read = (key: string) => {
    const samples = timed(payloads, key);
    return { at: samples.map(s => s.at), values: samples.map(s => s.row[0]) };
  };
  const iso = read('ISOE');
  const shutter = read('SHUT');
  const white = read('WBAL');
  if (iso.at.length) series.iso = binned(t, iso.at, iso.values);
  if (shutter.at.length) series.shutter = binned(t, shutter.at, shutter.values);
  if (white.at.length) series.whiteBalance = latest(t, white.at, white.values);
  return Object.keys(series).length ? { t, series } : null;
}

/** Returns the index of the telemetry stream, or null if the clip has none. */
export function findGpmfStream(clip: string): number | null {
  const csv = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_tag_string', '-of', 'csv=p=0', clip]).toString();
  for (const line of csv.trim().split(/\r?\n/)) {
    const [index, tag] = line.split(',');
    if (tag === 'gpmd') return Number(index);
  }
  return null;
}

let cached: { clip: string; payloads: GpmfPayload[] } | null = null;

/** Sync and the sensors each ask in turn, so the last clip read is kept. */
export function readPayloads(clip: string): GpmfPayload[] {
  if (cached?.clip === clip) return cached.payloads;
  const stream = findGpmfStream(clip);
  if (stream == null) return [];
  const csv = execFileSync('ffprobe', ['-v', 'error', '-select_streams', String(stream), '-show_entries', 'packet=pts_time,duration_time,size', '-of', 'csv=p=0', clip], { maxBuffer: 1 << 27 }).toString();
  const packets = csv.trim().split(/\r?\n/).map(line => {
    const [t, duration, size] = line.split(',').map(Number);
    return { t, duration, size };
  });
  const data = execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-map', `0:${stream}`, '-c', 'copy', '-f', 'data', '-'], { maxBuffer: 1 << 30 });
  const payloads = parsePayloads(data, packets);
  cached = { clip, payloads };
  return payloads;
}
