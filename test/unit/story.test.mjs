import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {choicesHash, loadStory, parseStory} from '../../src/server/story.mjs';

const base = {
  opening: 'Opening scene.',
  premise: 'A robot in a room.',
  continuation: 'Continue.',
  rounds: [{choices: [{label: 'A', action: 'Does A.'}, {label: 'B', action: 'Does B.'}, {label: 'C', action: 'Does C.'}, {label: 'D', action: 'Does D.'}]}],
};

test('the shipped story is valid', () => {
  const story = loadStory(fileURLToPath(new URL('../../src/story/story.json', import.meta.url)));
  assert.ok(story.rounds.length >= 2);
  for (const round of story.rounds) assert.equal(round.choices.length, 4);
});

test('prompts combine premise, action and continuation', () => {
  const story = parseStory(base);
  assert.equal(story.rounds[0].choices[1].prompt, 'A robot in a room. Does B. Continue.');
});

test('rounds need four distinct, non-empty choices', () => {
  const three = structuredClone(base);
  three.rounds[0].choices.pop();
  assert.throws(() => parseStory(three), /exactly four/);
  const duplicate = structuredClone(base);
  duplicate.rounds[0].choices[1].label = 'A';
  assert.throws(() => parseStory(duplicate), /distinct/);
  const empty = structuredClone(base);
  empty.rounds[0].choices[2].action = ' ';
  assert.throws(() => parseStory(empty), /non-empty/);
});

test('the choices hash changes when any label or prompt changes', () => {
  const a = parseStory(base).rounds[0].choices;
  const changed = structuredClone(base);
  changed.rounds[0].choices[3].action = 'Does something else.';
  assert.equal(choicesHash(a), choicesHash(parseStory(base).rounds[0].choices));
  assert.notEqual(choicesHash(a), choicesHash(parseStory(changed).rounds[0].choices));
});

test('choice images must be plain file names and become URLs', () => {
  const withImage = structuredClone(base);
  withImage.rounds[0].choices[0].image = 'm01.jpg';
  const story = parseStory(withImage, {imageUrl: (name) => `/memes/${name}?v=x`});
  assert.equal(story.rounds[0].choices[0].image, '/memes/m01.jpg?v=x');
  assert.equal(story.rounds[0].choices[1].image, null);
  for (const bad of ['../secret.jpg', 'M01.JPG', 'a/b.jpg', 'x.svg']) {
    withImage.rounds[0].choices[0].image = bad;
    assert.throws(() => parseStory(withImage), /image/);
  }
});

test('the hash ignores images, so a new picture does not change what voters chose', () => {
  const withImage = structuredClone(base);
  withImage.rounds[0].choices[0].image = 'm01.jpg';
  assert.equal(choicesHash(parseStory(withImage).rounds[0].choices), choicesHash(parseStory(base).rounds[0].choices));
});

test('idle scenes are wrapped in the premise and their own continuation', () => {
  const story = parseStory({...base, idle: ['Walks.'], idleContinuation: 'Calm again.'});
  assert.deepEqual(story.idle, ['A robot in a room. Walks. Calm again.']);
  assert.deepEqual(parseStory(base).idle, []);
  assert.throws(() => parseStory({...base, idle: []}), /idle/);
});
