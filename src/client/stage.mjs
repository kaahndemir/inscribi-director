// Stage screen (projector). This tab owns the live Director connection:
// it starts the paid session, keeps the server lease alive, forwards each winning prompt exactly once
// and relays the provider's answers back to the server.
import {createFalClient} from '@fal-ai/client';
import {wma} from '@fal-ai/client/realtime';
import {$, getJson, postJson, secondsLeft, secondsUntil} from './shared.mjs';
import {icon} from '../shared/icons.mjs';

const DIRECTOR_APP = 'minimax/h3-max/director';
const STATE_POLL_MS = 700;
const DIRECTION_POLL_MS = 400;
const HEARTBEAT_MS = 2000;
const RELAYED = new Set(['configured', 'prompt_applied', 'prompt_rejected', 'error', 'stream_exhausted']);

const stageId = crypto.randomUUID();
const video = $('video');
let state = null;
let fetchedAt = 0;
let director = null;
let running = false;
let lastSentVersion = 1;
let timers = [];

const event = (payload) => postJson('/api/admin/director/event', {stageId, event: payload}).catch(() => {});

function overlay(text, {showStart = false} = {}) {
  $('overlay').hidden = !text;
  $('overlay-text').textContent = text ?? '';
  $('start').hidden = !showStart;
}

// Director connection ---------------------------------------------------------------------

async function start() {
  $('start').disabled = true;
  try {
    await postJson('/api/admin/session/start', {stageId});
  } catch (error) {
    $('start').disabled = false;
    return overlay(`Yayın başlatılamadı: ${error.message}`, {showStart: true});
  }
  running = true;
  lastSentVersion = 1;
  overlay('Director bağlanıyor…');
  timers.push(setInterval(heartbeat, HEARTBEAT_MS));
  if (state.settings.directorMode === 'fake') return startFake();
  startLive();
}

function startLive() {
  const fal = createFalClient({proxyUrl: '/api/fal/proxy'});
  director = fal.realtime.open(wma(DIRECTOR_APP), {
    receive: ['video', 'audio'],
    negotiationTimeoutMs: 20000,
    onState: (connection) => {
      $('director-status').textContent = `Director: ${connection}`;
    },
    onError: () => void stop('Director bağlantısı hata verdi.'),
    onMedia: (stream) => {
      video.srcObject = stream;
      video.muted = false;
      video.play().catch(() => {});
    },
    onData: (raw) => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (RELAYED.has(message.type)) void event({type: 'provider', message});
      // Chunk reports tell the server when a winner reaches the screen; only the timing fields are needed.
      if (message.type === 'chunk') {
        const {prompt_version, playback_seconds, buffer_depth_seconds} = message;
        void event({type: 'provider', message: {type: 'chunk', prompt_version, playback_seconds, buffer_depth_seconds}});
      }
      if (message.type === 'stream_exhausted') void stop('Director akışı sona erdi.');
    },
  });
  director.send({
    type: 'configure',
    protocol_version: 1,
    prompt_version: 1,
    resolution: '480p',
    aspect_ratio: '16:9',
    chunk_duration: state.settings.chunkSeconds,
    memory: 3,
    prompt: state.story.opening,
  });
  video.requestVideoFrameCallback(() => {
    overlay(null);
    void event({type: 'first-frame'});
  });
  timers.push(setInterval(forwardDirection, DIRECTION_POLL_MS));
}

// Rehearsal without the provider: no video, directions are acknowledged by the server.
function startFake() {
  $('director-status').textContent = 'Director: prova modu (video yok)';
  overlay('Prova modu: gerçek video üretilmiyor.');
  void event({type: 'configured'});
  void event({type: 'first-frame'});
}

async function forwardDirection() {
  if (!running || !director) return;
  try {
    const {direction} = await getJson(`/api/admin/director/next?stageId=${stageId}`);
    if (direction && direction.prompt_version > lastSentVersion) {
      lastSentVersion = direction.prompt_version;
      director.send(direction);
    }
  } catch {
    // The next state poll decides whether the session is still ours.
  }
}

async function heartbeat() {
  try {
    await postJson('/api/admin/session/heartbeat', {stageId});
  } catch {
    void stop('Sunucu yayını kapattı.');
  }
}

async function stop(reason) {
  if (!running) return;
  running = false;
  timers.forEach(clearInterval);
  timers = [];
  try {
    director?.send({type: 'stop'});
  } catch {}
  try {
    await director?.close();
  } catch {}
  director = null;
  void event({type: 'closed'});
  overlay(reason);
}

// Display -----------------------------------------------------------------------------------

// Tally rows are built once per round and updated in place, so images do not reload on every poll.
let tallyFor = null;
function renderTally(round) {
  if (tallyFor !== round.id) {
    const rows = round.labels.map((label, index) => {
      const li = document.createElement('li');
      li.className = 'choice';
      if (round.images?.[index]) {
        const img = document.createElement('img');
        img.className = 'choice-thumb';
        img.src = round.images[index];
        img.alt = '';
        li.append(img);
      }
      const name = document.createElement('span');
      name.className = 'choice-label';
      name.textContent = label;
      const votes = document.createElement('span');
      votes.className = 'choice-count';
      li.append(name, votes);
      return li;
    });
    $('tally').replaceChildren(...rows);
    tallyFor = round.id;
  }
  const total = round.counts.reduce((a, b) => a + b, 0);
  [...$('tally').children].forEach((li, index) => {
    li.style.setProperty('--share', `${total ? Math.round((round.counts[index] / total) * 100) : 0}%`);
    li.classList.toggle('winner', round.finalized && round.winner === index);
    li.querySelector('.choice-count').textContent = `${round.counts[index]} oy`;
  });
}

