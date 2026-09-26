'use client';
// Meme Arena — unified participant component.
// Runs in two modes:
//   LIVE: polls /api/state, uses real on-chain wallet + voting (from participant.mjs)
//   DEMO: falls back to local poll state when backend is unreachable (from monad-hackathon-frontend)

import { useEffect, useReducer, useState, useCallback } from 'react';
import Image from 'next/image';
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Crown,
  Flame, Info, Layers3, RotateCcw, ShieldCheck, Sparkles, Wallet, X,
} from 'lucide-react';
import { getWinners, initialState, percentages, pollReducer, rounds, type Meme } from '@/lib/poll';
import { useStatePoll } from '@/hooks/use-state-poll';
import { useWallet } from '@/hooks/use-wallet';
import { secondsLeft, formatSeconds, type RoundData } from '@/lib/timer';

// ——— Sub-components ———

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`mark ${small ? 'small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M6 18 13 6h14L19 26H6Z" /></svg>
    </span>
  );
}

function MemeImage({ meme, priority = false }: { meme: Meme; priority?: boolean }) {
  return <Image src={meme.image} alt={meme.name} fill sizes="(max-width: 700px) 90vw, 480px" priority={priority} unoptimized />;
}

// ——— Live choice component for backend-driven rounds ———

function LiveChoices({
  round, countdown, wallet, state,
}: {
  round: RoundData;
  countdown: number;
  wallet: ReturnType<typeof useWallet>;
  state: NonNullable<ReturnType<typeof useStatePoll>['state']>;
}) {
  const total = round.counts.reduce((a, b) => a + b, 0);
  const canVote = wallet.funded && round.open && countdown > 0
    && !wallet.payments[round.id] && !wallet.busy && !state.stale && !wallet.pending && !!state.fees;

  return (
    <>
      <div className="question">
        <span className="topic"><Flame size={13} />CANLI TUR</span>
        <h2 id="question">Tur {round.step}/{round.steps}</h2>
        <div className="question-meta">
          <span><Layers3 size={14} />{total} oy</span>
          <span className="meta-dot" />
          <span>{formatSeconds(countdown)}</span>
        </div>
      </div>
      <div className="meme-options" role="radiogroup" aria-label="Oylama seçenekleri">
        {round.labels.map((label, i) => {
          const count = round.counts[i];
          const share = total ? Math.round((count / total) * 100) : 0;
          const isWinner = round.finalized && round.winner === i;
          return (
            <button
              role="radio"
              aria-checked={false}
              disabled={!canVote}
              className={`meme-card ${isWinner ? 'selected' : ''}`}
              key={`live-${round.id}-${i}`}
              onClick={() => wallet.vote(round.id, i, state)}
            >
              <div className="meme-card-copy" style={{ padding: '20px 16px' }}>
                <strong>{label}</strong>
                <span>{count} oy · %{share}</span>
                <div style={{
                  height: 4, background: '#2f223b', borderRadius: 5,
                  marginTop: 6, overflow: 'hidden',
                }}>
                  <i style={{
                    display: 'block', height: '100%',
                    background: isWinner ? '#c29af2' : '#715287',
                    borderRadius: 5, width: `${share}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ——— Status text for live mode ———

function liveStatusText(
  round: RoundData | null,
  wallet: ReturnType<typeof useWallet>,
  countdown: number,
  directorLive: boolean,
): string {
  if (!round) {
    return directorLive ? 'Video başladı; ilk tur birazdan açılacak.' : 'Yayın başlayınca oylama burada açılacak.';
  }
  if (round.cancelled) return 'Bu tur iptal edildi; ödediğin bedeli geri alabilirsin.';
  if (round.finalized) return round.winner === null ? 'Bu turda oy çıkmadı.' : `Seçilen: ${round.labels[round.winner]}`;
  if (wallet.payments[round.id]) return 'Oyun kayıtlı. Sonucu bekle.';
  if (!wallet.funded) return 'Oy vermek için önce katıl.';
  return countdown > 0 ? 'Seçimini yap: her oy 0,001 demo MON.' : 'Oylama kapandı, sonuç hesaplanıyor.';
}

