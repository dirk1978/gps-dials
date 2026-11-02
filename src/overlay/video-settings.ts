export type VideoCodec = 'h264' | 'hevc' | 'av1';

export interface VideoSettings {
  /** A finished video, or overlay files for a video editor. */
  kind: 'video' | 'overlays';
  frame: 'original' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';
  /** The shorter side in pixels, whichever way round the frame is. */
  resolution: 'original' | '2160' | '1440' | '1080' | '720' | 'custom';
  customWidth: number;
  customHeight: number;
  fps: 'original' | '24' | '25' | '30' | '50' | '60' | 'custom';
  customFps: number;
  codec: VideoCodec;
  /** Mbps. */
  bitrate: 'original' | '100' | '60' | '40' | '20' | '10' | '5' | 'custom';
  customBitrate: number;
  /** Where the crop sits, from 0 at the left or top to 1 at the right or bottom. */
  cropX: number;
  cropY: number;
  audio: boolean;
  dials: boolean;
  /** One file, or one per clip. */
  join: boolean;
}

export const DEFAULT_VIDEO: VideoSettings = {
  kind: 'video', frame: 'original', resolution: 'original', customWidth: 1920, customHeight: 1080, fps: 'original', customFps: 30,
  codec: 'h264', bitrate: 'original', customBitrate: 20, cropX: 0.5, cropY: 0.5, audio: true, dials: true, join: true,
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export interface Size {
  width: number;
  height: number;
}

/** The shape chosen for the finished video, or null to keep each clip's own. */
export function frameAspect(s: VideoSettings): number | null {
  if (s.resolution === 'custom') return s.customWidth / s.customHeight;
  if (s.frame === 'original') return null;
  const [w, h] = s.frame.split(':').map(Number);
  return w / h;
}

/** The finished size. Cropping never adds pixels unless a larger size was asked for. */
export function outputSize(source: Size, s: VideoSettings): Size {
  if (s.resolution === 'custom') return { width: even(s.customWidth), height: even(s.customHeight) };
  const aspect = frameAspect(s) ?? source.width / source.height;
  if (s.resolution === 'original') {
    const height = source.width / aspect;
    return height <= source.height
      ? { width: even(source.width), height: even(height) }
      : { width: even(source.height * aspect), height: even(source.height) };
  }
  const short = Number(s.resolution);
  return aspect >= 1 ? { width: even(short * aspect), height: short } : { width: short, height: even(short / aspect) };
}

export function outputFps(sourceFps: string, s: VideoSettings): string {
  if (s.fps === 'original') return sourceFps;
  return String(s.fps === 'custom' ? s.customFps : Number(s.fps));
}

/** Same as the original means the same quality, so a smaller frame needs proportionally less. */
export function outputKbps(sourceKbps: number, source: Size, size: Size, s: VideoSettings): number {
  if (s.bitrate === 'custom') return Math.round(s.customBitrate * 1000);
  if (s.bitrate !== 'original') return Number(s.bitrate) * 1000;
  const fraction = Math.min(1, (size.width * size.height) / (source.width * source.height));
  return Math.max(1000, Math.round(sourceKbps * fraction));
}

const ROTATIONS: Record<number, string> = { 90: 'transpose=1,', 180: 'hflip,vflip,', 270: 'transpose=2,' };

/** Fills the frame and crops what's left over. With dials, they go on last so nothing cuts them off. */
export function videoFilter(size: Size, fps: string, rotation: number, cropX: number, cropY: number, dials: boolean): string {
  const { width, height } = size;
  const picture = `[0:v]${ROTATIONS[rotation] ?? ''}scale=${width}:${height}:force_original_aspect_ratio=increase,`
    + `crop=${width}:${height}:(iw-ow)*${cropX}:(ih-oh)*${cropY},setsar=1,fps=${fps}`;
  return dials
    ? `${picture}[picture];[1:v]format=rgba[dials];[picture][dials]overlay=eof_action=repeat,format=yuv420p[out]`
    : `${picture},format=yuv420p[out]`;
}
