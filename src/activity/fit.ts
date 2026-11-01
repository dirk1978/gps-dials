import { readFileSync } from 'node:fs';
import type { TrackPoint } from './types.ts';

interface FieldDef {
  no: number;
  size: number;
  baseType: number;
}

interface MessageDef {
  global: number;
  littleEndian: boolean;
  fields: FieldDef[];
  /** Bytes of developer fields, which are skipped. */
  extraSize: number;
}

const RECORD_MESSAGE = 20;
const FIT_EPOCH_UNIX = 631065600;
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;

const BASE_SINT32 = 0x85;

/** Reads an unsigned value of 1, 2 or 4 bytes, or undefined for FIT's "invalid" marker. */
function readUnsigned(b: Uint8Array, view: DataView, pos: number, size: number, le: boolean): number | undefined {
  if (size === 1) return b[pos] === 0xff ? undefined : b[pos];
  if (size === 2) {
    const v = view.getUint16(pos, le);
    return v === 0xffff ? undefined : v;
  }
  if (size === 4) {
    const v = view.getUint32(pos, le);
    return v === 0xffffffff ? undefined : v;
  }
  return undefined;
}

function readSint32(view: DataView, pos: number, le: boolean): number | undefined {
  const v = view.getInt32(pos, le);
  return v === 0x7fffffff ? undefined : v;
}

const FILE_ID_MESSAGE = 0;
const MANUFACTURERS: Record<number, string> = { 1: 'Garmin', 32: 'Wahoo', 255: 'Development device', 260: 'Zwift', 265: 'Coros', 289: 'Hammerhead' };

export interface FitActivity {
  points: TrackPoint[];
  /** Maker's name, when the file names one we know. */
  device?: string;
}

export function parseFit(bytes: Uint8Array): TrackPoint[] {
  return parseFitActivity(bytes).points;
}

export function parseFitActivity(bytes: Uint8Array): FitActivity {
  let device: string | undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = bytes[0];
  if (String.fromCharCode(...bytes.subarray(8, 12)) !== '.FIT') throw new Error('Not a FIT file');
  const end = headerSize + view.getUint32(4, true);

  const defs = new Map<number, MessageDef>();
  const points: TrackPoint[] = [];
  let lastTimestamp = 0;
  let pos = headerSize;

  while (pos < end) {
    const header = bytes[pos++];
    let local: number;
    let compressedOffset: number | null = null;

    if (header & 0x80) {
      local = (header >> 5) & 0x03;
      compressedOffset = header & 0x1f;
    } else if (header & 0x40) {
      local = header & 0x0f;
      const littleEndian = bytes[pos + 1] === 0;
      const global = view.getUint16(pos + 2, littleEndian);
      const count = bytes[pos + 4];
      pos += 5;
      const fields: FieldDef[] = [];
      for (let i = 0; i < count; i++, pos += 3) {
        fields.push({ no: bytes[pos], size: bytes[pos + 1], baseType: bytes[pos + 2] });
      }
      let extraSize = 0;
      if (header & 0x20) {
        const devCount = bytes[pos++];
        for (let i = 0; i < devCount; i++, pos += 3) extraSize += bytes[pos + 1];
      }
      defs.set(local, { global, littleEndian, fields, extraSize });
      continue;
    } else {
      local = header & 0x0f;
    }

    const def = defs.get(local);
    if (!def) throw new Error(`FIT data message uses undefined local type ${local}`);

    if (compressedOffset != null) {
      const base = lastTimestamp & ~0x1f;
      const rolled = compressedOffset < (lastTimestamp & 0x1f) ? 0x20 : 0;
      lastTimestamp = base + compressedOffset + rolled;
    }

    const le = def.littleEndian;
    const values = new Map<number, number | undefined>();
    let p = pos;
    for (const f of def.fields) {
      if (f.no === 253 && f.size === 4) {
        const ts = readUnsigned(bytes, view, p, 4, le);
        if (ts != null) lastTimestamp = ts;
      } else if (def.global === RECORD_MESSAGE) {
        const signed = f.baseType === BASE_SINT32 && f.size === 4;
        values.set(f.no, signed ? readSint32(view, p, le) : readUnsigned(bytes, view, p, f.size, le));
      } else if (def.global === FILE_ID_MESSAGE && f.no === 1 && f.size === 2) {
        device = MANUFACTURERS[view.getUint16(p, le)];
      }
      p += f.size;
    }
    pos = p + def.extraSize;

    if (def.global !== RECORD_MESSAGE) continue;
    const lat = values.get(0);
    const lon = values.get(1);
    if (lat == null || lon == null) continue;
    const speed = values.get(73) ?? values.get(6);
    const altitude = values.get(78) ?? values.get(2);
    points.push({
      t: lastTimestamp + FIT_EPOCH_UNIX,
      lat: lat * SEMICIRCLES_TO_DEGREES,
      lon: lon * SEMICIRCLES_TO_DEGREES,
      speed: speed != null ? speed / 1000 : undefined,
      heartRate: values.get(3),
      altitude: altitude != null ? altitude / 5 - 500 : undefined,
    });
  }
  return { points, device };
}

export function readFit(path: string): TrackPoint[] {
  return parseFit(readFileSync(path));
}