function render() {
  const {round, session} = state;
  $('join-url').textContent = state.joinUrl.replace(/^https?:\/\//, '');
  const limit = session.maxMs === null ? 'süre sınırı yok' : `en fazla ${Math.round(session.maxMs / 1000)} sn`;
  const budget = session.budgetUsd === null ? '' : ` · fal ${session.spentUsd.toFixed(2)}/${session.budgetUsd} USD`;
  $('budget').textContent = `Kalan yayın hakkı: ${session.remaining}/${session.maxSessions} · ${limit}${budget}`;

  if (!running) {
    const budgetLeft = session.budgetUsd === null || session.budgetUsd - session.spentUsd >= 4.8;
    const canStart = session.status !== 'live' && session.remaining > 0 && budgetLeft && !state.stale;
    if (session.status === 'live') overlay('Yayın başka bir sahne sekmesinde açık.');
    else if (canStart) overlay(session.attempts ? 'Yayın kapandı. Yeni yayın bir hak harcar.' : 'Sahne hazır.', {showStart: true});
    else if (session.remaining === 0) overlay('Yayın hakları kullanıldı.');
    else if (session.budgetUsd !== null && session.budgetUsd - session.spentUsd < 4.8) overlay('fal bütçesi doldu.');
    else overlay('Zincir bağlantısı bekleniyor…');
  } else if (session.status !== 'live') {
    void stop(session.reason === 'time-limit' ? 'Süre doldu, yayın kapandı.' : session.reason === 'budget' ? 'fal bütçesi doldu, yayın kapandı.' : 'Yayın kapandı.');
  }

  renderWinner(round);
  // While the winner plays, the video has the screen to itself (only the banner and the QR stay).
  const showing = !!round && state.effect?.round === round.id && state.effect.state === 'showing';
  $('hud-question').hidden = !round?.question || showing;
  $('stage-round').hidden = !round || showing;
  if (!round) {
    $('tally').replaceChildren();
    tallyFor = null;
    return;
  }
  $('hud-topic').textContent = round.topic ?? '';
  $('hud-text').textContent = round.question ?? '';
  $('stage-round-title').textContent = `Tur ${round.number}`;
  const left = secondsLeft(round, state.blockTime, fetchedAt);
  $('stage-countdown').textContent = round.open ? (left > 0 ? `${left} sn` : 'süre doldu') : round.finalized ? 'sonuç' : '';
  renderTally(round);
}

// Between rounds the banner follows the winner: chosen, then on screen while its first chunk plays.
// The banner says what is chosen, how many seconds until it reaches the screen, and then how long it plays.
let bannerKey = null;
function renderWinner(round) {
  // The winner of the latest round only; a round without votes shows nothing new.
  const effect = state.effect?.round === round?.id ? state.effect : null;
  let banner = null;
  if (round?.open) banner = null;
  else if (effect?.state === 'showing') {
    const left = secondsUntil(effect.endsAt, state, fetchedAt);
    banner = {key: 'showing', title: left ? `Şimdi sahnede · ${left} sn` : 'Şimdi sahnede', label: effect.label, image: effect.image, showing: true};
  } else if (effect) {
    const eta = secondsUntil(effect.etaAt, state, fetchedAt);
    banner = {key: 'coming', title: eta ? `Seçilen · ${eta} sn sonra sahnede` : 'Seçilen · birazdan sahnede', label: effect.label, image: effect.image};
  } else if (round?.finalized && round.winner !== null) banner = {key: 'chosen', title: 'Seçilen', label: round.labels[round.winner], image: round.images?.[round.winner]};
  const winner = $('winner');
  winner.hidden = !banner;
  if (!banner) return;
  const key = `${banner.key}|${banner.label}`;
  if (key === bannerKey) {
    winner.querySelector('small').textContent = banner.title;
    return;
  }
  bannerKey = key;
  winner.classList.toggle('showing', !!banner.showing);
  const parts = [];
  if (banner.image) {
    const img = document.createElement('img');
    img.src = banner.image;
    img.alt = '';
    parts.push(img);
  } else {
    const trophy = document.createElement('span');
    trophy.innerHTML = icon('trophy', 22);
    parts.push(trophy);
  }
  const text = document.createElement('span');
  const small = document.createElement('small');
  small.textContent = banner.title;
  const strong = document.createElement('strong');
  strong.textContent = banner.label;
  text.append(small, strong);
  winner.replaceChildren(...parts, text);
}

async function poll() {
  try {
    state = await getJson('/api/admin/state');
    fetchedAt = Date.now();
    render();
  } catch (error) {
    if (error.status === 401) overlay('Önce yönetim bağlantısıyla giriş yapın, sonra bu sayfayı yenileyin.');
    else overlay('Sunucuya ulaşılamıyor…');
  }
}

$('start').addEventListener('click', start);
addEventListener('pagehide', () => void stop('Sayfa kapandı.'));
await poll();
setInterval(poll, STATE_POLL_MS);
