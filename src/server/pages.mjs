// HTML shells for the three screens. All behaviour lives in the bundled scripts under /assets.
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {icon, mark} from '../shared/icons.mjs';

const DIST = new URL('../../dist/', import.meta.url);

// Asset URLs carry a hash of the build, so neither browsers nor the CDN keep serving an older build after a deploy.
let version = null;
export function assetVersion() {
  if (version) return version;
  const hash = createHash('sha256');
  try {
    for (const name of readdirSync(DIST).sort()) hash.update(name).update(readFileSync(new URL(name, DIST)));
  } catch {
    return 'dev';
  }
  return (version = hash.digest('hex').slice(0, 12));
}

const head = (title, script) => `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c0a12">
<title>${title}</title>
<link rel="stylesheet" href="/assets/app.css?v=${assetVersion()}">
<script type="module" src="/assets/${script}.js?v=${assetVersion()}"></script>
</head>`;

const brand = `<a class="brand" href="/" aria-label="inscribi ana sayfa">${mark()}<span>inscribi <b>/</b> <strong>monad</strong></span></a>`;

const footer = (mode, text) => `<footer class="operator-footer">
  <span>${mark(true)} inscribi / monad</span>
  <span>${text}</span>
  <span class="footer-mode">${mode} <i></i></span>
</footer>`;

export const participantPage = () => `${head('inscribi · canlı meme oylaması', 'participant')}
<body>
<div class="participant-shell">
<header class="navbar">
  ${brand}
  <div class="nav-label"><span class="nav-live"></span>Canlı arena</div>
  <div class="wallet-wrap">
    <button class="wallet-button" id="wallet-button" type="button" aria-expanded="false" aria-controls="wallet-detail">
      <span class="wallet-avatar">${icon('wallet', 17)}</span>
      <span class="wallet-copy"><span>Inscribi Wallet <span class="demo-label">DEMO</span></span><strong id="balance">–</strong></span>
      ${icon('chevron-down', 14)}
    </button>
    <div class="wallet-popover" id="wallet-detail" hidden>
      <div><strong>Canlı cüzdan</strong><button type="button" id="wallet-close" aria-label="Kapat">${icon('x', 18)}</button></div>
      <p class="address" id="address"></p>
      <p id="wallet-status">Cüzdan hazırlanıyor…</p>
      <p>Monad testnet · demo MON gerçek para değildir.</p>
    </div>
  </div>
</header>

<main>
  <div class="arena-layout">
    <div class="main-column">
      <section class="arena" aria-labelledby="question">
        <div class="arena-top">
          <span class="round-status" id="round-status"><i></i><span id="round-status-text">BEKLENİYOR</span></span>
          <span class="round-number" id="round-number"></span>
        </div>
        <div class="question">
          <span class="topic">${icon('flame', 13)}<span id="topic">CANLI OYLAMA</span></span>
          <h2 id="question">Duruma en uygun meme hangisi?</h2>
          <div class="question-meta">
            <span>${icon('layers-3', 14)}<span id="total-votes">0 oy</span></span>
            <span class="meta-dot"></span>
            <span id="countdown">Yayın başlayınca oylama açılır</span>
          </div>
        </div>
        <div class="arena-waiting" id="waiting-card"><p id="waiting-text">Yayın başlayınca oylama burada açılacak.</p></div>
        <div class="meme-options two-by-two" id="choices" role="radiogroup" aria-label="Meme seçenekleri"></div>
        <div class="arena-note">${icon('shield-check', 14)}<span>Monad testnet · her oy zincirde bir işlem · demo MON</span></div>
      </section>

      <section class="desktop-vote vote-dock" id="dock">
        <div class="action-caption"><span id="result" role="status"></span><small id="caption-meta">1 TUR = 1 OY</small></div>
        <div class="vote-countdown" id="clock-panel" hidden>
          <div class="countdown-panel">
            <span class="countdown-copy">${icon('clock-3', 20)}<span id="clock-title">Oylama bitiyor<small>Süre dolunca kazanan sahneye çıkar</small></span></span>
            <strong role="timer" id="clock">00:00</strong>
          </div>
        </div>
        <button class="vote-button" id="join" type="button" hidden><span>Katıl ve demo MON al</span>${icon('arrow-up-right', 20)}</button>
        <button class="vote-button" id="vote" type="button" hidden disabled><span id="vote-label">Bu meme'e oy ver</span>${icon('arrow-up-right', 20)}</button>
        <button class="vote-button quiet" id="refund" type="button" hidden></button>
        <p class="status" id="status" role="status" aria-live="polite"></p>
      </section>
    </div>

    <aside class="side-column">
      <section class="manifesto">
        <span class="aside-eyebrow">${icon('sparkles', 14)} CANLI OYLAMA</span>
        <h2>Seç, oy ver,<br>sahneyi yönlendir.</h2>
        <div class="manifesto-bottom">
          <div class="stacked-icons"><span>✳</span><span>◈</span><span>☺</span></div>
          <span>Aynı zincir.<br><b>Bin farklı tepki.</b></span>
        </div>
      </section>
      <section class="how-it-works">
        <h3>Nasıl çalışır?</h3>
        <div><span>01</span><p><strong>Katıl</strong>Demo MON al, cüzdan kurman gerekmez.</p></div>
        <div><span>02</span><p><strong>Oy ver</strong>Duruma en uygun meme'i seç, oyunu onayla.</p></div>
        <div><span>03</span><p><strong>Sahnede izle</strong>Kazanan meme canlı videoda canlanır.</p></div>
      </section>
    </aside>
  </div>
  ${footer('CANLI', 'Monad üzerinde canlı meme oylaması.')}
</main>
</div>
</body>
</html>`;

