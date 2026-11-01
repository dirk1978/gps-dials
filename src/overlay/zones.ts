import type { ChannelId } from './channels.ts';

export interface Zone {
  upTo: number;
  color: string;
}

/** The rider's own numbers, which zones are worked out from. */
export interface Rider {
  maxHeartRate: number;
  ftp: number;
}

export const DEFAULT_RIDER: Rider = { maxHeartRate: 185, ftp: 200 };

const GREY = '#9aa3b2';
const BLUE = '#4a9eff';
const GREEN = '#4fd67a';
const YELLOW = '#ffc23d';
const ORANGE = '#ff8a3d';
const RED = '#ff4d5e';
const NO_LIMIT = 100000;

/** Standard zones for data that has them, or nothing where zones wouldn't mean anything. */
export function defaultZones(channel: ChannelId, rider: Rider): Zone[] | null {
  const heart = (share: number) => Math.round(rider.maxHeartRate * share);
  const power = (share: number) => Math.round(rider.ftp * share);
  switch (channel) {
    case 'heartRate':
      // Five zones as percentages of maximum heart rate.
      return [
        { upTo: heart(0.6), color: GREY },
        { upTo: heart(0.7), color: BLUE },
        { upTo: heart(0.8), color: GREEN },
        { upTo: heart(0.9), color: YELLOW },
        { upTo: NO_LIMIT, color: RED },
      ];
    case 'power':
      // The usual cycling zones as percentages of FTP, from recovery up to anaerobic.
      return [
        { upTo: power(0.55), color: GREY },
        { upTo: power(0.75), color: BLUE },
        { upTo: power(0.9), color: GREEN },
        { upTo: power(1.05), color: YELLOW },
        { upTo: power(1.2), color: ORANGE },
        { upTo: NO_LIMIT, color: RED },
      ];
    case 'cadence':
      return [
        { upTo: 60, color: GREY },
        { upTo: 75, color: BLUE },
        { upTo: 95, color: GREEN },
        { upTo: 110, color: YELLOW },
        { upTo: NO_LIMIT, color: RED },
      ];
    case 'gradient':
      return [
        { upTo: -2, color: BLUE },
        { upTo: 3, color: GREEN },
        { upTo: 6, color: YELLOW },
        { upTo: 10, color: ORANGE },
        { upTo: NO_LIMIT, color: RED },
      ];
    default:
      return null;
  }
}
