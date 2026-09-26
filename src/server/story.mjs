// Loads the story, builds the prompt for every choice and computes the hash that freezes a round's choices on chain.
import {readFileSync} from 'node:fs';
import {keccak256, toBytes} from 'viem';

const MAX_LABEL = 40;
const MAX_PROMPT = 2000;

export function loadStory(path) {
  return parseStory(JSON.parse(readFileSync(path, 'utf8')));
}

export function parseStory(raw) {
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
      return Object.freeze({label, prompt: text(`${premise} ${action} ${continuation}`, 'prompt')});
    });
    if (new Set(choices.map((c) => c.label)).size !== 4) throw new Error(`story: round ${index + 1} labels must be distinct`);
    return Object.freeze({step: index, choices: Object.freeze(choices)});
  });

  return Object.freeze({title: typeof raw.title === 'string' ? raw.title : 'Hikâye', opening, rounds: Object.freeze(rounds)});
}

// The hash covers labels and prompts, so changing the story after a round opened is detectable.
export function choicesHash(choices) {
  return keccak256(toBytes(JSON.stringify(choices.map(({label, prompt}) => ({label, prompt})))));
}
