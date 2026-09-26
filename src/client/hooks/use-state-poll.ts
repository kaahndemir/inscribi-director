'use client';
// Hook that polls GET /api/state every second (participant screen).

import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson } from '@/lib/api';
import type { PublicState } from '@/lib/types';

const POLL_MS = 1000;

export function useStatePoll() {
  const [state, setState] = useState<PublicState | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await getJson<PublicState>('/api/state');
      setState(data);
      setFetchedAt(Date.now());
      setError(null);
    } catch {
      setError('Bağlantı koptu; son durum gösteriliyor.');
    }
  }, []);

  useEffect(() => {
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll]);

  return { state, fetchedAt, error, refresh: poll };
}