// The stage fills the whole screen (a TV or projector above the audience): the video is the page and
// everything else floats over it.
export const stagePage = () => `${head('inscribi · sahne', 'stage')}
<body class="stage-full">
<main class="stage-screen">
  <video id="video" autoplay playsinline></video>

  <div class="hud hud-question" id="hud-question" hidden>
    <span class="topic">${icon('flame', 16)}<span id="hud-topic"></span></span>
    <h1 id="hud-text"></h1>
    <p class="hud-hint">Telefonundan duruma en uygun meme'i seç</p>
  </div>

  <div class="hud hud-brand">${mark(true)}<span>inscribi <b>/</b> <strong>monad</strong></span><span class="director-status" id="director-status"></span></div>

  <aside class="hud hud-round" id="stage-round" hidden>
    <div class="round-head"><h2 id="stage-round-title"></h2><span class="countdown" id="stage-countdown"></span></div>
    <ol class="tally" id="tally"></ol>
  </aside>

  <div class="hud hud-join">
    <img src="/qr.svg" alt="Katılım QR kodu" class="qr">
    <div><span class="aside-eyebrow">${icon('scan-line', 14)} SAHNEYE KATIL</span><p class="join-url" id="join-url"></p></div>
  </div>

  <div class="winner-banner" id="winner" hidden></div>

  <div class="screen-overlay" id="overlay">
    <div class="overlay-box">
      <span class="stage-play-mark" aria-hidden="true">${icon('radio', 28)}</span>
      <p id="overlay-text" role="status">Sahne hazırlanıyor…</p>
      <button class="primary large" id="start" type="button" hidden>Yayını başlat</button>
      <p class="muted" id="budget"></p>
    </div>
  </div>
</main>
</body>
</html>`;

export const adminPage = () => `${head('inscribi · yönetim', 'admin')}
<body>
<div class="operator-shell admin-shell">
<header class="navbar">
  ${brand}
  <div class="nav-label"><span class="nav-live"></span>Yönetim paneli</div>
  <nav class="operator-nav" aria-label="Ekranlar"><a href="/">Oylama ${icon('arrow-up-right', 14)}</a><a class="wallet-button" href="/stage" target="_blank" rel="noopener">Sahneyi aç ${icon('arrow-up-right', 16)}</a></nav>
</header>
<main class="console">
  <div class="operator-intro">
    <div><span class="topic">${icon('sparkles', 14)} KONTROL SENDE</span>
      <h1>Sahneyi <span>yönet.</span></h1>
      <p>Yayını takip et, turları aç, topluluğun seçimini sahneye taşı.</p>
    </div>
    <span class="round-status" id="live-status"><i></i><span>BAĞLANIYOR</span></span>
  </div>
  <p class="status operator-message" id="status" role="status" aria-live="polite" hidden></p>

  <div id="console" hidden>
    <section class="operator-metrics" aria-label="Yayın özeti">
      <div><span>Yayın durumu</span><strong id="m-status">–</strong></div>
      <div><span>Kalan yayın hakkı</span><strong id="m-remaining">–</strong></div>
      <div><span>Bu yayındaki tur</span><strong id="m-round">–</strong></div>
      <div><span>fal harcaması</span><strong id="m-spend">–</strong></div>
    </section>
    <section class="console-grid">
      <article class="arena operator-card">
        <div class="arena-top"><span class="topic">${icon('radio', 14)} YAYIN</span></div>
        <div class="operator-card-body"><h2>Director</h2><dl id="director"></dl>
          <div class="actions"><button class="danger" id="stop" type="button">Yayını durdur</button></div>
        </div>
      </article>
      <article class="arena operator-card">
        <div class="arena-top"><span class="topic">${icon('layers-3', 14)} OYLAMA</span></div>
        <div class="operator-card-body"><h2>Tur</h2><dl id="round"></dl>
          <div class="actions">
            <label>Süre (sn) <input id="duration" type="number" min="5" max="600" step="1"></label>
            <button class="primary" id="open" type="button">Turu aç</button>
            <button class="secondary" id="finalize" type="button">Sonuçlandır</button>
            <button class="secondary" id="cancel" type="button">İptal et</button>
          </div>
        </div>
      </article>
      <article class="arena operator-card">
        <div class="arena-top"><span class="topic">${icon('activity', 14)} AKIŞ</span></div>
        <div class="operator-card-body"><h2>Yönlendirmeler</h2>
          <p class="operator-placeholder" id="directions-empty">Henüz yönlendirme yok. İlk turun sonucu burada görünecek.</p>
          <ol class="log" id="directions"></ol>
          <div class="actions"><button class="secondary" id="abandon" type="button">Bekleyeni bırak</button></div>
        </div>
      </article>
      <article class="arena operator-card">
        <div class="arena-top"><span class="topic">${icon('wallet', 14)} MONAD TESTNET</span></div>
        <div class="operator-card-body"><h2>Zincir ve bakiye</h2><dl id="chain"></dl></div>
      </article>
    </section>
  </div>
</main>
${footer('YÖNETİM', 'Monad üzerinde canlı oylama.')}
</div>
</body>
</html>`;
