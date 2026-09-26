// Participant phone screen: a browser wallet, a one-time demo balance and paid votes.
//
// Payment safety rules:
// - The signed transaction and its hash are stored before anything is sent.
// - A lost answer is retried with the identical signed bytes, never with a new signature.
// - A vote counts only when its receipt carries the expected Voted event.
// - Web Locks keep two tabs of the same browser from paying at the same time.
import {createPublicClient, decodeEventLog, encodeFunctionData, http, keccak256} from 'viem';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {$, getJson, postJson, renderTally, secondsLeft, formatSeconds} from './shared.mjs';

const WALLET_KEY = 'inscribi-director.wallet.v1';
const SEND_ATTEMPTS = 3;
const RECEIPT_WAIT_MS = 15000;
const POLL_MS = 1000;
const RESEND_AFTER_MS = 5000;

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
    setStatus('Hazırsın. Tur açılınca seçimini yap.');
  } catch (error) {
    setStatus(error.message === 'drip limit reached' ? 'Demo bakiye kotası doldu. Ekibe haber verin.' : 'Demo bakiye doğrulanamadı; ikinci ödeme yapılmadı. Birazdan tekrar deneyin.');
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

function refundableRound() {
  const record = payments();
  return (state?.cancelledRounds ?? []).find((id) => record[id] === 'paid') ?? null;
}

function render() {
  const ready = !!account && funded();
  $('join').hidden = !account || ready;
  $('join').disabled = busy;
  if (account) $('wallet-status').textContent = ready ? 'Cüzdanın hazır.' : 'Katılmak için demo bakiye al. Cüzdan kurman gerekmez.';

  const round = state?.round;
  const refundRound = refundableRound();
  $('refund').hidden = !ready || refundRound === null;
  $('refund').textContent = refundRound ? `Tur ${refundRound} için ödediğini geri al` : '';
  $('refund').disabled = busy || !!storage.get(keys.pending);

  if (!round) {
    $('round-card').hidden = refundRound === null;
    $('waiting-card').hidden = false;
    $('waiting-text').textContent = state?.director?.live ? 'Video başladı; ilk tur birazdan açılacak.' : 'Yayın başlayınca oylama burada açılacak.';
    return;
  }
  $('round-card').hidden = false;
  $('waiting-card').hidden = true;
  $('round-title').textContent = `Tur ${round.step}/${round.steps}`;

  const left = secondsLeft(round, state.blockTime, fetchedAt);
  $('countdown').textContent = formatSeconds(left);
  const voted = payments()[round.id];
  const canVote = ready && round.open && left > 0 && !voted && !busy && !state.stale && !storage.get(keys.pending) && !!state.fees;
  renderTally($('choices'), round, {onPick: (choice) => pay('vote', round.id, choice), disabled: !canVote, highlight: round.finalized ? round.winner : null});

  if (round.cancelled) $('result').textContent = 'Bu tur iptal edildi; ödediğin bedeli geri alabilirsin.';
  else if (round.finalized) $('result').textContent = round.winner === null ? 'Bu turda oy çıkmadı.' : `Seçilen: ${round.labels[round.winner]}`;
  else if (voted) $('result').textContent = 'Oyun kayıtlı. Sonucu bekle.';
  else if (!ready) $('result').textContent = 'Oy vermek için önce katıl.';
  else $('result').textContent = left > 0 ? 'Seçimini yap: her oy 0,001 demo MON.' : 'Oylama kapandı, sonuç hesaplanıyor.';
}

async function poll() {
  try {
    state = await getJson('/api/state');
    fetchedAt = Date.now();
    if (state.stale) setStatus('Zincir bağlantısı yenileniyor…');
    if (storage.get(keys.pending) && !busy) await reconcile();
  } catch {
    setStatus('Bağlantı koptu; son durum gösteriliyor.');
  }
  render();
}

loadWallet();
$('join').addEventListener('click', join);
$('refund').addEventListener('click', () => {
  const round = refundableRound();
  if (round !== null) pay('refund', round);
});
await poll();
setInterval(poll, POLL_MS);
