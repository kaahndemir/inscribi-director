// Turns an on-chain round result into exactly one Director prompt.
// The stage browser owns the live Director connection: it picks up a waiting direction, sends it once
// and reports the provider's answer. A direction is saved before it becomes visible to the stage and is
// never re-sent automatically, because a lost acknowledgement does not prove the prompt was lost.

const FINAL = new Set(['applied', 'rejected', 'abandoned']);
// Used when a chunk report lacks its playback length (a 10 s chunk plays about 8.5 s).
const DEFAULT_PLAYBACK_SECONDS = 8.5;
const MAX_SECONDS = 15;

export class Bridge {
  constructor(store, {now = Date.now} = {}) {
    this.store = store;
    this.now = now;
    this.state = store.read('bridge', null) ?? Bridge.empty();
  }

  static empty() {
    // Version 1 is the opening `configure` message of every Director session.
    return {version: 1, entries: []};
  }

  save() {
    this.store.write('bridge', this.state);
  }

  // A new Director session starts a new prompt-version sequence.
  reset() {
    this.state = Bridge.empty();
    this.save();
  }

  get unresolved() {
    return this.state.entries.find((entry) => !FINAL.has(entry.status)) ?? null;
  }

  // Returns the saved entry, or null when an earlier direction is still unresolved.
  steer(round, choice, prompt) {
    if (!Number.isSafeInteger(round) || round < 1 || !Number.isInteger(choice) || choice < 0 || choice > 3 || !prompt?.trim()) {
      throw new Error('invalid direction');
    }
    const existing = this.state.entries.find((entry) => entry.round === round);
    if (existing) return existing;
    if (this.unresolved) return null;
    const entry = {round, choice, prompt, version: ++this.state.version, status: 'waiting', createdAt: new Date(this.now()).toISOString()};
    this.state.entries.push(entry);
    this.save();
    return entry;
  }

  // The direction the stage should send next, if any.
  current() {
    const entry = this.unresolved;
    return entry ? {type: 'prompt', prompt_version: entry.version, prompt: entry.prompt} : null;
  }

  // Applies a provider message relayed by the stage.
  message(message) {
    if (message?.type === 'prompt_applied') return this.settle(message.prompt_version, 'applied');
    if (message?.type === 'prompt_rejected') return this.settle(message.prompt_version, 'rejected');
    if (message?.type === 'error' && message.code === 'stale_prompt_version') return this.settle(message.prompt_version, 'rejected');
    if (message?.type === 'chunk') return this.chunk(message);
    return false;
  }

  // The first video chunk made with a direction is when the audience sees it. The stage reports each chunk
  // as it arrives; a chunk starts playing once the video already buffered has played out.
  chunk({prompt_version: version, playback_seconds: playback, buffer_depth_seconds: buffered}) {
    const entry = this.state.entries.find((e) => e.version === version);
    if (!entry || entry.shownAt || entry.status === 'rejected' || entry.status === 'abandoned') return false;
    const seconds = (value) => (Number.isFinite(value) && value > 0 ? Math.min(value, MAX_SECONDS) : 0);
    const now = this.now();
    entry.shownAt = new Date(now + seconds(buffered) * 1000).toISOString();
    entry.playbackMs = Math.round((seconds(playback) || DEFAULT_PLAYBACK_SECONDS) * 1000);
    // A chunk made with the prompt proves it was applied, even if that report is still on its way.
    if (entry.status === 'waiting') {
      entry.status = 'applied';
      entry.settledAt = new Date(now).toISOString();
    }
    this.save();
    return true;
  }

  // The operator gives up on a direction that never got an answer, so the show can continue.
  abandon() {
    const entry = this.unresolved;
    if (!entry) return false;
    entry.status = 'abandoned';
    this.save();
    return true;
  }

  settle(version, status) {
    const entry = this.state.entries.find((e) => e.version === version);
    if (!entry || FINAL.has(entry.status)) return false;
    entry.status = status;
    entry.settledAt = new Date(this.now()).toISOString();
    this.save();
    return true;
  }
}
