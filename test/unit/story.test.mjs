import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {choicesHash, loadStory, parseStory} from '../../src/server/story.mjs';

const base = {
  opening: 'Opening scene.',
  premise: 'A robot in a room.',
  continuation: 'Continue.',
  memes: [{label: 'A', action: 'Does A.'}, {label: 'B', action: 'Does B.'}, {label: 'C', action: 'Does C.'}, {label: 'D', action: 'Does D.'}],
  questions: [{topic: 'KONU', question: 'Bir durum…'}],
};

test('the shipped story is valid', () => {
  const story = loadStory(fileURLToPath(new URL('../../src/story/story.json', import.meta.url)));
  assert.ok(story.memes.length >= 40);
  assert.ok(story.questions.length >= 40);
  assert.ok(story.memes.every((m) => m.image));
});

test('prompts combine premise, action and continuation', () => {
  const story = parseStory(base);
  assert.equal(story.memes[1].prompt, 'A robot in a room. Does B. Continue.');
});

test('the deck needs four or more distinct, non-empty memes and at least one situation', () => {
  const three = structuredClone(base);
  three.memes.pop();
  assert.throws(() => parseStory(three), /at least four/);
  const duplicate = structuredClone(base);
  duplicate.memes[1].label = 'A';
  assert.throws(() => parseStory(duplicate), /distinct/);
  const empty = structuredClone(base);
  empty.memes[2].action = ' ';
  assert.throws(() => parseStory(empty), /non-empty/);
  assert.throws(() => parseStory({...base, questions: []}), /questions/);
  assert.throws(() => parseStory({...base, questions: [{topic: 'X', question: ''}]}), /question 1/);
});

test('the choices hash changes when any label or prompt changes', () => {
  const a = parseStory(base).memes;
  const changed = structuredClone(base);
  changed.memes[3].action = 'Does something else.';
  assert.equal(choicesHash(a), choicesHash(parseStory(base).memes));
  assert.notEqual(choicesHash(a), choicesHash(parseStory(changed).memes));
});

test('choice images must be plain file names and become URLs', () => {
  const withImage = structuredClone(base);
  withImage.memes[0].image = 'm01.jpg';
  const story = parseStory(withImage, {imageUrl: (name) => `/memes/${name}?v=x`});
  assert.equal(story.memes[0].image, '/memes/m01.jpg?v=x');
  assert.equal(story.memes[1].image, null);
  for (const bad of ['../secret.jpg', 'M01.JPG', 'a/b.jpg', 'x.svg']) {
    withImage.memes[0].image = bad;
    assert.throws(() => parseStory(withImage), /image/);
  }
});

test('the hash ignores images, so a new picture does not change what voters chose', () => {
  const withImage = structuredClone(base);
  withImage.memes[0].image = 'm01.jpg';
  assert.equal(choicesHash(parseStory(withImage).memes), choicesHash(parseStory(base).memes));
});

test('idle scenes are wrapped in the premise and their own continuation', () => {
  const story = parseStory({...base, idle: ['Walks.'], idleContinuation: 'Calm again.'});
  assert.deepEqual(story.idle, ['A robot in a room. Walks. Calm again.']);
  assert.deepEqual(parseStory(base).idle, []);
  assert.throws(() => parseStory({...base, idle: []}), /idle/);
});
