// Participant phone screen: a browser wallet, a one-time demo balance and paid votes.
//
// Payment safety rules:
// - The signed transaction and its hash are stored before anything is sent.
// - A lost answer is retried with the identical signed bytes, never with a new signature.
// - A vote counts only when its receipt carries the expected Voted event.
// - Web Locks keep two tabs of the same browser from paying at the same time.
import {createPublicClient, decodeEventLog, encodeFunctionData, formatEther, http, keccak256} from 'viem';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {$, getJson, postJson, secondsLeft} from './shared.mjs';
import {icon} from '../shared/icons.mjs';

const WALLET_KEY = 'inscribi-director.wallet.v1';
const SEND_ATTEMPTS = 3;
const RECEIPT_WAIT_MS = 15000;
const POLL_MS = 1000;
const RESEND_AFTER_MS = 5000;
// Balance is read rarely to keep load on the shared RPC low, and right after every payment.
const BALANCE_REFRESH_MS = 15000;

const config = await getJson('/api/config');
const chain = {
  id: config.chainId,
  name: 'Monad Testnet',
  nativeCurrency: {name: 'MON', symbol: 'MON', decimals: 18},
  rpcUrls: {default: {http: [`${location.origin}/api/rpc`]}},
};
const rpc = createPublicClient({chain, transport: http('/api/rpc', {retryCount: 0, timeout: 10000}), pollingInterval: 700});
const scope = `inscribi-director.${config.chainId}.${config.contract}.${config.roomId}`.toLowerCase();

const storage = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (localStorage.getItem(key) !== JSON.stringify(value)) throw new Error('storage');
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

const keys = {
  pending: `${scope}.pending`,
  payments: `${scope}.payments`,
  nonce: `${scope}.nonce`,
  funded: `${scope}.funded`,
};

let account = null;
let state = null;
let fetchedAt = 0;
let busy = false;
let syncSupported = true;
let balanceAt = 0;

const setStatus = (text) => {
  $('status').textContent = text;
};

