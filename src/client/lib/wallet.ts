// Browser wallet ported from participant.mjs.
// Generates a local private key on first visit; stored in localStorage.

import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

const WALLET_KEY = 'inscribi-director.wallet.v1';

// ——— LocalStorage helpers ———

export const storage = {
  get<T = unknown>(key: string, fallback: T | null = null): T | null {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : (JSON.parse(value) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
    if (localStorage.getItem(key) !== JSON.stringify(value)) throw new Error('storage');
  },
  remove(key: string) {
    localStorage.removeItem(key);
  },
};

// ——— Wallet management ———

export function loadWallet(): PrivateKeyAccount | null {
  try {
    let key = storage.get<`0x${string}`>(WALLET_KEY);
    if (!key) {
      key = generatePrivateKey();
      storage.set(WALLET_KEY, key);
    }
    return privateKeyToAccount(key);
  } catch {
    return null;
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ——— Scoped keys per deployment ———

export function scopeKeys(chainId: number, contract: string, roomId: string) {
  const scope = `inscribi-director.${chainId}.${contract}.${roomId}`.toLowerCase();
  return {
    pending: `${scope}.pending`,
    payments: `${scope}.payments`,
    nonce: `${scope}.nonce`,
    funded: `${scope}.funded`,
  };
}

export type ScopeKeys = ReturnType<typeof scopeKeys>;
