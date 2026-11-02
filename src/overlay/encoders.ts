import { execFileSync } from 'node:child_process';

export interface H264Encoder {
  name: string;
  args: string[];
}

/** Best first. CPU is last because it works everywhere, however slowly. */
export const H264_ENCODERS: H264Encoder[] = [
  { name: 'NVIDIA GPU', args: ['-c:v', 'h264_nvenc', '-preset', 'p3', '-rc', 'vbr', '-cq', '23', '-b:v', '0'] },
  { name: 'Intel GPU', args: ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '23'] },
  { name: 'AMD GPU', args: ['-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23'] },
  { name: 'Apple GPU', args: ['-c:v', 'h264_videotoolbox', '-q:v', '60'] },
  { name: 'CPU', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'] },
];

import type { VideoCodec } from './video-settings.ts';

export interface VideoEncoder {
  name: string;
  encoder: string;
  extra: string[];
  /** Takes a target rate but not a peak rate. */
  noPeak?: boolean;
}

const HEVC_TAG = ['-tag:v', 'hvc1'];

/** Best first, for finished video at a chosen rate. CPU is last because it works everywhere, however slowly. */
export const VIDEO_ENCODERS: Record<VideoCodec, VideoEncoder[]> = {
  h264: [
    { name: 'NVIDIA GPU', encoder: 'h264_nvenc', extra: ['-preset', 'p4', '-rc', 'vbr'] },
    { name: 'Intel GPU', encoder: 'h264_qsv', extra: ['-preset', 'medium'] },
    { name: 'AMD GPU', encoder: 'h264_amf', extra: ['-rc', 'vbr_peak'] },
    { name: 'Apple GPU', encoder: 'h264_videotoolbox', extra: [], noPeak: true },
    { name: 'CPU', encoder: 'libx264', extra: ['-preset', 'veryfast'] },
  ],
  hevc: [
    { name: 'NVIDIA GPU', encoder: 'hevc_nvenc', extra: ['-preset', 'p4', '-rc', 'vbr', ...HEVC_TAG] },
    { name: 'Intel GPU', encoder: 'hevc_qsv', extra: ['-preset', 'medium', ...HEVC_TAG] },
    { name: 'AMD GPU', encoder: 'hevc_amf', extra: ['-rc', 'vbr_peak', ...HEVC_TAG] },
    { name: 'Apple GPU', encoder: 'hevc_videotoolbox', extra: HEVC_TAG, noPeak: true },
    { name: 'CPU', encoder: 'libx265', extra: ['-preset', 'veryfast', ...HEVC_TAG] },
  ],
  av1: [
    { name: 'NVIDIA GPU', encoder: 'av1_nvenc', extra: ['-preset', 'p4', '-rc', 'vbr'] },
    { name: 'Intel GPU', encoder: 'av1_qsv', extra: ['-preset', 'medium'] },
    { name: 'AMD GPU', encoder: 'av1_amf', extra: ['-rc', 'vbr_peak'] },
    { name: 'CPU', encoder: 'libsvtav1', extra: ['-preset', '8'], noPeak: true },
  ],
};

export function encoderArgs(encoder: VideoEncoder, kbps: number): string[] {
  const peak = encoder.noPeak ? [] : ['-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`];
  return ['-c:v', encoder.encoder, ...encoder.extra, '-b:v', `${kbps}k`, ...peak];
}

const bestByCodec = new Map<VideoCodec, VideoEncoder | null>();

/** Null if nothing here can write this format. */
export function bestVideoEncoder(codec: VideoCodec): VideoEncoder | null {
  if (!bestByCodec.has(codec)) {
    bestByCodec.set(codec, VIDEO_ENCODERS[codec].find(e => works({ name: e.name, args: encoderArgs(e, 2000) })) ?? null);
  }
  return bestByCodec.get(codec)!;
}

let chosen: H264Encoder | null = null;

function works(encoder: H264Encoder): boolean {
  try {
    execFileSync('ffmpeg', [
      '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=0.1', '-frames:v', '1',
      '-pix_fmt', 'yuv420p', ...encoder.args, '-f', 'null', '-',
    ], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Being listed in FFmpeg doesn't mean the hardware is there, so each one is tried on a tiny test. */
export function bestH264Encoder(): H264Encoder {
  chosen ??= H264_ENCODERS.find(works) ?? H264_ENCODERS[H264_ENCODERS.length - 1];
  return chosen;
}
