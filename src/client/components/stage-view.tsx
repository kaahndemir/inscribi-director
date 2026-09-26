'use client';
// Stage view — React port of stage.mjs.
// Manages Director connection (fal.ai WebRTC), heartbeat, and direction forwarding.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAdminState } from '@/hooks/use-admin';
import { getJson, postJson } from '@/lib/api';
import { secondsLeft, formatSeconds } from '@/lib/timer';

const DIRECTION_POLL_MS = 400;
const HEARTBEAT_MS = 2000;
const RELAYED = new Set(['configured', 'prompt_applied', 'prompt_rejected', 'error', 'stream_exhausted']);

export default function StageView() {
  const { state, fetchedAt, error } = useAdminState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageIdRef = useRef(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directorRef = useRef<any>(null);
  const runningRef = useRef(false);
  const lastSentVersionRef = useRef(1);
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const [overlayText, setOverlayText] = useState<string | null>('Sahne hazırlanıyor…');
  const [showStart, setShowStart] = useState(false);
  const [startDisabled, setStartDisabled] = useState(false);
  const [directorStatus, setDirectorStatus] = useState('');

  const stageId = stageIdRef.current;

  const eventFn = useCallback(async (payload: Record<string, unknown>) => {
    postJson('/api/admin/director/event', { stageId, event: payload }).catch(() => {});
  }, [stageId]);

  const overlay = useCallback((text: string | null, opts?: { showStart?: boolean }) => {
    setOverlayText(text);
    setShowStart(opts?.showStart ?? false);
  }, []);

  // Forward direction to provider
  const forwardDirection = useCallback(async () => {
    if (!runningRef.current || !directorRef.current) return;
    try {
      const { direction } = await getJson<{ direction?: { prompt_version: number } }>(`/api/admin/director/next?stageId=${stageId}`);
      if (direction && direction.prompt_version > lastSentVersionRef.current) {
        lastSentVersionRef.current = direction.prompt_version;
        directorRef.current.send(direction);
      }
    } catch {
      // State poll decides session ownership
    }
  }, [stageId]);

  // Heartbeat
  const heartbeat = useCallback(async () => {
    try {
      await postJson('/api/admin/session/heartbeat', { stageId });
    } catch {
      void stop('Sunucu yayını kapattı.');
    }
  }, [stageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop
  const stop = useCallback(async (reason: string) => {
    if (!runningRef.current) return;
    runningRef.current = false;
    timersRef.current.forEach(clearInterval);
    timersRef.current = [];
    try { directorRef.current?.send({ type: 'stop' }); } catch {}
    try { await directorRef.current?.close(); } catch {}
    directorRef.current = null;
    void eventFn({ type: 'closed' });
    overlay(reason);
  }, [eventFn, overlay]);

  // Start live
  const startLive = useCallback(async () => {
    if (!state) return;
    const { createFalClient } = await import('@fal-ai/client');
    const { wma } = await import('@fal-ai/client/realtime');

    const fal = createFalClient({ proxyUrl: '/api/fal/proxy' });
    const director = fal.realtime.open(wma('minimax/h3-max/director'), {
      receive: ['video', 'audio'],
      negotiationTimeoutMs: 20000,
      onState: (connection: string) => setDirectorStatus(`Director: ${connection}`),
      onError: () => void stop('Director bağlantısı hata verdi.'),
      onMedia: (stream: MediaStream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = false;
          videoRef.current.play().catch(() => {});
        }
      },
      onData: (raw: string) => {
        let message;
        try { message = JSON.parse(raw); } catch { return; }
        if (RELAYED.has(message.type)) void eventFn({ type: 'provider', message });
        if (message.type === 'stream_exhausted') void stop('Director akışı sona erdi.');
      },
    });

    directorRef.current = director;
    director.send({
      type: 'configure',
      protocol_version: 1,
      prompt_version: 1,
      resolution: '480p',
      aspect_ratio: '16:9',
      memory: 3,
      prompt: state.story.opening,
    });

    if (videoRef.current) {
      videoRef.current.requestVideoFrameCallback(() => {
        overlay(null);
        void eventFn({ type: 'first-frame' });
      });
    }

    timersRef.current.push(setInterval(forwardDirection, DIRECTION_POLL_MS));
  }, [state, stop, eventFn, overlay, forwardDirection]);

  // Start fake
  const startFake = useCallback(() => {
    setDirectorStatus('Director: prova modu (video yok)');
    overlay('Prova modu: gerçek video üretilmiyor.');
    void eventFn({ type: 'configured' });
    void eventFn({ type: 'first-frame' });
  }, [eventFn, overlay]);

  // Start session
  const start = useCallback(async () => {
    if (!state) return;
    setStartDisabled(true);
    try {
      await postJson('/api/admin/session/start', { stageId });
    } catch (err: unknown) {
      setStartDisabled(false);
      const msg = err instanceof Error ? err.message : String(err);
      return overlay(`Yayın başlatılamadı: ${msg}`, { showStart: true });
    }
    runningRef.current = true;
    lastSentVersionRef.current = 1;
    overlay('Director bağlanıyor…');
    timersRef.current.push(setInterval(heartbeat, HEARTBEAT_MS));
    if (state.settings.directorMode === 'fake') return startFake();
    startLive();
  }, [state, stageId, heartbeat, startFake, startLive, overlay]);

  // Update overlay based on state changes
  useEffect(() => {
    if (!state) return;
    const { session } = state;

    if (!runningRef.current) {
      const canStart = session.status !== 'live' && session.remaining > 0 && !state.stale;
      if (session.status === 'live') overlay('Yayın başka bir sahne sekmesinde açık.');
      else if (canStart) overlay(session.attempts ? 'Yayın kapandı. Yeni yayın bir hak harcar.' : 'Sahne hazır.', { showStart: true });
      else overlay(session.remaining === 0 ? 'Yayın hakları kullanıldı.' : 'Zincir bağlantısı bekleniyor…');
    } else if (session.status !== 'live') {
      void stop(session.reason === 'time-limit' ? 'Süre doldu, yayın kapandı.' : 'Yayın kapandı.');
    }
  }, [state, overlay, stop]);

  // Cleanup on unmount
  useEffect(() => {
    const cleanup = () => void stop('Sayfa kapandı.');
    window.addEventListener('pagehide', cleanup);
    return () => {
      window.removeEventListener('pagehide', cleanup);
      void stop('Bileşen kaldırıldı.');
    };
  }, [stop]);

  if (!state) {
    return (
      <div className="stage">
        <div className="stage-grid">
          <section className="screen">
            <div className="screen-overlay">
              <div className="overlay-box"><p>{error ?? 'Bağlanıyor…'}</p></div>
            </div>
          </section>
          <aside className="panel">
            <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>inscribi <b>director</b></span></div>
          </aside>
        </div>
      </div>
    );
  }

  const { round, session } = state;
  const countdown = round ? secondsLeft(round, state.blockTime, fetchedAt) : 0;
  const showWinner = round?.finalized && round.winner !== null;

  return (
    <div className="stage">
      <div className="stage-grid">
        <section className="screen">
          <video ref={videoRef} autoPlay playsInline />
          {overlayText !== null && (
            <div className="screen-overlay">
              <div className="overlay-box">
                <p>{overlayText}</p>
                {showStart && (
                  <button className="primary large" onClick={start} disabled={startDisabled}>
                    Yayını başlat
                  </button>
                )}
                <p className="muted">
                  Kalan yayın hakkı: {session.remaining}/{session.maxSessions} · en fazla {Math.round(session.maxMs / 1000)} sn
                </p>
              </div>
            </div>
          )}
          {showWinner && (
            <div className="winner-banner">Seçilen: {round!.labels[round!.winner!]}</div>
          )}
          <div className="director-status">{directorStatus}</div>
        </section>

        <aside className="panel">
          <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>inscribi <b>director</b></span></div>
          <div className="join">
            <img src="/qr.svg" alt="Katılım QR kodu" className="qr" />
            <p className="join-url">{state.joinUrl?.replace(/^https?:\/\//, '') ?? ''}</p>
          </div>
          <div className="stage-round">
            <div className="round-head">
              <h2>{round ? `Tur ${round.step}/${round.steps}` : session.status === 'live' ? 'İlk tur birazdan' : 'Oylama birazdan'}</h2>
              <span className="countdown">{round ? formatSeconds(countdown) : ''}</span>
            </div>
            {round && (
              <ol className="tally">
                {round.labels.map((label, i) => {
                  const total = round.counts.reduce((a, b) => a + b, 0);
                  const share = total ? Math.round((round.counts[i] / total) * 100) : 0;
                  const isWinner = round.finalized && round.winner === i;
                  return (
                    <li key={i} className={`choice ${isWinner ? 'winner' : ''}`} style={{ '--share': `${share}%` } as React.CSSProperties}>
                      <span className="choice-label">{label}</span>
                      <span className="choice-count">{round.counts[i]} oy</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <p className="panel-footer">Monad testnet üzerinde her oy bir işlemdir.</p>
        </aside>
      </div>
    </div>
  );
}
