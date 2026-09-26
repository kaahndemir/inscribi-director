// Stage screen (projector). This tab owns the live Director connection:
// it starts the paid session, keeps the server lease alive, forwards each winning prompt exactly once
// and relays the provider's answers back to the server.
import {createFalClient} from '@fal-ai/client';
import {wma} from '@fal-ai/client/realtime';
import {$, getJson, postJson, renderTally, secondsLeft, formatSeconds} from './shared.mjs';

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
      if (message.type === 'stream_exhausted') void stop('Director akışı sona erdi.');
    },
  });
  director.send({
    type: 'configure',
    protocol_version: 1,
    prompt_version: 1,
    resolution: '480p',
    aspect_ratio: '16:9',
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

  if (!round) {
    $('stage-round-title').textContent = session.status === 'live' ? 'İlk tur birazdan' : 'Oylama birazdan';
    $('stage-countdown').textContent = '';
    $('tally').replaceChildren();
    $('winner').hidden = true;
    return;
  }
  $('stage-round-title').textContent = `Tur ${round.number}`;
  $('stage-countdown').textContent = formatSeconds(secondsLeft(round, state.blockTime, fetchedAt));
  renderTally($('tally'), round, {highlight: round.finalized ? round.winner : null});
  const showWinner = round.finalized && round.winner !== null;
  $('winner').hidden = !showWinner;
  if (showWinner) $('winner').textContent = `Seçilen: ${round.labels[round.winner]}`;
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
