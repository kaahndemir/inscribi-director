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
