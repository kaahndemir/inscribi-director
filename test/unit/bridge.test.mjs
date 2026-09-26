import test from 'node:test';
import assert from 'node:assert/strict';
import {Bridge} from '../../src/server/bridge.mjs';
import {MemoryStore} from './helpers.mjs';

test('a winner becomes one waiting direction with the next prompt version', () => {
  const bridge = new Bridge(new MemoryStore());
  const entry = bridge.steer(4, 2, 'prompt');
  assert.equal(entry.version, 2);
  assert.deepEqual(bridge.current(), {type: 'prompt', prompt_version: 2, prompt: 'prompt'});
});

test('the same round is never steered twice', () => {
  const bridge = new Bridge(new MemoryStore());
  const first = bridge.steer(1, 0, 'a');
  assert.equal(bridge.steer(1, 3, 'b'), first);
  assert.equal(bridge.state.entries.length, 1);
});

test('a new direction waits until the previous one is answered', () => {
  const bridge = new Bridge(new MemoryStore());
  bridge.steer(1, 0, 'a');
  assert.equal(bridge.steer(2, 1, 'b'), null);
  assert.equal(bridge.message({type: 'prompt_applied', prompt_version: 2}), true);
  assert.equal(bridge.steer(2, 1, 'b').version, 3);
});

test('rejections, stale errors and abandon settle a direction; late answers are ignored', () => {
  const bridge = new Bridge(new MemoryStore());
  bridge.steer(1, 0, 'a');
  bridge.message({type: 'error', code: 'stale_prompt_version', prompt_version: 2});
  assert.equal(bridge.state.entries[0].status, 'rejected');
  assert.equal(bridge.message({type: 'prompt_applied', prompt_version: 2}), false);
  bridge.steer(2, 1, 'b');
  assert.equal(bridge.abandon(), true);
  assert.equal(bridge.current(), null);
});

test('state survives a restart and nothing is replayed automatically', () => {
  const store = new MemoryStore();
  new Bridge(store).steer(1, 0, 'a');
  const restarted = new Bridge(store);
  assert.equal(restarted.state.entries[0].status, 'waiting');
  assert.equal(restarted.steer(2, 0, 'b'), null);
});

test('reset starts a new version sequence for a new Director session', () => {
  const bridge = new Bridge(new MemoryStore());
  bridge.steer(1, 0, 'a');
  bridge.reset();
  assert.equal(bridge.steer(5, 1, 'c').version, 2);
});
