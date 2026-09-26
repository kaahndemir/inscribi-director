// Shared types for backend API responses.

import type { RoundData } from './timer';

export interface DirectorState {
  live: boolean;
}

/** Shape of GET /api/state (public participant state). */
export interface PublicState {
  round: RoundData | null;
  blockTime: number | null;
  stale: boolean;
  cancelledRounds: number[];
  fees: { maxFeePerGas: string; maxPriorityFeePerGas: string } | null;
  director: DirectorState;
  joinUrl: string;
}

export interface SessionSnapshot {
  status: 'idle' | 'live' | 'ended';
  reason?: string;
  elapsedMs: number;
  maxMs: number;
  remaining: number;
  maxSessions: number;
  attempts: number;
  configured?: boolean;
}

export interface BridgeEntry {
  round: number;
  choice: number;
  version: number;
  status: string;
}

/** Shape of GET /api/admin/state. */
export interface AdminState {
  session: SessionSnapshot;
  round: RoundData | null;
  blockTime: number | null;
  stale: boolean;
  bridge: { entries: BridgeEntry[] };
  drip: { funded: number; reserved: number; limit: number; amountMon: string };
  operator: { address: string; balanceMon: string | null };
  story: { opening: string };
  settings: {
    directorMode: string;
    autoRounds: boolean;
    roundSeconds: number;
  };
  listPriceUsd: number;
  lastError: string | null;
  joinUrl: string;
}
