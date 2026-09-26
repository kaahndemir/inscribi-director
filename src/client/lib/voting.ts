// On-chain voting logic ported from participant.mjs.
// Signs transactions locally, broadcasts via /api/rpc, reconciles lost receipts.

import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  keccak256,
  type Abi,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { storage, type ScopeKeys } from './wallet';

// ——— Constants ———

const SEND_ATTEMPTS = 3;
const RECEIPT_WAIT_MS = 15000;
const RESEND_AFTER_MS = 5000;

// ——— Types ———

export interface AppConfig {
  chainId: number;
  contract: `0x${string}`;
  roomId: string;
  voteGas: string;
  abi: Abi;
}

export interface PendingTx {
  kind: 'vote' | 'refund';
  round: number;
  choice: number;
  nonce: number;
  raw: `0x${string}`;
  hash: string;
  sentAt: number;
}

export interface FeeData {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

// ——— RPC client factory ———

let syncSupported = true;

export function createRpc(chainId: number) {
  const chain = {
    id: chainId,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['/api/rpc'] } },
  };
  return {
    chain,
    rpc: createPublicClient({ chain, transport: http('/api/rpc', { retryCount: 0, timeout: 10000 }), pollingInterval: 700 }),
  };
}

// ——— Receipt matching ———

function receiptMatches(receipt: TransactionReceipt, pending: PendingTx, config: AppConfig, account: PrivateKeyAccount): boolean {
  const ok = receipt.status === 'success';
  if (!ok || receipt.transactionHash.toLowerCase() !== pending.hash) return false;
  if (pending.kind === 'refund') return true;
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== config.contract.toLowerCase()) return false;
    try {
      const event = decodeEventLog({ abi: config.abi, data: log.data, topics: log.topics });
      const args = event.args as unknown as Record<string, bigint | string>;
      return (
        event.eventName === 'Voted' &&
        Number(args.round) === pending.round &&
        Number(args.choice) === pending.choice &&
        (String(args.voter ?? '')).toLowerCase() === account.address.toLowerCase()
      );
    } catch {
      return false;
    }
  });
}

// ——— Settlement ———

export function settle(
  receipt: TransactionReceipt,
  pending: PendingTx,
  config: AppConfig,
  account: PrivateKeyAccount,
  keys: ScopeKeys,
): { succeeded: boolean; message: string } {
  const succeeded = receiptMatches(receipt, pending, config, account);
  if (succeeded) {
    const record = storage.get<Record<number, string>>(keys.payments, {}) ?? {};
    record[pending.round] = pending.kind === 'refund' ? 'refunded' : 'paid';
    storage.set(keys.payments, record);
  }
  storage.set(keys.nonce, pending.nonce + 1);
  storage.remove(keys.pending);
  const message = succeeded
    ? pending.kind === 'refund'
      ? 'İade hesabına döndü.'
      : 'Oyun zincire yazıldı.'
    : 'İşlem reddedildi; oy sayılmadı.';
  return { succeeded, message };
}

// ——— Broadcast ———

async function broadcast(rpc: PublicClient, raw: `0x${string}`): Promise<TransactionReceipt | null> {
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    try {
      if (syncSupported) {
        return await rpc.request({ method: 'eth_sendRawTransactionSync' as 'eth_sendRawTransaction', params: [raw] }) as unknown as TransactionReceipt;
      }
      await rpc.sendRawTransaction({ serializedTransaction: raw });
      return await rpc.waitForTransactionReceipt({ hash: keccak256(raw), timeout: RECEIPT_WAIT_MS });
    } catch (error: unknown) {
      const msg = String((error as { details?: string })?.details ?? error);
      if (/-32601|method.*(not found|not supported|does not exist)/i.test(msg)) {
        syncSupported = false;
        attempt--;
        continue;
      }
      if (attempt < SEND_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  return null;
}

// ——— Reconcile lost transactions ———

export async function reconcile(
  rpc: PublicClient,
  config: AppConfig,
  account: PrivateKeyAccount,
  keys: ScopeKeys,
): Promise<string> {
  const pending = storage.get<PendingTx>(keys.pending);
  if (!pending) return '';
  try {
    const receipt = await rpc.getTransactionReceipt({ hash: pending.hash as `0x${string}` });
    return settle(receipt, pending, config, account, keys).message;
  } catch {
    if (Date.now() - pending.sentAt < RESEND_AFTER_MS) return 'İşlemin sonucu bekleniyor; yeniden ödeme yapılmayacak.';
    storage.set(keys.pending, { ...pending, sentAt: Date.now() });
    const receipt = await broadcast(rpc, pending.raw);
    if (receipt?.transactionHash) return settle(receipt, pending, config, account, keys).message;
    return 'İşlemin sonucu bekleniyor; yeniden ödeme yapılmayacak.';
  }
}

// ——— Next nonce ———

async function nextNonce(rpc: PublicClient, account: PrivateKeyAccount, keys: ScopeKeys): Promise<number> {
  const stored = storage.get<number>(keys.nonce);
  if (Number.isInteger(stored)) return stored!;
  return rpc.getTransactionCount({ address: account.address, blockTag: 'pending' });
}

// ——— Main pay function ———

export async function pay(
  kind: 'vote' | 'refund',
  roundId: number,
  choice: number,
  rpc: PublicClient,
  chain: { id: number },
  config: AppConfig,
  account: PrivateKeyAccount,
  keys: ScopeKeys,
  fees: FeeData,
  roundFee: string,
): Promise<string> {
  // Check pending
  if (storage.get(keys.pending)) return reconcile(rpc, config, account, keys);

  // Check already voted
  const payments = storage.get<Record<number, string>>(keys.payments, {}) ?? {};
  if (kind === 'vote' && payments[roundId]) return 'Bu turda oyun zaten kayıtlı.';

  const nonce = await nextNonce(rpc, account, keys);
  const raw = await account.signTransaction({
    chainId: chain.id,
    type: 'eip1559',
    to: config.contract,
    data: encodeFunctionData({
      abi: config.abi,
      functionName: kind,
      args: kind === 'vote' ? [BigInt(roundId), choice] : [BigInt(roundId)],
    }),
    value: kind === 'vote' ? BigInt(roundFee) : 0n,
    nonce,
    gas: BigInt(config.voteGas),
    maxFeePerGas: (BigInt(fees.maxFeePerGas) * 125n) / 100n,
    maxPriorityFeePerGas: BigInt(fees.maxPriorityFeePerGas),
  });

  const pending: PendingTx = { kind, round: roundId, choice, nonce, raw, hash: keccak256(raw).toLowerCase(), sentAt: Date.now() };
  storage.set(keys.pending, pending);

  const receipt = await broadcast(rpc, raw);
  if (receipt?.transactionHash) return settle(receipt, pending, config, account, keys).message;

  storage.remove(keys.nonce);
  return 'İşlemin sonucu bekleniyor; yeniden ödeme yapılmayacak.';
}

// ——— Payment record helpers ———

export function getPayments(keys: ScopeKeys): Record<number, string> {
  return storage.get<Record<number, string>>(keys.payments, {}) ?? {};
}

export function isFunded(keys: ScopeKeys): boolean {
  return storage.get<boolean>(keys.funded, false) === true;
}

export function hasPending(keys: ScopeKeys): boolean {
  return !!storage.get(keys.pending);
}
