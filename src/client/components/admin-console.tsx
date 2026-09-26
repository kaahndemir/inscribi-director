'use client';
// Admin console — React port of admin.mjs.
// All API interactions go through the existing backend endpoints.

import { useRef } from 'react';
import { Activity, Layers3, Radio, Sparkles, Wallet } from 'lucide-react';
import { ArenaShell } from '@/components/arena-shell';
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
      <ArenaShell view="admin">
        <main className="console"><section className="arena operator-empty">
          <span className="topic"><Radio size={14} /> YÖNETİM PANELİ</span>
          <h1>Sahneye bağlanıyor.</h1>
          <p className="status" role="status" aria-live="polite">{error ?? 'Bağlanıyor…'}</p>
        </section></main>
      </ArenaShell>
    );
  }

  const { session, round, bridge, drip, operator, settings } = state;
  const elapsed = Math.round(session.elapsedMs / 1000);
  const countdown = round ? secondsLeft(round, state.blockTime, fetchedAt) : 0;

  return (
    <ArenaShell view="admin">
    <main className="console">
      <div className="operator-intro">
        <div><span className="topic"><Sparkles size={14} /> KONTROL SENDE</span>
          <h1>Sahneyi <span>yönet.</span></h1>
          <p>Yayını takip et, turları aç, topluluğun seçimini sahneye taşı.</p>
        </div>
        <span className="round-status"><i />{state.stale ? 'BAĞLANTI BEKLENİYOR' : session.status === 'live' ? 'YAYIN CANLI' : 'YAYIN BEKLENİYOR'}</span>
      </div>
      {error && <p className="status operator-message" role="status" aria-live="polite">{error}</p>}
      <section className="operator-metrics" aria-label="Yayın özeti">
        <div><span>Yayın durumu</span><strong>{STATUS_TEXT[session.status] ?? session.status}</strong></div>
        <div><span>Kalan yayın hakkı</span><strong>{session.remaining}<small> / {session.maxSessions}</small></strong></div>
        <div><span>Aktif tur</span><strong>{round ? String(round.step).padStart(2, '0') : '—'}<small>{round ? ` / ${round.steps}` : ''}</small></strong></div>
        <div><span>Toplam oy · bu tur</span><strong>{round ? round.counts.reduce((a, b) => a + b, 0) : 0}</strong></div>
      </section>

      <section className="console-grid">
        {/* Director */}
        <article className="arena operator-card">
          <div className="arena-top"><span className="topic"><Radio size={14} />YAYIN</span></div><div className="operator-card-body"><h2>Director</h2>
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
        </div></article>

        {/* Tur */}
        <article className="arena operator-card">
          <div className="arena-top"><span className="topic"><Layers3 size={14} />OYLAMA</span></div><div className="operator-card-body"><h2>Tur</h2>
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
        </div></article>

        {/* Yönlendirmeler */}
        <article className="arena operator-card">
          <div className="arena-top"><span className="topic"><Activity size={14} />AKIŞ</span></div><div className="operator-card-body"><h2>Yönlendirmeler</h2>
          {bridge.entries.length === 0 && <p className="operator-placeholder">Henüz yönlendirme yok. İlk turun sonucu burada görünecek.</p>}
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
        </div></article>

        {/* Zincir ve bakiye */}
        <article className="arena operator-card">
          <div className="arena-top"><span className="topic"><Wallet size={14} />MONAD TESTNET</span></div><div className="operator-card-body"><h2>Zincir ve bakiye</h2>
          <DL rows={[
            ['Bağlantı', state.stale ? 'Yenileniyor' : 'Canlı'],
            ['Operatör cüzdanı', `${operator.address.slice(0, 8)}… · ${operator.balanceMon ?? '?'} MON`],
            ['Demo bakiye verilen', `${drip.funded} / ${drip.limit} kişi (${drip.amountMon} MON)`],
            ['Otomatik turlar', settings.autoRounds ? `Açık · ${settings.roundSeconds} sn` : 'Kapalı'],
            ['Son hata', state.lastError ?? '-'],
          ]} />
        </div></article>
      </section>
    </main>
    </ArenaShell>
  );
}
