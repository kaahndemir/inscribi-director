// Loads the story (a deck of memes and a pool of situations), builds the prompt for every meme and computes
// the hash that freezes a round's choices on chain. A meme may name an image in the story's images/ folder.
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {keccak256, toBytes} from 'viem';

const MAX_LABEL = 60;
const MAX_PROMPT = 2000;
const MAX_TOPIC = 40;
const MAX_QUESTION = 160;
export const IMAGE_NAME = /^[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/;

export function loadStory(path) {
  const imageDir = join(dirname(path), 'images');
  // Image URLs carry a hash of the file, so a replaced image is never served from an old cache.
  const imageUrl = (name) => {
    const file = join(imageDir, name);
    if (!existsSync(file)) throw new Error(`story: image ${name} not found in ${imageDir}`);
    return `/memes/${name}?v=${createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10)}`;
  };
  return {...parseStory(JSON.parse(readFileSync(path, 'utf8')), {imageUrl}), imageDir};
}

export function parseStory(raw, {imageUrl = (name) => `/memes/${name}`} = {}) {
  const text = (value, name, max = MAX_PROMPT) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`story: ${name} must be a non-empty string up to ${max} characters`);
    return value.trim();
  };
  const opening = text(raw.opening, 'opening');
  const premise = text(raw.premise, 'premise');
  const continuation = text(raw.continuation, 'continuation');
  // The deck: every meme can be dealt into any round. Each round shows a situation from the question
  // pool and four memes; the audience picks the one that fits best.
  if (!Array.isArray(raw.memes) || raw.memes.length < 4) throw new Error('story: memes must list at least four memes');
  const memes = raw.memes.map((meme, i) => {
    const label = text(meme.label, `meme ${i + 1} label`, MAX_LABEL);
    const action = text(meme.action, `meme ${i + 1} action`);
    if (meme.image !== undefined && !IMAGE_NAME.test(meme.image)) throw new Error(`story: meme ${i + 1} image must be a lowercase .jpg, .png or .webp file name`);
    const image = meme.image === undefined ? null : imageUrl(meme.image);
    return Object.freeze({id: typeof meme.id === 'string' ? meme.id : String(i + 1), label, prompt: text(`${premise} ${action} ${continuation}`, 'prompt'), image});
  });
  if (new Set(memes.map((m) => m.label)).size !== memes.length) throw new Error('story: meme labels must be distinct');
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) throw new Error('story: questions must be a non-empty array');
  const questions = raw.questions.map((q, i) => Object.freeze({topic: text(q.topic, `question ${i + 1} topic`, MAX_TOPIC), question: text(q.question, `question ${i + 1} question`, MAX_QUESTION)}));

  // Optional calm everyday scenes the Director returns to between winners.
  if (raw.idle !== undefined && (!Array.isArray(raw.idle) || raw.idle.length === 0)) throw new Error('story: idle must be a non-empty array when present');
  const idleContinuation = raw.idle ? text(raw.idleContinuation ?? raw.continuation, 'idleContinuation') : null;
  const idle = (raw.idle ?? []).map((action, i) => text(`${premise} ${text(action, `idle ${i + 1}`)} ${idleContinuation}`, 'prompt'));

  return Object.freeze({title: typeof raw.title === 'string' ? raw.title : 'Hikâye', opening, memes: Object.freeze(memes), questions: Object.freeze(questions), idle: Object.freeze(idle)});
}

// The hash covers labels and prompts, so changing the story after a round opened is detectable.
export function choicesHash(choices) {
  return keccak256(toBytes(JSON.stringify(choices.map(({label, prompt}) => ({label, prompt})))));
}
