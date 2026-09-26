// Operator console. Log in once with the private link (/admin#<ADMIN_TOKEN>); the token is exchanged
// for an HttpOnly cookie and removed from the address bar.
import {$, getJson, postJson, secondsLeft} from './shared.mjs';

const POLL_MS = 1000;
const STATUS_TEXT = {idle: 'Hazır', live: 'Canlı', ended: 'Kapandı'};
const END_REASON = {
  'time-limit': 'süre doldu',
  'stage-lost': 'sahne sekmesi koptu',
  'stage-closed': 'sahne kapattı',
  operator: 'operatör durdurdu',
  interrupted: 'sunucu yeniden başladı',
  shutdown: 'sunucu kapandı',
  'provider-error': 'sağlayıcı hatası',
  budget: 'fal bütçesi doldu',
};
const DIRECTION_TEXT = {waiting: 'gönderildi, yanıt bekleniyor', applied: 'kabul edildi', rejected: 'reddedildi', abandoned: 'bırakıldı'};

let state = null;
let fetchedAt = 0;

const setStatus = (text) => {
  $('status').textContent = text;
  $('status').hidden = !text;
};

function fill(list, rows) {
  list.replaceChildren(
    ...rows.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

async function login() {
  const token = decodeURIComponent(location.hash.slice(1));
  if (!token) return;
  history.replaceState(null, '', location.pathname);
  try {
    await postJson('/api/admin/login', {token});
  } catch {
    setStatus('Giriş bağlantısı geçersiz.');
  }
}

async function act(label, path, body) {
  setStatus(`${label}…`);
  try {
    await postJson(path, body);
    setStatus(`${label}: tamam`);
  } catch (error) {
    setStatus(`${label}: ${error.message}`);
  }
  await poll();
}

function render() {
  const {session, round, bridge, drip, operator, settings} = state;
  $('console').hidden = false;
  $('live-status').lastElementChild.textContent = state.stale ? 'BAĞLANTI BEKLENİYOR' : session.status === 'live' ? 'YAYIN CANLI' : 'YAYIN BEKLENİYOR';
  $('m-status').textContent = STATUS_TEXT[session.status] ?? session.status;
  $('m-remaining').innerHTML = `${session.remaining}<small> / ${session.maxSessions}</small>`;
  $('m-round').textContent = round ? String(round.number).padStart(2, '0') : '–';
  $('m-spend').innerHTML = state.budgetUsd === null ? 'prova' : `${state.spentUsd.toFixed(2)}<small> / ${state.budgetUsd} USD</small>`;

  const elapsed = Math.round(session.elapsedMs / 1000);
  fill($('director'), [
    ['Durum', `${STATUS_TEXT[session.status] ?? session.status}${session.reason ? ` (${END_REASON[session.reason] ?? session.reason})` : ''}`],
    ['Süre', session.maxMs === null ? `${elapsed} sn · sınır yok, durdurana kadar sürer` : `${elapsed} / ${Math.round(session.maxMs / 1000)} sn`],
    ['Kalan yayın hakkı', `${session.remaining} / ${session.maxSessions}`],
    ['Mod', settings.directorMode === 'live' ? 'Canlı fal Director' : 'Prova (video yok)'],
    ['fal harcaması (liste fiyatı)', state.budgetUsd === null ? 'Sayılmıyor (prova modu)' : `${state.spentUsd.toFixed(2)} / ${state.budgetUsd} USD · gerçek bedel fal panelinde`],
  ]);
  $('stop').disabled = session.status !== 'live';

  fill($('round'), round
    ? [
        ['Zincir turu', `#${round.id} · bu yayında ${round.number}. tur · soru ${round.storyStep}/${state.story.steps}`],
        ['Durum', round.cancelled ? 'İptal' : round.finalized ? 'Sonuçlandı' : round.open ? `Açık · ${secondsLeft(round, state.blockTime, fetchedAt)} sn` : '-'],
        ['Oylar', round.labels.map((label, i) => `${label}: ${round.counts[i]}`).join(' · ')],
        ['Kazanan', round.winner === null ? '-' : round.labels[round.winner]],
      ]
    : [['Tur', 'Henüz açılmadı']]);
  if (!$('duration').value) $('duration').value = settings.roundSeconds;
  $('open').disabled = session.status !== 'live' || !!round?.open;
  $('finalize').disabled = !round?.open;
  $('cancel').disabled = !round?.open;

  const items = bridge.entries.slice(-6).map((entry) => {
    const li = document.createElement('li');
    const status = entry.shownAt ? 'sahnede gösterildi' : DIRECTION_TEXT[entry.status] ?? entry.status;
    li.textContent = `Tur #${entry.round} → seçenek ${entry.choice + 1}, sürüm ${entry.version}: ${status}`;
    return li;
  });
  $('directions').replaceChildren(...items);
  $('directions-empty').hidden = items.length > 0;
  $('abandon').disabled = !bridge.entries.some((e) => e.status === 'waiting');

  fill($('chain'), [
    ['Bağlantı', state.stale ? 'Yenileniyor' : 'Canlı'],
    ['Operatör cüzdanı', `${operator.address.slice(0, 8)}… · ${operator.balanceMon ?? '?'} MON`],
    ['Demo bakiye verilen', `${drip.funded} / ${drip.limit} kişi (${drip.amountMon} MON)`],
    ['Otomatik turlar', settings.autoRounds ? `Açık · ${settings.roundSeconds} sn, kazanan izlendikten sonra` : 'Kapalı'],
    ['Video parçası', `${settings.chunkSeconds} sn`],
    ['Son hata', state.lastError ?? '-'],
  ]);
}

async function poll() {
  try {
    state = await getJson('/api/admin/state');
    fetchedAt = Date.now();
    render();
  } catch (error) {
    $('console').hidden = true;
    $('live-status').lastElementChild.textContent = 'GİRİŞ GEREKLİ';
    setStatus(error.status === 401 ? 'Giriş gerekli: özel yönetim bağlantısını açın.' : 'Sunucuya ulaşılamıyor.');
  }
}

$('stop').addEventListener('click', () => {
  if (confirm('Yayın durdurulsun mu? Açık tur iptal edilir ve bu yayın hakkı geri gelmez.')) void act('Yayın durduruluyor', '/api/admin/session/stop');
});
$('open').addEventListener('click', () => void act('Tur açılıyor', '/api/admin/round/open', {duration: Number($('duration').value)}));
$('finalize').addEventListener('click', () => void act('Tur sonuçlandırılıyor', '/api/admin/round/finalize'));
$('cancel').addEventListener('click', () => {
  if (confirm('Açık tur iptal edilsin mi? Oy verenler bedellerini geri alabilir.')) void act('Tur iptal ediliyor', '/api/admin/round/cancel');
});
$('abandon').addEventListener('click', () => void act('Bekleyen yönlendirme bırakılıyor', '/api/admin/direction/abandon'));

await login();
await poll();
setInterval(poll, POLL_MS);
