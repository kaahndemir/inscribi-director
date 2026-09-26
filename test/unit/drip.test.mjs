import test from 'node:test';
import assert from 'node:assert/strict';
import {DripGate} from '../../src/server/drip.mjs';
import {MemoryStore} from './helpers.mjs';

const ADDRESS = '0x00000000000000000000000000000000000000a1';

function fakeChain({failBroadcast = false, landed = new Map()} = {}) {
  const chain = {
    transfers: 0,
    rebroadcasts: 0,
    async transfer(to, value, onSigned) {
      chain.transfers++;
      const hash = `0xhash${chain.transfers}`;
      await onSigned({raw: `0xraw${chain.transfers}`, hash});
      if (failBroadcast) throw new Error('lost answer');
      landed.set(hash, {status: 'success'});
      return {status: 'success'};
    },
    async rebroadcast(raw) {
      chain.rebroadcasts++;
      return {status: 'success', raw};
    },
    async receipt(hash) {
      return landed.get(hash) ?? null;
    },
  };
  return chain;
}

test('an address is funded once, even with concurrent requests', async () => {
  const chain = fakeChain();
  const gate = new DripGate({store: new MemoryStore(), chain, amount: 1n, limit: 10});
  const results = await Promise.all(Array.from({length: 20}, () => gate.request(ADDRESS)));
  assert.equal(chain.transfers, 1);
  assert.ok(results.every((r) => r.status === 'confirmed'));
  assert.equal((await gate.request(ADDRESS.toUpperCase().replace('0X', '0x'))).status, 'confirmed');
  assert.equal(chain.transfers, 1);
});

test('a lost answer is resolved by re-sending the same signed bytes, never a new payment', async () => {
  const store = new MemoryStore();
  const gate = new DripGate({store, chain: fakeChain({failBroadcast: true}), amount: 1n, limit: 10});
  assert.equal((await gate.request(ADDRESS)).status, 'sent');
  const retryChain = fakeChain();
  const retry = new DripGate({store, chain: retryChain, amount: 1n, limit: 10});
  assert.equal((await retry.request(ADDRESS)).status, 'confirmed');
  assert.equal(retryChain.transfers, 0);
  assert.equal(retryChain.rebroadcasts, 1);
});

test('the room limit counts funded and in-flight wallets', async () => {
  const gate = new DripGate({store: new MemoryStore(), chain: fakeChain(), amount: 1n, limit: 1});
  await gate.request(ADDRESS);
  await assert.rejects(gate.request('0x00000000000000000000000000000000000000b2'), /limit/);
});