function loadWallet() {
  try {
    let key = storage.get(WALLET_KEY);
    if (!key) {
      key = generatePrivateKey();
      storage.set(WALLET_KEY, key);
    }
    account = privateKeyToAccount(key);
    $('address').textContent = `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;
  } catch {
    account = null;
    $('wallet-status').textContent = 'Bu tarayıcı veri saklamaya izin vermiyor. Gizli sekmeden çıkın veya başka bir tarayıcı deneyin; bu cihazdan ödeme yapılmayacak.';
  }
}

async function refreshBalance(force = false) {
  if (!account || !funded() || (!force && Date.now() - balanceAt < BALANCE_REFRESH_MS)) return;
  balanceAt = Date.now();
  try {
    const wei = await rpc.getBalance({address: account.address});
    $('balance').innerHTML = `${Number(formatEther(wei)).toLocaleString('tr-TR', {maximumFractionDigits: 3})} <small>MON</small>`;
  } catch {
    // Keep the last known balance.
  }
}

const payments = () => storage.get(keys.payments, {});
const funded = () => storage.get(keys.funded, false) === true;

// Joining ---------------------------------------------------------------------------------

async function join() {
  if (!account || busy) return;
  busy = true;
  render();
  setStatus('Demo bakiye hazırlanıyor…');
  try {
    const result = await postJson('/api/drip', {address: account.address});
    if (result.status !== 'confirmed') throw new Error(result.status);
    storage.set(keys.funded, true);
    void refreshBalance(true);
    setStatus('Demo bakiyen hazır.');
  } catch (error) {
    setStatus(error.message === 'drip limit reached' ? 'Katılım doldu. Sahnedeki videoyu izlemeye devam edebilirsin.' : 'Demo bakiye doğrulanamadı; ikinci ödeme yapılmadı. Birazdan tekrar deneyin.');
  } finally {
    busy = false;
    render();
  }
}

// Paying ----------------------------------------------------------------------------------

async function nextNonce() {
  const stored = storage.get(keys.nonce);
  if (Number.isInteger(stored)) return stored;
  return rpc.getTransactionCount({address: account.address, blockTag: 'pending'});
}

function receiptMatches(receipt, pending) {
  const ok = receipt.status === 'success' || receipt.status === '0x1';
  if (!ok || receipt.transactionHash.toLowerCase() !== pending.hash) return false;
  if (pending.kind === 'refund') return true;
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== config.contract.toLowerCase()) return false;
    try {
      const event = decodeEventLog({abi: config.abi, data: log.data, topics: log.topics});
      return event.eventName === 'Voted'
        && Number(event.args.round) === pending.round
        && Number(event.args.choice) === pending.choice
        && event.args.voter.toLowerCase() === account.address.toLowerCase();
    } catch {
      return false;
    }
  });
}

function settle(receipt, pending) {
  const succeeded = receiptMatches(receipt, pending);
  if (succeeded) {
    const record = payments();
    record[pending.round] = pending.kind === 'refund' ? 'refunded' : 'paid';
    storage.set(keys.payments, record);
  }
  storage.set(keys.nonce, pending.nonce + 1);
  storage.remove(keys.pending);
  void refreshBalance(true);
  setStatus(succeeded ? (pending.kind === 'refund' ? 'İade hesabına döndü.' : 'Oyun zincire yazıldı.') : 'İşlem reddedildi; oy sayılmadı.');
}

async function broadcast(raw) {
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    try {
      if (syncSupported) return await rpc.request({method: 'eth_sendRawTransactionSync', params: [raw]});
      await rpc.sendRawTransaction({serializedTransaction: raw});
      return await rpc.waitForTransactionReceipt({hash: keccak256(raw), timeout: RECEIPT_WAIT_MS});
    } catch (error) {
      if (/-32601|method.*(not found|not supported|does not exist)/i.test(String(error?.details ?? error))) {
        syncSupported = false;
        attempt--;
        continue;
      }
      if (attempt < SEND_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  return null;
}

// Checks a stored transaction whose answer was lost; re-sends the same bytes if the chain has not seen it.
async function reconcile() {
  const pending = storage.get(keys.pending);
  if (!pending) return;
  try {
    const receipt = await rpc.getTransactionReceipt({hash: pending.hash});
    settle(receipt, pending);
  } catch {
    if (Date.now() - pending.sentAt < RESEND_AFTER_MS) return setStatus('İşlemin sonucu bekleniyor; yeniden ödeme yapılmayacak.');
    storage.set(keys.pending, {...pending, sentAt: Date.now()});
    const receipt = await broadcast(pending.raw);
    if (receipt?.transactionHash) settle(receipt, pending);
    else setStatus('İşlemin sonucu bekleniyor; yeniden ödeme yapılmayacak.');
  }
}

async function pay(kind, round, choice = 0) {
  if (!account || busy) return;
  const run = async (lock) => {
    if (lock === null) return setStatus('Başka bir sekmede işlem sürüyor.');
    if (storage.get(keys.pending)) return reconcile();
    if (kind === 'vote' && payments()[round]) return setStatus('Bu turda oyun zaten kayıtlı.');
    busy = true;
    render();
    setStatus(kind === 'vote' ? 'Oy gönderiliyor…' : 'İade isteniyor…');
    try {
      const nonce = await nextNonce();
      const fees = state.fees;
      const raw = await account.signTransaction({
        chainId: chain.id,
        type: 'eip1559',
        to: config.contract,
        data: encodeFunctionData({abi: config.abi, functionName: kind, args: kind === 'vote' ? [BigInt(round), choice] : [BigInt(round)]}),
        value: kind === 'vote' ? BigInt(state.round.fee) : 0n,
        nonce,
        gas: BigInt(config.voteGas),
        maxFeePerGas: (BigInt(fees.maxFeePerGas) * 125n) / 100n,
        maxPriorityFeePerGas: BigInt(fees.maxPriorityFeePerGas),
      });
      const pending = {kind, round, choice, nonce, raw, hash: keccak256(raw).toLowerCase(), sentAt: Date.now()};
      storage.set(keys.pending, pending);
      const receipt = await broadcast(raw);
      if (receipt?.transactionHash) settle(receipt, pending);
      else {
        storage.remove(keys.nonce);
        setStatus('İşlemin sonucu bekleniyor; yeniden ödeme yapılmayacak.');
      }
    } catch {
      setStatus('İşlem gönderilemedi. Bağlantını kontrol edip tekrar dene.');
    } finally {
      busy = false;
      render();
    }
  };
  if (navigator.locks) return navigator.locks.request('inscribi-director-payment', {ifAvailable: true}, run);
  return run(true);
}

// Rendering -------------------------------------------------------------------------------

let selected = null; // {round, choice}: picked on screen, paid only after the vote button
let cardsFor = null; // round id the cards were built for

function refundableRound() {
  const record = payments();
  return (state?.cancelledRounds ?? []).find((id) => record[id] === 'paid') ?? null;
}

// After a round: the winner, then a pointer to the stage while its video plays.
function finalText(round, effect) {
  if (round.winner === null) return 'Bu turda oy çıkmadı.';
  const label = round.labels[round.winner];
  if (effect?.round !== round.id) return `Seçilen: ${label}`;
  return effect.state === 'showing' ? `Şimdi sahnede: ${label}. Ekrana bak!` : `Seçilen: ${label}. Birazdan sahnede.`;
}

const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

// Meme cards are built once per round and updated in place, so images do not reload on every poll.
function buildCards(round) {
  const cards = round.labels.map((label, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'meme-card';
    card.setAttribute('role', 'radio');
    const image = round.images?.[index];
    if (image) {
      const photo = document.createElement('div');
      photo.className = 'meme-photo';
      const img = document.createElement('img');
      img.src = image;
      img.alt = label;
      img.decoding = 'async';
      const badge = document.createElement('span');
      badge.className = 'option-badge';
      badge.textContent = String(index + 1).padStart(2, '0');
      const circle = document.createElement('span');
      circle.className = 'select-circle';
      circle.innerHTML = icon('check', 15);
      photo.append(img, badge, circle);
      card.append(photo);
    } else card.classList.add('live-card');
    const copy = document.createElement('div');
    copy.className = 'meme-card-copy';
    const name = document.createElement('strong');
    name.textContent = label;
    const votes = document.createElement('span');
    votes.className = 'choice-count';
    const track = document.createElement('div');
    track.className = 'share-track';
    track.append(document.createElement('i'));
    copy.append(name, votes, track);
    card.append(copy);
    card.addEventListener('click', () => {
      selected = {round: round.id, choice: index};
      render();
    });
    return card;
  });
  $('choices').replaceChildren(...cards);
  cardsFor = round.id;
}

function renderCards(round, canPick, voted) {
  if (cardsFor !== round.id) buildCards(round);
  const total = round.counts.reduce((a, b) => a + b, 0);
  const paidChoice = voted ? storage.get(keys.pending)?.choice ?? null : null;
  [...$('choices').children].forEach((card, index) => {
    const share = total ? Math.round((round.counts[index] / total) * 100) : 0;
    const isSelected = selected?.round === round.id && selected.choice === index;
    card.disabled = !canPick;
    card.classList.toggle('selected', isSelected && !round.finalized);
    card.classList.toggle('winner', round.finalized && round.winner === index);
    card.setAttribute('aria-checked', String(isSelected));
    card.querySelector('.choice-count').textContent = `${round.counts[index]} oy · %${share}`;
    card.querySelector('.share-track').style.setProperty('--share', `${share}%`);
    card.classList.toggle('voted', paidChoice === index);
  });
}

function render() {
  const ready = !!account && funded();
  const round = state?.round;
  const refundRound = refundableRound();
  const pendingTx = !!storage.get(keys.pending);

  if (account) $('wallet-status').textContent = ready ? 'Cüzdanın hazır.' : 'Katılmak için demo bakiye al. Cüzdan kurman gerekmez.';
  $('join').hidden = !account || ready;
  $('join').disabled = busy;
  $('refund').hidden = !ready || refundRound === null;
  $('refund').textContent = refundRound ? `Tur ${refundRound} için ödediğini geri al` : '';
  $('refund').disabled = busy || pendingTx;

  const status = $('round-status');
  if (!round) {
    status.classList.remove('finished');
    $('round-status-text').textContent = state?.director?.live ? 'YAYIN CANLI' : 'BEKLENİYOR';
    $('round-number').textContent = '';
    $('total-votes').textContent = '0 oy';
    $('countdown').textContent = state?.director?.live ? 'İlk tur birazdan' : 'Yayın başlayınca oylama açılır';
    $('waiting-card').hidden = false;
    $('waiting-text').textContent = state?.director?.live ? 'Video başladı; ilk tur birazdan açılacak.' : 'Yayın başlayınca oylama burada açılacak.';
    $('choices').replaceChildren();
    cardsFor = null;
    $('vote').hidden = true;
    $('clock-panel').hidden = true;
    $('result').textContent = ready ? 'Hazırsın. Tur açılınca seçimini yap.' : '';
    return;
  }

  const left = secondsLeft(round, state.blockTime, fetchedAt);
  const voted = payments()[round.id] === 'paid' || (pendingTx && storage.get(keys.pending)?.round === round.id);
  const canVote = ready && round.open && left > 0 && !voted && !busy && !state.stale && !pendingTx && !!state.fees;
  const total = round.counts.reduce((a, b) => a + b, 0);

  status.classList.toggle('finished', !round.open);
  $('round-status-text').textContent = round.cancelled ? 'TUR İPTAL' : round.finalized ? 'TUR TAMAMLANDI' : voted ? 'OYUN KAYDEDİLDİ' : 'SÖZ SENDE';
  $('round-number').textContent = `TUR ${String(round.number).padStart(2, '0')}`;
  $('total-votes').textContent = `${total} oy`;
  $('countdown').textContent = round.open && left > 0 ? `${left} sn kaldı` : round.open ? 'Oylama kapandı' : 'Sonuç belli';
  $('waiting-card').hidden = true;
  if (selected && selected.round !== round.id) selected = null;
  renderCards(round, canVote, voted);

  const choice = selected?.round === round.id ? selected.choice : null;
  $('vote').hidden = !ready || !round.open || voted;
  $('vote').disabled = !canVote || choice === null;
  $('vote-label').textContent = choice === null ? 'Bir meme seç' : `“${round.labels[choice]}” için oy ver`;
  $('clock-panel').hidden = !(voted && round.open);
  $('clock').textContent = clock(left);
  $('clock-title').firstChild.textContent = left > 0 ? 'Oylama bitiyor' : 'Sonuç hesaplanıyor';
  $('caption-meta').textContent = round.open ? `HER OY ${formatEther(BigInt(round.fee))} MON` : 'TUR BİTTİ';

  if (round.cancelled) $('result').textContent = 'Bu tur iptal edildi; ödediğin bedeli geri alabilirsin.';
  else if (round.finalized) $('result').textContent = finalText(round, state.effect);
  else if (voted) $('result').textContent = 'Oyun kayıtlı. Sonucu bekle.';
  else if (!ready) $('result').textContent = 'Oy vermek için önce katıl.';
  else $('result').textContent = left > 0 ? (choice === null ? 'Bir meme seç, sonra oyunu onayla.' : 'Güzel seçim. Oyunu onayla.') : 'Oylama kapandı, sonuç hesaplanıyor.';
}

async function poll() {
  try {
    state = await getJson('/api/state');
    fetchedAt = Date.now();
    if (state.stale) setStatus('Zincir bağlantısı yenileniyor…');
    if (storage.get(keys.pending) && !busy) await reconcile();
    void refreshBalance();
  } catch {
    setStatus('Bağlantı koptu; son durum gösteriliyor.');
  }
  render();
}

function toggleWallet(open = $('wallet-detail').hidden) {
  $('wallet-detail').hidden = !open;
  $('wallet-button').setAttribute('aria-expanded', String(open));
}

loadWallet();
$('join').addEventListener('click', join);
$('vote').addEventListener('click', () => {
  if (selected && state?.round?.id === selected.round) pay('vote', selected.round, selected.choice);
});
$('refund').addEventListener('click', () => {
  const round = refundableRound();
  if (round !== null) pay('refund', round);
});
$('wallet-button').addEventListener('click', () => toggleWallet());
$('wallet-close').addEventListener('click', () => toggleWallet(false));
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') toggleWallet(false);
});
await poll();
setInterval(poll, POLL_MS);
