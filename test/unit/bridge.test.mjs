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

test('the first chunk made with a direction records when it reaches the screen and how long it plays', () => {
  let now = Date.parse('2026-09-26T10:00:00Z');
  const bridge = new Bridge(new MemoryStore(), {now: () => now});
  bridge.steer(1, 0, 'a');
  assert.equal(bridge.message({type: 'prompt_applied', prompt_version: 2}), true);
  now += 3000;
  assert.equal(bridge.message({type: 'chunk', prompt_version: 2, playback_seconds: 4.4, buffer_depth_seconds: 0.5}), true);
  const [entry] = bridge.state.entries;
  assert.equal(entry.shownAt, '2026-09-26T10:00:03.500Z');
  assert.equal(entry.playbackMs, 4400);
  // Later chunks with the same prompt do not move it.
  now += 5000;
  assert.equal(bridge.message({type: 'chunk', prompt_version: 2, playback_seconds: 4.4}), false);
  assert.equal(bridge.state.entries[0].shownAt, '2026-09-26T10:00:03.500Z');
});

test('a chunk for a direction still waiting also settles it; refused directions are never shown', () => {
  const bridge = new Bridge(new MemoryStore());
  bridge.steer(1, 0, 'a');
  assert.equal(bridge.message({type: 'chunk', prompt_version: 2, playback_seconds: 99}), true);
  assert.equal(bridge.state.entries[0].status, 'applied');
  assert.equal(bridge.state.entries[0].playbackMs, 15000);
  assert.equal(bridge.message({type: 'prompt_applied', prompt_version: 2}), false);

  bridge.steer(2, 1, 'b');
  bridge.message({type: 'prompt_rejected', prompt_version: 3});
  assert.equal(bridge.message({type: 'chunk', prompt_version: 3, playback_seconds: 4}), false);
  assert.equal(bridge.state.entries[1].shownAt, undefined);
});
