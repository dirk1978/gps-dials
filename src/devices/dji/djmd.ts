import { execFileSync } from 'node:child_process';
import type { MotionSample } from '../types.ts';

interface Field {
  no: number;
  wire: number;
  value?: bigint;
  float?: number;
  start?: number;
  end?: number;
}

function readVarint(b: Buffer, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const byte = b[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return [result, pos];
    shift += 7n;
  }
}

function fields(b: Buffer, start: number, end: number): Field[] {
  const out: Field[] = [];
  let p = start;
  while (p < end) {
    const [tag, next] = readVarint(b, p);
    const no = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    p = next;
    if (wire === 0) {
      const [value, n] = readVarint(b, p);
      out.push({ no, wire, value });
      p = n;
    } else if (wire === 5) {
      out.push({ no, wire, float: b.readFloatLE(p) });
      p += 4;
    } else if (wire === 1) {
      p += 8;
    } else if (wire === 2) {
      const [len, n] = readVarint(b, p);
      out.push({ no, wire, start: n, end: n + Number(len) });
      p = n + Number(len);
    } else {
      throw new Error(`Unexpected protobuf wire type ${wire}`);
    }
  }
  return out;
}

function child(b: Buffer, parent: Field | undefined, no: number): Field | undefined {
  if (parent?.start == null) return undefined;
  return fields(b, parent.start, parent.end!).find(f => f.no === no);
}

function floats(b: Buffer, parent: Field | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (parent?.start == null) return out;
  for (const f of fields(b, parent.start, parent.end!)) if (f.float != null) out.set(f.no, f.float);
  return out;
}

/** Returns the index of the `djmd` data stream, or null if the clip has none. */
export function findDjmdStream(clip: string): number | null {
  const csv = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_tag_string', '-of', 'csv=p=0', clip]);
  for (const line of csv.trim().split(/\r?\n/)) {
    const [index, tag] = line.split(',');
    if (tag === 'djmd') return Number(index);
  }
  return null;
}

/**
 * Reads per-frame orientation and acceleration from a DJI `djmd` track.
 * Layout seen in dvtm_ac203 (Osmo Action 4): top-level field 3 holds the frame,
 * 3.1.2 is a microsecond clock, 3.2.9 the orientation and 3.2.10 the accelerometer.
 * The accelerometer omits any axis that is exactly zero, so missing axes read as 0.
 */
export function readDjmdMotion(clip: string): MotionSample[] {
  const stream = findDjmdStream(clip);
  if (stream == null) return [];

  const sizes = run('ffprobe', ['-v', 'error', '-select_streams', String(stream), '-show_entries', 'packet=size', '-of', 'csv=p=0', clip])
    .trim().split(/\r?\n/).map(s => parseInt(s, 10));
  const data = execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-map', `0:${stream}`, '-c', 'copy', '-f', 'data', '-'], { maxBuffer: 1 << 30 });

  const samples: MotionSample[] = [];
  let firstClock: bigint | null = null;
  let off = 0;
  for (const size of sizes) {
    const frame = fields(data, off, off + size).find(f => f.no === 3);
    off += size;
    const clock = child(data, child(data, frame, 1), 2)?.value;
    const body = child(data, frame, 2);
    const q = floats(data, child(data, body, 9));
    const a = floats(data, child(data, body, 10));
    if (clock == null || q.size < 4) continue;
    firstClock ??= clock;
    samples.push({
      t: Number(clock - firstClock) / 1e6,
      q: [q.get(1)!, q.get(2)!, q.get(3)!, q.get(4)!],
      accel: [a.get(2) ?? 0, a.get(3) ?? 0, a.get(4) ?? 0],
    });
  }
  return samples;
}

/** The first `djmd` packet names its schema, e.g. `dvtm_ac203.proto`. */
export function readDjmdProtocol(clip: string): string | null {
  const stream = findDjmdStream(clip);
  if (stream == null) return null;
  const first = execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-map', `0:${stream}`, '-c', 'copy', '-frames:d', '1', '-f', 'data', '-'], { maxBuffer: 1 << 20 });
  return first.toString('latin1').match(/dvtm_\w+\.proto/)?.[0] ?? null;
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { maxBuffer: 1 << 27 }).toString();
}
