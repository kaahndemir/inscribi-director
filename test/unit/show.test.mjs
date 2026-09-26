import test from 'node:test';
import assert from 'node:assert/strict';
import {Show} from '../../src/server/show.mjs';
import {MemoryStore} from './helpers.mjs';

function showWith(steps, rounds, randomValues) {
  const values = [...randomValues];
  const show = new Show({
    config: {},
    chain: {},
    store: new MemoryStore({rounds}),
    story: {rounds: Array.from({length: steps}, (_, step) => ({step, choices: []}))},
    session: {state: {attempts: 1}},
    bridge: {},
    random: () => values.shift() ?? 0,
  });
  return show;
}

test('steps follow the story order first', () => {
  assert.equal(showWith(3, {}, []).nextStep(), 0);
  assert.equal(showWith(3, {1: {round: 1, step: 0, attempt: 1}}, []).nextStep(), 1);
});

test('after every step was used, steps repeat at random but never twice in a row', () => {
  const used = {1: {round: 1, step: 0, attempt: 1}, 2: {round: 2, step: 1, attempt: 1}, 3: {round: 3, step: 2, attempt: 1}};
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const step = showWith(3, used, [r]).nextStep();
    assert.ok(step >= 0 && step < 3);
    assert.notEqual(step, 2);
  }
});

test('rounds from an earlier session do not count toward this session\'s order', () => {
  assert.equal(showWith(3, {1: {round: 1, step: 0, attempt: 0}, 2: {round: 2, step: 1, attempt: 0}}, []).nextStep(), 0);
});

function liveShow({entries, latest, now}) {
  const show = new Show({
    config: {},
    chain: {},
    store: new MemoryStore({rounds: {7: {round: 7, step: 0, attempt: 1}}}),
    story: {rounds: [{step: 0, choices: [{label: 'A'}, {label: 'B'}, {label: 'C'}, {label: 'D'}]}]},
    session: {state: {attempts: 1}, live: true},
    bridge: {state: {entries}},
    now: () => now,
  });
  show.snapshot = latest && {latestRound: 7, blockTime: 0n, round: {deadline: 0n, fee: 1n, counts: [0n, 0n, 0n, 0n], ...latest}};
  return show;
}

const T0 = Date.parse('2026-09-26T10:00:00Z');
const at = (ms) => new Date(T0 + ms).toISOString();

test('the next round waits until the winner\'s first chunk has played in full', () => {
  const entry = {round: 7, choice: 1, status: 'applied', createdAt: at(0)};
  assert.equal(liveShow({entries: [entry], now: T0 + 15000}).effectWatched(7), false);
  const shown = {...entry, shownAt: at(6000), playbackMs: 4400};
  assert.equal(liveShow({entries: [shown], now: T0 + 10000}).effectWatched(7), false);
  assert.equal(liveShow({entries: [shown], now: T0 + 10400}).effectWatched(7), true);
});

test('the show moves on without a chunk report after a timeout, or at once when the direction was refused', () => {
  const entry = {round: 7, choice: 1, status: 'applied', createdAt: at(0)};
  assert.equal(liveShow({entries: [entry], now: T0 + 19000}).effectWatched(7), false);
  assert.equal(liveShow({entries: [entry], now: T0 + 20000}).effectWatched(7), true);
  assert.equal(liveShow({entries: [{...entry, status: 'rejected'}], now: T0}).effectWatched(7), true);
  assert.equal(liveShow({entries: [{...entry, status: 'abandoned'}], now: T0}).effectWatched(7), true);
});

test('a round with no votes or a cancelled round needs no wait; an unsteered winner does', () => {
  assert.equal(liveShow({entries: [], latest: {finalized: true, cancelled: false, winner: 255}, now: T0}).effectWatched(7), true);
  assert.equal(liveShow({entries: [], latest: {finalized: false, cancelled: true, winner: 0}, now: T0}).effectWatched(7), true);
  assert.equal(liveShow({entries: [], latest: {finalized: true, cancelled: false, winner: 2}, now: T0}).effectWatched(7), false);
});

test('screens say the winner is coming, then on stage once its chunk plays', () => {
  const entry = {round: 7, choice: 1, status: 'applied', createdAt: at(0), shownAt: at(6000), playbackMs: 4400};
  assert.deepEqual(liveShow({entries: [entry], now: T0 + 3000}).effect(), {round: 7, label: 'B', image: null, state: 'coming'});
  assert.deepEqual(liveShow({entries: [entry], now: T0 + 6000}).effect(), {round: 7, label: 'B', image: null, state: 'showing'});
  assert.equal(liveShow({entries: [{...entry, status: 'rejected'}], now: T0 + 6000}).effect(), null);
});

test('after the winner has been watched the Director gets one calm everyday scene', () => {
  const idles = [];
  const entry = {round: 7, choice: 1, status: 'applied', createdAt: at(0), shownAt: at(6000), playbackMs: 4400};
  const show = liveShow({entries: [entry], now: T0 + 8000});
  show.story.idle = ['calm A', 'calm B'];
  show.random = () => 0.9;
  show.bridge.unresolved = null;
  show.bridge.idle = (round, prompt) => idles.push([round, prompt]);
  show.steerIdle();
  assert.deepEqual(idles, []); // still playing
  show.now = () => T0 + 10400;
  show.steerIdle();
  assert.deepEqual(idles, [[7, 'calm B']]);
  show.bridge.state.entries.push({kind: 'idle', round: 7, status: 'waiting'});
  show.steerIdle();
  assert.equal(idles.length, 1);
  // The banner keeps naming the winner, not the idle scene.
  assert.equal(show.effect().label, 'B');
});
