'use client';
// Hook that polls GET /api/admin/state every second (admin + stage screens).

import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, postJson } from '@/lib/api';
import type { AdminState } from '@/lib/types';

const POLL_MS = 1000;

export function useAdminState() {
  const [state, setState] = useState<AdminState | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await getJson<AdminState>('/api/admin/state');
      setState(data);
      setFetchedAt(Date.now());
      setError(null);
      setLoggedIn(true);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setLoggedIn(false);
        setError('Giriş gerekli: özel yönetim bağlantısını açın.');
      } else {
        setError('Sunucuya ulaşılamıyor.');
      }
    }
  }, []);

  useEffect(() => {
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll]);

  // Login with admin token from URL hash
  const login = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = decodeURIComponent(window.location.hash.slice(1));
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    try {
      await postJson('/api/admin/login', { token });
      await poll();
    } catch {
      setError('Giriş bağlantısı geçersiz.');
    }
  }, [poll]);

  useEffect(() => {
    login();
  }, [login]);

  // Admin action helper
  const act = useCallback(
    async (label: string, path: string, body: Record<string, unknown> = {}) => {
      setError(`${label}…`);
      try {
        await postJson(path, body);
        setError(`${label}: tamam`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`${label}: ${msg}`);
      }
      await poll();
    },
    [poll],
  );

  return { state, fetchedAt, error, loggedIn, act, refresh: poll };
}
