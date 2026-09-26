'use client';
// Hook that manages the browser wallet lifecycle.
// Mirrors loadWallet + join + payment tracking from participant.mjs.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { PublicClient } from 'viem';
import { postJson } from '@/lib/api';
import { loadWallet, shortAddress, scopeKeys, storage, type ScopeKeys } from '@/lib/wallet';
import { createRpc, isFunded, hasPending, reconcile, pay, getPayments, type AppConfig, type FeeData } from '@/lib/voting';
import type { PublicState } from '@/lib/types';

export function useWallet() {
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null);
  const [funded, setFunded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [displayAddress, setDisplayAddress] = useState('');

  const configRef = useRef<AppConfig | null>(null);
  const keysRef = useRef<ScopeKeys | null>(null);
  const rpcRef = useRef<{ rpc: PublicClient; chain: { id: number } } | null>(null);

  // Load wallet on mount
  useEffect(() => {
    const acct = loadWallet();
    if (acct) {
      setAccount(acct);
      setDisplayAddress(shortAddress(acct.address));
    } else {
      setStatus('Bu tarayıcı veri saklamaya izin vermiyor.');
    }
  }, []);

  // Initialize config and RPC from /api/config
  const initConfig = useCallback(async () => {
    if (configRef.current) return;
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const config: AppConfig = {
        chainId: data.chainId,
        contract: data.contract,
        roomId: data.roomId,
        voteGas: data.voteGas,
        abi: data.abi,
      };
      configRef.current = config;
      keysRef.current = scopeKeys(config.chainId, config.contract, config.roomId);
      rpcRef.current = createRpc(config.chainId);
      setFunded(isFunded(keysRef.current));
    } catch {
      // Backend not available yet
    }
  }, []);

  useEffect(() => {
    initConfig();
  }, [initConfig]);

  // Join: request demo balance (POST /api/drip)
  const join = useCallback(async () => {
    if (!account || busy || !keysRef.current) return;
    setBusy(true);
    setStatus('Demo bakiye hazırlanıyor…');
    try {
      const result = await postJson<{ status: string }>('/api/drip', { address: account.address });
      if (result.status !== 'confirmed') throw new Error(result.status);
      storage.set(keysRef.current.funded, true);
      setFunded(true);
      setStatus('Hazırsın. Tur açılınca seçimini yap.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus(
        msg === 'drip limit reached'
          ? 'Demo bakiye kotası doldu. Ekibe haber verin.'
          : 'Demo bakiye doğrulanamadı. Birazdan tekrar deneyin.',
      );
    } finally {
      setBusy(false);
    }
  }, [account, busy]);

  // Vote on-chain
  const vote = useCallback(
    async (roundId: number, choice: number, state: PublicState) => {
      if (!account || busy || !rpcRef.current || !configRef.current || !keysRef.current || !state.fees || !state.round) return;

      const lock = async (acquired: boolean | Lock | null) => {
        if (acquired === null) {
          setStatus('Başka bir sekmede işlem sürüyor.');
          return;
        }
        setBusy(true);
        setStatus('Oy gönderiliyor…');
        try {
          const msg = await pay(
            'vote',
            roundId,
            choice,
            rpcRef.current!.rpc,
            rpcRef.current!.chain,
            configRef.current!,
            account,
            keysRef.current!,
            state.fees as FeeData,
            state.round!.fee,
          );
          setStatus(msg);
        } catch {
          setStatus('İşlem gönderilemedi. Bağlantını kontrol edip tekrar dene.');
        } finally {
          setBusy(false);
        }
      };

      if (navigator.locks) {
        return navigator.locks.request('inscribi-director-payment', { ifAvailable: true }, lock);
      }
      return lock(true);
    },
    [account, busy],
  );

  // Refund
  const refund = useCallback(
    async (roundId: number, state: PublicState) => {
      if (!account || busy || !rpcRef.current || !configRef.current || !keysRef.current || !state.fees) return;
      setBusy(true);
      setStatus('İade isteniyor…');
      try {
        const msg = await pay(
          'refund',
          roundId,
          0,
          rpcRef.current.rpc,
          rpcRef.current.chain,
          configRef.current,
          account,
          keysRef.current,
          state.fees as FeeData,
          '0',
        );
        setStatus(msg);
      } catch {
        setStatus('İşlem gönderilemedi.');
      } finally {
        setBusy(false);
      }
    },
    [account, busy],
  );

  // Reconcile on state update
  const tryReconcile = useCallback(async () => {
    if (!account || busy || !rpcRef.current || !configRef.current || !keysRef.current) return;
    if (!hasPending(keysRef.current)) return;
    const msg = await reconcile(rpcRef.current.rpc, configRef.current, account, keysRef.current);
    if (msg) setStatus(msg);
  }, [account, busy]);

  // Get payments record
  const payments = keysRef.current ? getPayments(keysRef.current) : {};

  // Refundable round finder
  const findRefundableRound = useCallback(
    (cancelledRounds: number[]) => {
      return cancelledRounds.find((id) => payments[id] === 'paid') ?? null;
    },
    [payments],
  );

  const pending = keysRef.current ? hasPending(keysRef.current) : false;

  return {
    account,
    funded,
    busy,
    status,
    displayAddress,
    payments,
    pending,
    join,
    vote,
    refund,
    tryReconcile,
    findRefundableRound,
  };
}
