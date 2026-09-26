// HTML shells for the three screens. All behaviour lives in the bundled scripts under /assets.
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';

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
<meta name="theme-color" content="#0b0d12">
<title>${title}</title>
<link rel="stylesheet" href="/assets/app.css?v=${assetVersion()}">
<script type="module" src="/assets/${script}.js?v=${assetVersion()}"></script>
</head>`;

const brand = `<div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>inscribi <b>director</b></span></div>`;

export const participantPage = () => `${head('inscribi director', 'participant')}
<body class="participant">
<main class="phone">
  <header class="phone-header">
    <div class="phone-top">${brand}<span class="wallet-chip" id="balance" hidden></span></div>
    <p class="tagline">Sahnedeki canlı videonun devamını sen seç.</p>
  </header>

  <section class="card" id="wallet-card">
    <p class="muted" id="wallet-status">Cüzdan hazırlanıyor…</p>
    <button class="primary" id="join" hidden>Katıl ve demo MON al</button>
  </section>

  <section class="card" id="round-card" hidden>
    <div class="round-head"><h1 id="round-title"></h1><span class="countdown" id="countdown"></span></div>
    <div class="choices" id="choices"></div>
    <p class="result" id="result" role="status"></p>
    <button class="secondary" id="refund" hidden></button>
  </section>

  <section class="card waiting" id="waiting-card">
    <p id="waiting-text">Yayın başlayınca oylama burada açılacak.</p>
  </section>

  <p class="status" id="status" role="status" aria-live="polite"></p>

  <footer class="phone-footer">
    <span>Monad testnet · demo MON gerçek para değildir</span>
    <span class="address" id="address"></span>
  </footer>
</main>
</body>
</html>`;

export const stagePage = () => `${head('inscribi director · sahne', 'stage')}
<body class="stage">
<div class="stage-grid">
  <section class="screen">
    <video id="video" autoplay playsinline></video>
    <div class="screen-overlay" id="overlay">
      <div class="overlay-box">
        <p id="overlay-text">Sahne hazırlanıyor…</p>
        <button class="primary large" id="start" hidden>Yayını başlat</button>
        <p class="muted" id="budget"></p>
      </div>
    </div>
    <div class="winner-banner" id="winner" hidden></div>
    <div class="director-status" id="director-status"></div>
  </section>

  <aside class="panel">
    ${brand}
    <div class="join">
      <img src="/qr.svg" alt="Katılım QR kodu" class="qr">
      <p class="join-url" id="join-url"></p>
    </div>
    <div class="stage-round" id="stage-round">
      <div class="round-head"><h2 id="stage-round-title">Oylama birazdan</h2><span class="countdown" id="stage-countdown"></span></div>
      <ol class="tally" id="tally"></ol>
    </div>
    <p class="panel-footer">Monad testnet üzerinde her oy bir işlemdir.</p>
  </aside>
</div>
</body>
</html>`;

export const adminPage = () => `${head('inscribi director · yönetim', 'admin')}
<body class="admin">
<main class="console">
  <header class="console-header">${brand}<a class="secondary link" href="/stage" target="_blank" rel="noopener">Sahneyi aç</a></header>
  <p class="status" id="status" role="status" aria-live="polite"></p>

  <section class="console-grid" id="console" hidden>
    <article class="card">
      <h2>Director</h2>
      <dl id="director"></dl>
      <div class="actions"><button class="danger" id="stop">Yayını durdur</button></div>
    </article>
    <article class="card">
      <h2>Tur</h2>
      <dl id="round"></dl>
      <div class="actions">
        <label>Süre (sn) <input id="duration" type="number" min="5" max="600" step="1"></label>
        <button class="primary" id="open">Turu aç</button>
        <button class="secondary" id="finalize">Sonuçlandır</button>
        <button class="secondary" id="cancel">İptal et</button>
      </div>
    </article>
    <article class="card">
      <h2>Yönlendirmeler</h2>
      <ol class="log" id="directions"></ol>
      <div class="actions"><button class="secondary" id="abandon">Bekleyeni bırak</button></div>
    </article>
    <article class="card">
      <h2>Zincir ve bakiye</h2>
      <dl id="chain"></dl>
    </article>
  </section>
</main>
</body>
</html>`;
