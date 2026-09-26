import test from 'node:test';
import assert from 'node:assert/strict';
import {Show} from '../../src/server/show.mjs';
import {MemoryStore} from './helpers.mjs';

function dealer(memeCount, questionCount, rounds, random = Math.random) {
  return new Show({
    config: {},
    chain: {},
    store: new MemoryStore({rounds}),
    story: {memes: Array.from({length: memeCount}, (_, i) => ({label: `M${i}`})), questions: Array.from({length: questionCount}, (_, i) => ({question: `Q${i}`}))},
    session: {state: {attempts: 1}},
    bridge: {},
    random,
  });
}

test('a deal is one situation and four different memes', () => {
  for (let i = 0; i < 50; i++) {
    const {question, memes} = dealer(10, 5, {}).deal();
    assert.ok(question >= 0 && question < 5);
    assert.equal(new Set(memes).size, 4);
    assert.ok(memes.every((m) => m >= 0 && m < 10));
  }
});

test('memes and situations do not repeat until the pool runs out, then never straight after', () => {
  const rounds = {};
  const seenMemes = [];
  const seenQuestions = [];
  for (let id = 1; id <= 3; id++) {
    const deal = dealer(12, 3, rounds).deal();
    rounds[id] = {round: id, attempt: 1, ...deal};
    seenMemes.push(...deal.memes);
    seenQuestions.push(deal.question);
  }
  assert.equal(new Set(seenMemes).size, 12);
  assert.equal(new Set(seenQuestions).size, 3);
  const next = dealer(12, 3, rounds).deal();
  assert.ok(next.memes.every((m) => !rounds[3].memes.includes(m)));
  assert.notEqual(next.question, rounds[3].question);
});

test('rounds from an earlier session do not use up this session\'s deck', () => {
  const earlier = {1: {round: 1, attempt: 0, question: 0, memes: [0, 1, 2, 3]}};
  const picks = new Set();
  for (let i = 0; i < 40; i++) dealer(4, 1, earlier).deal().memes.forEach((m) => picks.add(m));
  assert.equal(picks.size, 4);
});

function liveShow({entries, latest, now}) {
  const show = new Show({
    config: {},
    chain: {},
    store: new MemoryStore({rounds: {7: {round: 7, question: 0, memes: [0, 1, 2, 3], attempt: 1}}}),
    story: {memes: [{label: 'A'}, {label: 'B'}, {label: 'C'}, {label: 'D'}], questions: [{topic: 'T', question: 'Q'}]},
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
  assert.deepEqual(liveShow({entries: [entry], now: T0 + 3000}).effect(), {round: 7, label: 'B', image: null, state: 'coming', etaAt: null});
  assert.deepEqual(liveShow({entries: [entry], now: T0 + 6000}).effect(), {round: 7, label: 'B', image: null, state: 'showing', endsAt: T0 + 10400});
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

test('a chosen meme gets a fixed countdown once the provider accepted it', () => {
  const entry = {round: 7, choice: 2, status: 'waiting', createdAt: at(0)};
  const show = liveShow({entries: [entry], now: T0 + 2000});
  assert.equal(show.effect().etaAt, null);
  Object.assign(entry, {status: 'applied', etaAt: T0 + 7500});
  assert.equal(show.effect().etaAt, T0 + 7500);
  Object.assign(entry, {shownAt: at(7400), playbackMs: 8500});
  show.now = () => T0 + 8000;
  assert.deepEqual([show.effect().state, show.effect().endsAt], ['showing', T0 + 15900]);
});