// ——— Main component ———

export default function MemeArena() {
  // Live backend state
  const { state: liveState, fetchedAt } = useStatePoll();
  const wallet = useWallet();

  // Demo state (fallback when backend is unavailable)
  const [demoState, demoDispatch] = useReducer(pollReducer, initialState);
  const [walletOpen, setWalletOpen] = useState(false);
  const [mode, setMode] = useState<'detecting' | 'live' | 'demo'>('detecting');

  // Detect mode
  useEffect(() => {
    if (mode !== 'detecting') return;
    const timeout = setTimeout(() => {
      if (!liveState) setMode('demo');
    }, 3000);
    if (liveState) setMode('live');
    return () => clearTimeout(timeout);
  }, [liveState, mode]);

  // Demo timers
  useEffect(() => {
    if (mode !== 'demo') return;
    if (demoState.phase !== 'counting' && demoState.phase !== 'result') return;
    const timer = setInterval(() => demoDispatch({ type: 'tick' }), 1000);
    return () => clearInterval(timer);
  }, [mode, demoState.phase, demoState.roundIndex]);

  // Live reconcile
  useEffect(() => {
    if (mode === 'live' && liveState) wallet.tryReconcile();
  }, [mode, liveState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: close wallet popover
  useEffect(() => {
    if (!walletOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setWalletOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [walletOpen]);

  const demoNext = useCallback(() => {
    demoDispatch({ type: 'next' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ——— LIVE MODE RENDER ———

  if (mode === 'live' && liveState) {
    const round = liveState.round;
    const countdown = secondsLeft(round, liveState.blockTime, fetchedAt);
    const refundRound = wallet.findRefundableRound(liveState.cancelledRounds);
    const statusText = wallet.status || liveStatusText(round, wallet, countdown, liveState.director?.live);

    return (
      <>
        <header className="navbar">
          <a className="brand" href="/" aria-label="Inscribi ana sayfa">
            <Mark /><span>inscribi <b>/</b> <strong>monad</strong></span>
          </a>
          <div className="nav-label"><span className="nav-live" />Canlı Arena</div>
          <div className="wallet-wrap">
            <button className="wallet-button" onClick={() => setWalletOpen(!walletOpen)} aria-expanded={walletOpen}>
              <span className="wallet-avatar"><Wallet size={17} /></span>
              <span className="wallet-copy">
                <span>Inscribi Wallet {wallet.funded && <span className="demo-label">DEMO</span>}</span>
                <strong>{wallet.displayAddress || '…'}</strong>
              </span>
              <ChevronDown size={14} />
            </button>
            {walletOpen && (
              <div className="wallet-popover" id="wallet-detail">
                <div><strong>Canlı cüzdan</strong><button onClick={() => setWalletOpen(false)} aria-label="Kapat"><X size={18} /></button></div>
                <p>{wallet.account?.address ?? '…'}</p>
                <p>Demo bakiye ile zincir üzerinde oy verirsiniz.</p>
              </div>
            )}
          </div>
        </header>

        <main>

          <div className="arena-layout">
            <div className="main-column">
              <section className="arena" aria-labelledby="question">
                <div className="arena-top">
                  <span className={`round-status ${round?.finalized ? 'finished' : ''}`}>
                    <i />{round?.finalized ? 'TUR TAMAMLANDI' : round?.open ? 'CANLI' : 'BEKLENİYOR'}
                  </span>
                  {round && (
                    <span className="round-number">
                      TUR {String(round.step).padStart(2, '0')} <span>/ {String(round.steps).padStart(2, '0')}</span>
                    </span>
                  )}
                </div>

                {round ? (
                  <LiveChoices round={round} countdown={countdown} wallet={wallet} state={liveState} />
                ) : (
                  <div className="question" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <p style={{ color: '#a094b1' }}>{statusText}</p>
                  </div>
                )}

                <div className="arena-note"><ShieldCheck size={14} /><span>Monad testnet · demo MON</span></div>
              </section>

              {/* Join + Refund actions */}
              <section className="desktop-vote">
                {!wallet.funded && wallet.account && (
                  <button className="vote-button" onClick={wallet.join} disabled={wallet.busy}>
                    <span>Katıl ve demo MON al</span><ArrowUpRight size={20} />
                  </button>
                )}
                {refundRound !== null && (
                  <button
                    className="vote-button"
                    style={{ marginTop: 10, background: '#2c2039', borderColor: '#4d365d', color: '#c7a7e9' }}
                    onClick={() => wallet.refund(refundRound, liveState)}
                    disabled={wallet.busy || wallet.pending}
                  >
                    Tur {refundRound} için ödediğini geri al
                  </button>
                )}
                {statusText && <div className="action-caption"><span>{statusText}</span></div>}
              </section>
            </div>

            <aside className="side-column">
              <section className="manifesto">
                <span className="aside-eyebrow"><Sparkles size={14} /> CANLI OYLAMA</span>
                <h2>Seç, oy ver,<br />sahneyi yönlendir.</h2>
                <div className="manifesto-bottom">
                  <div className="stacked-icons"><span>✳</span><span>◈</span><span>☺</span></div>
                  <span>Aynı zincir.<br /><b>Bin farklı tepki.</b></span>
                </div>
              </section>
              <section className="how-it-works">
                <h3>Nasıl çalışır?</h3>
                <div><span>01</span><p><strong>Katıl</strong>Demo MON al.</p></div>
                <div><span>02</span><p><strong>Oy ver</strong>Seçimini yap.</p></div>
                <div><span>03</span><p><strong>Sonuç</strong>Kazanan sahneyi yönlendirir.</p></div>
              </section>
            </aside>
          </div>

          <footer>
            <span><Mark small /> inscribi / monad</span>
            <span>Monad üzerinde canlı oylama.</span>
            <span className="footer-mode">CANLI <i /></span>
          </footer>
        </main>

        {/* Mobile bottom bar */}
        <section className="mobile-vote">
          {!wallet.funded && wallet.account ? (
            <button className="vote-button" onClick={wallet.join} disabled={wallet.busy}>
              <span>Katıl ve demo MON al</span><ArrowUpRight size={20} />
            </button>
          ) : (
            <div className="action-caption"><span>{statusText}</span></div>
          )}
        </section>
      </>
    );
  }

  // ——— DEMO MODE RENDER (original Meme Arena) ———

  const round = rounds[demoState.roundIndex];
  const results = demoState.phase === 'result' || demoState.phase === 'complete';
  const winners = getWinners(demoState.votes);
  const pct = percentages(demoState.votes);
  const total = demoState.votes.reduce((a, b) => a + b, 0);
  const winner = round.options[winners[0]];

  return (
    <>
      <header className="navbar">
        <a className="brand" href="/" aria-label="Inscribi ana sayfa">
          <Mark /><span>inscribi <b>/</b> <strong>monad</strong></span>
        </a>
        <div className="nav-label"><span className="nav-live" />Meme arena <span className="beta">BETA</span></div>
        <div className="wallet-wrap">
          <button className="wallet-button" onClick={() => setWalletOpen(!walletOpen)} aria-expanded={walletOpen} aria-controls="wallet-detail">
            <span className="wallet-avatar"><Wallet size={17} /></span>
            <span className="wallet-copy">
              <span>Inscribi Wallet <span className="demo-label">DEMO</span></span>
              <strong>128.50 <small>MON</small></strong>
            </span>
            <ChevronDown size={14} />
          </button>
          {walletOpen && (
            <div className="wallet-popover" id="wallet-detail">
              <div><strong>Demo cüzdan</strong><button onClick={() => setWalletOpen(false)} aria-label="Kapat"><X size={18} /></button></div>
              <p>0x7A2…8F4C</p>
              <b>128.50 MON</b>
              <p>Örnek bakiye. Oy verirken MON harcanmaz.</p>
            </div>
          )}
        </div>
      </header>

      <main>

        <div className="arena-layout">
          <div className="main-column">
            <section className="arena" aria-labelledby="question">
              <div className="arena-top">
                <span className={`round-status ${results ? 'finished' : ''}`}>
                  <i />{results ? 'TUR TAMAMLANDI' : demoState.phase === 'counting' ? 'OYLAR SAYILIYOR' : 'SÖZ SENDE'}
                </span>
                <span className="round-number">
                  TUR {String(round.id).padStart(2, '0')} <span>/ {String(rounds.length).padStart(2, '0')}</span>
                </span>
              </div>

              <div className="question">
                <span className="topic"><Flame size={13} />{round.topic}</span>
                <h2 id="question">{round.question}</h2>
                <div className="question-meta">
                  <span><Layers3 size={14} />{total} örnek oy</span>
                  <span className="meta-dot" />
                  <span>{results ? 'Topluluğun seçimi belli oldu' : 'Sen olsan hangisi olurdun?'}</span>
                </div>
              </div>

              {results ? (
                <div className="winner-stage" key={`winner-${round.id}`}>
                  <div className="winner-ribbon"><Crown size={16} />{winners.length > 1 ? 'ORTAK KAZANANLAR' : 'TOPLULUK BUNU SEÇTİ'}</div>
                  <div className="winner-photo">
                    <MemeImage meme={winner} priority />
                    <span className="winner-photo-caption">{winner.caption}</span>
                    <span className="winner-percent">%{pct[winners[0]]}<small>OY ORANI</small></span>
                  </div>
                  <div className="winner-title">
                    <div>
                      <h3>{winner.name}</h3>
                      <p>{winners.length > 1 ? `Eşit oy: ${winners.map(i => round.options[i].name).join(' ve ')}` : `${demoState.votes[winners[0]]} oy ile bu turun favorisi.`}</p>
                    </div>
                    <span className="crown-circle"><Crown size={22} /></span>
                  </div>
                  <div className="result-list">
                    {round.options.map((m, i) => (
                      <div className={`result-row ${winners.includes(i) ? 'is-winner' : ''}`} key={m.id}>
                        <span className="result-rank">{i + 1}</span>
                        <div className="result-copy">
                          <span>{m.name}{demoState.selected === i && <small>SENİN OYUN</small>}</span>
                          <div className="result-track"><i style={{ width: `${pct[i]}%` }} /></div>
                        </div>
                        <b>%{pct[i]}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="meme-options" role="radiogroup" aria-label="Meme seçenekleri">
                  {round.options.map((m, i) => (
                    <button
                      role="radio"
                      aria-checked={demoState.selected === i}
                      disabled={demoState.phase !== 'voting'}
                      className={`meme-card ${demoState.selected === i ? 'selected' : ''}`}
                      key={`${round.id}-${m.id}`}
                      onClick={() => demoDispatch({ type: 'select', index: i })}
                    >
                      <div className="meme-photo">
                        <MemeImage meme={m} priority={i === 0} />
                        <span className="option-badge">0{i + 1}</span>
                        <span className="select-circle">{demoState.selected === i && <Check size={15} />}</span>
                      </div>
                      <div className="meme-card-copy">
                        <strong>{m.name}</strong>
                        <span>{m.caption}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="arena-note"><ShieldCheck size={14} /><span>Demo tur · Örnek oylar · MON harcanmaz</span></div>
            </section>

            <section className="desktop-vote">
              <VoteAction
                phase={demoState.phase} selected={demoState.selected} seconds={demoState.seconds}
                last={demoState.roundIndex === rounds.length - 1}
                onVote={() => demoDispatch({ type: 'vote' })} onNext={demoNext}
                onRestart={() => demoDispatch({ type: 'restart' })}
              />
            </section>

            <div className="round-progress">
              {rounds.map((r, i) => (
                <span key={r.id} className={i <= demoState.roundIndex ? 'active' : ''}>
                  <i />{i === demoState.roundIndex ? 'ŞİMDİ' : String(r.id).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>

          <aside className="side-column">
            <section className="manifesto">
              <span className="aside-eyebrow"><Sparkles size={14} /> MEME ARENA</span>
              <h2>Sen seç.<br />Topluluk karar versin.</h2>
              <div className="manifesto-bottom">
                <div className="stacked-icons"><span>✳</span><span>◈</span><span>☺</span></div>
                <span>Aynı zincir.<br /><b>Bin farklı tepki.</b></span>
              </div>
            </section>
            <section className="how-it-works">
              <h3>Nasıl çalışır?</h3>
              <div><span>01</span><p><strong>Seç</strong>Meme'ini seç.</p></div>
              <div><span>02</span><p><strong>Oyla</strong>Seçimini onayla.</p></div>
              <div><span>03</span><p><strong>Sonuç</strong>Kazanan sahnede.</p></div>
            </section>
            {demoState.history.length > 0 && (
              <section className="recent-winners">
                <h3><Crown size={15} /> Turun yıldızları</h3>
                {demoState.history.map(item => {
                  const r = rounds.find(r => r.id === item.roundId)!;
                  return (
                    <div key={item.roundId}>
                      <span className="recent-image"><MemeImage meme={r.options[item.winners[0]]} /></span>
                      <p>
                        <small>TUR {String(item.roundId).padStart(2, '0')}</small>
                        <strong>{item.winners.map(i => r.options[i].name).join(' / ')}</strong>
                      </p>
                      <Check size={15} />
                    </div>
                  );
                })}
              </section>
            )}
          </aside>
        </div>

        <footer>
          <span><Mark small /> inscribi / monad</span>
          <span>Monad üzerinde meme oylama.</span>
          <span className="footer-mode">DEMO <i /></span>
        </footer>
      </main>

      <section className="mobile-vote">
        <VoteAction
          phase={demoState.phase} selected={demoState.selected} seconds={demoState.seconds}
          last={demoState.roundIndex === rounds.length - 1}
          onVote={() => demoDispatch({ type: 'vote' })} onNext={demoNext}
          onRestart={() => { demoDispatch({ type: 'restart' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        />
      </section>

      <span className="sr-only" role="status" aria-live="polite">
        {demoState.phase === 'counting'
          ? 'Oyun kaydedildi. Sonuçlar hazırlanıyor.'
          : results
            ? `Tur tamamlandı. ${winners.map(i => round.options[i].name).join(' ve ')} en çok oyu aldı.`
            : `${round.id}. soru. ${round.question}`}
      </span>
    </>
  );
}

// ——— Vote Action bar (demo mode) ———

function VoteAction({
  phase, selected, seconds, last, onVote, onNext, onRestart,
}: {
  phase: string; selected: number | null; seconds: number; last: boolean;
  onVote: () => void; onNext: () => void; onRestart: () => void;
}) {
  return (
    <>
      <div className="action-caption">
        {phase === 'voting' ? (
          <><span>{selected === null ? 'Bir meme seç, sohbete katıl.' : 'Güzel seçim. Söz artık sende.'}</span><small>1 TUR = 1 OY</small></>
        ) : phase === 'counting' ? (
          <><span><span className="counting-dot" />Oyun kaydedildi</span><small>{seconds} sn · sonuçlar hazırlanıyor</small></>
        ) : phase === 'complete' ? (
          <><span><Check size={14} />{rounds.length} tur, {rounds.length} tepki. İyi ki katıldın.</span><small>TAMAMLANDI</small></>
        ) : (
          <><span><Crown size={14} />Topluluğun favorisi sahnede.</span><small><Clock3 size={12} />{seconds} sn</small></>
        )}
      </div>
      <button
        className={`vote-button ${phase === 'counting' ? 'counting' : ''}`}
        disabled={phase === 'counting' || (phase === 'voting' && selected === null)}
        onClick={phase === 'voting' ? onVote : phase === 'complete' ? onRestart : onNext}
      >
        {phase === 'voting' ? (
          <><span>Bu meme'e oy ver</span><ArrowUpRight size={20} /></>
        ) : phase === 'counting' ? (
          <><span>Topluluğun seçimi geliyor</span><span className="spinner" /></>
        ) : phase === 'complete' ? (
          <><span>Yeniden oyna</span><RotateCcw size={18} /></>
        ) : (
          <><span>{last ? 'Turları tamamla' : 'Sıradaki soru'}</span><ArrowRight size={19} /></>
        )}
      </button>
    </>
  );
}
