'use client';
// Admin console — React port of admin.mjs.
// All API interactions go through the existing backend endpoints.

import { useRef } from 'react';
import { useAdminState } from '@/hooks/use-admin';
import { secondsLeft } from '@/lib/timer';

const STATUS_TEXT: Record<string, string> = { idle: 'Hazır', live: 'Canlı', ended: 'Kapandı' };
const END_REASON: Record<string, string> = {
  'time-limit': 'süre doldu',
  'stage-lost': 'sahne sekmesi koptu',
  'stage-closed': 'sahne kapattı',
  operator: 'operatör durdurdu',
  interrupted: 'sunucu yeniden başladı',
  shutdown: 'sunucu kapandı',
  'provider-error': 'sağlayıcı hatası',
};
const DIRECTION_TEXT: Record<string, string> = {
  waiting: 'gönderildi, yanıt bekleniyor',
  applied: 'kabul edildi',
  rejected: 'reddedildi',
  abandoned: 'bırakıldı',
};

function DL({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.map(([term, value], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminConsole() {
  const { state, fetchedAt, error, act } = useAdminState();
  const durationRef = useRef<HTMLInputElement>(null);

  if (!state) {
    return (
      <main className="console">
        <header className="console-header">
          <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>inscribi <b>director</b></span></div>
        </header>
        <p className="status" role="status" aria-live="polite">{error ?? 'Bağlanıyor…'}</p>
      </main>
    );
  }

  const { session, round, bridge, drip, operator, settings } = state;
  const elapsed = Math.round(session.elapsedMs / 1000);
  const countdown = round ? secondsLeft(round, state.blockTime, fetchedAt) : 0;

  return (
    <main className="console">
      <header className="console-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>inscribi <b>director</b></span></div>
        <a className="secondary link" href="/stage" target="_blank" rel="noopener">Sahneyi aç</a>
      </header>
      <p className="status" role="status" aria-live="polite">{error ?? ''}</p>

      <section className="console-grid">
        {/* Director */}
        <article className="card">
          <h2>Director</h2>
          <DL rows={[
            ['Durum', `${STATUS_TEXT[session.status] ?? session.status}${session.reason ? ` (${END_REASON[session.reason] ?? session.reason})` : ''}`],
            ['Süre', `${elapsed} / ${Math.round(session.maxMs / 1000)} sn`],
            ['Kalan yayın hakkı', `${session.remaining} / ${session.maxSessions}`],
            ['Mod', settings.directorMode === 'live' ? 'Canlı fal Director' : 'Prova (video yok)'],
            ['Liste fiyatıyla son oturum', `${state.listPriceUsd.toFixed(2)} USD`],
          ]} />
          <div className="actions">
            <button
              className="danger"
              disabled={session.status !== 'live'}
              onClick={() => {
                if (confirm('Yayın durdurulsun mu? Açık tur iptal edilir ve bu yayın hakkı geri gelmez.')) {
                  void act('Yayın durduruluyor', '/api/admin/session/stop');
                }
              }}
            >
              Yayını durdur
            </button>
          </div>
        </article>

        {/* Tur */}
        <article className="card">
          <h2>Tur</h2>
          <DL rows={round ? [
            ['Zincir turu', `#${round.id} · hikâye adımı ${round.step}/${round.steps}`],
            ['Durum', round.cancelled ? 'İptal' : round.finalized ? 'Sonuçlandı' : round.open ? `Açık · ${countdown} sn` : '-'],
            ['Oylar', round.labels.map((label, i) => `${label}: ${round.counts[i]}`).join(' · ')],
            ['Kazanan', round.winner === null ? '-' : round.labels[round.winner]],
          ] : [['Tur', 'Henüz açılmadı']]} />
          <div className="actions">
            <label>Süre (sn) <input ref={durationRef} type="number" min={5} max={600} step={1} defaultValue={settings.roundSeconds} /></label>
            <button className="primary" disabled={session.status !== 'live' || !!round?.open} onClick={() => void act('Tur açılıyor', '/api/admin/round/open', { duration: Number(durationRef.current?.value ?? settings.roundSeconds) })}>
              Turu aç
            </button>
            <button className="secondary" disabled={!round?.open} onClick={() => void act('Tur sonuçlandırılıyor', '/api/admin/round/finalize')}>
              Sonuçlandır
            </button>
            <button className="secondary" disabled={!round?.open} onClick={() => {
              if (confirm('Açık tur iptal edilsin mi?')) void act('Tur iptal ediliyor', '/api/admin/round/cancel');
            }}>
              İptal et
            </button>
          </div>
        </article>

        {/* Yönlendirmeler */}
        <article className="card">
          <h2>Yönlendirmeler</h2>
          <ol className="log">
            {bridge.entries.slice(-6).map((entry, i) => (
              <li key={i}>Tur #{entry.round} → seçenek {entry.choice + 1}, sürüm {entry.version}: {DIRECTION_TEXT[entry.status] ?? entry.status}</li>
            ))}
          </ol>
          <div className="actions">
            <button
              className="secondary"
              disabled={!bridge.entries.some(e => e.status === 'waiting')}
              onClick={() => void act('Bekleyen yönlendirme bırakılıyor', '/api/admin/direction/abandon')}
            >
              Bekleyeni bırak
            </button>
          </div>
        </article>

        {/* Zincir ve bakiye */}
        <article className="card">
          <h2>Zincir ve bakiye</h2>
          <DL rows={[
            ['Bağlantı', state.stale ? 'Yenileniyor' : 'Canlı'],
            ['Operatör cüzdanı', `${operator.address.slice(0, 8)}… · ${operator.balanceMon ?? '?'} MON`],
            ['Demo bakiye verilen', `${drip.funded} / ${drip.limit} kişi (${drip.amountMon} MON)`],
            ['Otomatik turlar', settings.autoRounds ? `Açık · ${settings.roundSeconds} sn` : 'Kapalı'],
            ['Son hata', state.lastError ?? '-'],
          ]} />
        </article>
      </section>
    </main>
  );
}
