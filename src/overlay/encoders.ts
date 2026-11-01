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
  { name: 'CPU', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'] },
];

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
