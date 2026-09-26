// Timer helpers ported from shared.mjs.

export interface RoundData {
  id: number;
  step: number;
  steps: number;
  open: boolean;
  deadline: number;
  labels: string[];
  counts: number[];
  fee: string;
  finalized: boolean;
  cancelled: boolean;
  winner: number | null;
}

/** Seconds left in a round, measured on chain time and advanced locally between polls. */
export function secondsLeft(round: RoundData | null, blockTime: number | null, fetchedAt: number): number {
  if (!round?.open || blockTime === null) return 0;
  const chainNow = blockTime + (Date.now() - fetchedAt) / 1000;
  return Math.max(0, Math.ceil(round.deadline - chainNow));
}

export function formatSeconds(seconds: number): string {
  return seconds > 0 ? `${seconds} sn` : '';
}
