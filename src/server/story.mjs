// Loads the story, builds the prompt for every choice and computes the hash that freezes a round's choices on chain.
// A choice may name an image in the story's images/ folder; screens show it next to the label.
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {keccak256, toBytes} from 'viem';

const MAX_LABEL = 60;
const MAX_PROMPT = 2000;
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
  if (!Array.isArray(raw.rounds) || raw.rounds.length === 0) throw new Error('story: rounds must be a non-empty array');

  const rounds = raw.rounds.map((round, index) => {
    if (!Array.isArray(round.choices) || round.choices.length !== 4) throw new Error(`story: round ${index + 1} needs exactly four choices`);
    const choices = round.choices.map((choice, c) => {
      const label = text(choice.label, `round ${index + 1} choice ${c + 1} label`, MAX_LABEL);
      const action = text(choice.action, `round ${index + 1} choice ${c + 1} action`);
      if (choice.image !== undefined && !IMAGE_NAME.test(choice.image)) throw new Error(`story: round ${index + 1} choice ${c + 1} image must be a lowercase .jpg, .png or .webp file name`);
      const image = choice.image === undefined ? null : imageUrl(choice.image);
      return Object.freeze({label, prompt: text(`${premise} ${action} ${continuation}`, 'prompt'), image});
    });
    if (new Set(choices.map((c) => c.label)).size !== 4) throw new Error(`story: round ${index + 1} labels must be distinct`);
    return Object.freeze({step: index, choices: Object.freeze(choices)});
  });

  // Optional calm everyday scenes the Director returns to between winners.
  if (raw.idle !== undefined && (!Array.isArray(raw.idle) || raw.idle.length === 0)) throw new Error('story: idle must be a non-empty array when present');
  const idleContinuation = raw.idle ? text(raw.idleContinuation ?? raw.continuation, 'idleContinuation') : null;
  const idle = (raw.idle ?? []).map((action, i) => text(`${premise} ${text(action, `idle ${i + 1}`)} ${idleContinuation}`, 'prompt'));

  return Object.freeze({title: typeof raw.title === 'string' ? raw.title : 'Hikâye', opening, rounds: Object.freeze(rounds), idle: Object.freeze(idle)});
}

// The hash covers labels and prompts, so changing the story after a round opened is detectable.
export function choicesHash(choices) {
  return keccak256(toBytes(JSON.stringify(choices.map(({label, prompt}) => ({label, prompt})))));
}
