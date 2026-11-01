export interface ClockVote {
  /** When the clip's clock says it started. */
  clockTime: number;
  /** Seconds the camera clock is ahead of the track, according to this clip. */
  error: number;
}

const BIN_S = 3;
const INLIER_S = 6;
const MIN_INLIERS = 3;
const NEIGHBOURS = 5;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Keeps the votes around the most common clock error. A camera's clock is wrong by
 * about the same amount all day, so a good match elsewhere in the ride scores well
 * by chance but lands far from the crowd. Returns nothing without a clear crowd.
 */
export function clockInliers(votes: ClockVote[]): ClockVote[] {
  const bins = new Map<number, number>();
  for (const v of votes) {
    const bin = Math.round(v.error / BIN_S);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  let centre = 0;
  let most = 0;
  for (const [bin] of bins) {
    const count = (bins.get(bin - 1) ?? 0) + (bins.get(bin) ?? 0) + (bins.get(bin + 1) ?? 0);
    if (count > most) {
      most = count;
      centre = bin * BIN_S;
    }
  }
  const inliers = votes.filter(v => Math.abs(v.error - centre) <= INLIER_S);
  return inliers.length >= MIN_INLIERS ? inliers : [];
}

/** The clock error around `time`, from the nearest trusted clips, so slow drift or a clock step is followed. */
export function localClockError(time: number, inliers: ClockVote[]): number {
  const nearest = [...inliers].sort((a, b) => Math.abs(a.clockTime - time) - Math.abs(b.clockTime - time)).slice(0, NEIGHBOURS);
  return median(nearest.map(v => v.error));
}
