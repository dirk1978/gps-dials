import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { genericVideo } from './generic-video.ts';
import { latest, sensorTimes } from './sensors.ts';
import type { DeviceAdapter } from './types.ts';

const FOOTER_SIZE = 72;
const MAGIC = '8db42d694ccc418790edff439fe026bf';
const RECORD_HEADER = 6;
const EXPOSURE_RECORD = 4;
const EXPOSURE_ENTRY = 16;

/** Hands back the body of one kind of record from the trailer on the end of an Insta360 file. */
function trailerRecord(clip: string, wanted: number): Buffer | null {
  const fd = openSync(clip, 'r');
  try {
    const size = fstatSync(fd).size;
    const read = (position: number, length: number) => {
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, position);
      return buffer;
    };
    if (size < FOOTER_SIZE) return null;
    const footer = read(size - FOOTER_SIZE, FOOTER_SIZE);
    if (footer.subarray(40).toString('latin1') !== MAGIC) return null;
    const trailer = footer.readUInt32LE(32);
    // Records run backwards from the footer, each with its header after its body.
    for (let off = FOOTER_SIZE; off + RECORD_HEADER <= trailer;) {
      const header = read(size - off - RECORD_HEADER, RECORD_HEADER);
      const length = header.readUInt32LE(2);
      if (header[1] === wanted) return read(size - off - RECORD_HEADER - length, length);
      off += length + RECORD_HEADER;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

export const insta360: DeviceAdapter = {
  id: 'insta360',
  name: 'Insta360 GO 3',

  canRead(clip) {
    try {
      return hasTrailer(clip);
    } catch {
      return false;
    }
  },

  readMotion: (clip, hz, upsideDown) => genericVideo.readMotion(clip, hz, upsideDown),

  /** Only the shutter speed: the files tried so far don't hold gyro records. */
  readSensors(clip) {
    const body = trailerRecord(clip, EXPOSURE_RECORD);
    if (!body || body.length < EXPOSURE_ENTRY) return null;
    const count = Math.floor(body.length / EXPOSURE_ENTRY);
    const first = Number(body.readBigUInt64LE(0));
    const at: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      at.push((Number(body.readBigUInt64LE(i * EXPOSURE_ENTRY)) - first) / 1e6);
      values.push(body.readDoubleLE(i * EXPOSURE_ENTRY + 8));
    }
    const t = sensorTimes(at[at.length - 1]);
    return { t, series: { shutter: latest(t, at, values) } };
  },
};

function hasTrailer(clip: string): boolean {
  const fd = openSync(clip, 'r');
  try {
    const size = fstatSync(fd).size;
    const magic = Buffer.alloc(MAGIC.length);
    readSync(fd, magic, 0, magic.length, size - magic.length);
    return magic.toString('latin1') === MAGIC;
  } finally {
    closeSync(fd);
  }
}
