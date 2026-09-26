// Guards the paid Director session: a budget of attempts and dollars, one provider session per attempt,
// an optional time limit and an operator lease kept alive by the stage tab.
// A server restart ends a running session and never starts a new one by itself.
//
// Spend is tracked at the provider's list price ($0.08 per second, at least 60 s per session). That is an
// upper bound of the real bill, so stopping at the budget keeps the real spend below it.

const OWNER = /^[a-zA-Z0-9-]{16,80}$/;
export const LIST_PRICE_PER_SECOND = 0.08;
export const MIN_BILLED_SECONDS = 60;

export const listPriceUsd = (elapsedMs) => Math.max(MIN_BILLED_SECONDS, Math.ceil(elapsedMs / 1000)) * LIST_PRICE_PER_SECOND;

export class DirectorSession {
  // maxMs = null means no server-side time limit (the operator or the provider ends the session).
  // budgetUsd = null means spend is not counted (fake mode).
  constructor({store, maxSessions, maxMs, budgetUsd = null, leaseMs = 8000, now = Date.now}) {
    this.store = store;
    this.maxSessions = maxSessions;
    this.maxMs = maxMs;
    this.budgetUsd = budgetUsd;
    this.leaseMs = leaseMs;
    this.now = now;
    this.state = store.read('session', null) ?? {attempts: 0, status: 'idle', spentUsd: 0};
    this.state.spentUsd ??= 0;
    if (this.state.status === 'live') this.end('interrupted');
  }

  get live() {
    this.tick();
    return this.state.status === 'live';
  }

  get remaining() {
    return Math.max(0, this.maxSessions - this.state.attempts);
  }

  // Spend of finished sessions plus the running one, at list price.
  get spentUsd() {
    const current = this.state.status === 'live' && this.budgetUsd !== null && this.state.providerSessionOpened ? listPriceUsd(this.now() - this.state.startedAt) : 0;
    return this.state.spentUsd + current;
  }

  save() {
    this.store.write('session', this.state);
  }

  start(owner) {
    this.tick();
    if (typeof owner !== 'string' || !OWNER.test(owner)) throw new Error('invalid stage id');
    if (this.state.status === 'live') {
      if (this.state.owner === owner) return;
      throw new Error('another stage owns the live session');
    }
    if (this.remaining === 0) throw new Error('session budget used');
    if (this.budgetUsd !== null && this.budgetUsd - this.state.spentUsd < listPriceUsd(0)) throw new Error('fal budget used');
    const now = this.now();
    this.state = {
      attempts: this.state.attempts + 1,
      spentUsd: this.state.spentUsd,
      status: 'live',
      owner,
      startedAt: now,
      lastHeartbeat: now,
      providerSessionOpened: false,
      providerSessionId: null,
      configured: false,
      firstFrameAt: null,
    };
    this.save();
  }

  heartbeat(owner) {
    this.requireOwner(owner);
    this.state.lastHeartbeat = this.now();
    this.save();
  }

  requireOwner(owner) {
    if (!this.live || this.state.owner !== owner) throw new Error('stage lease required');
  }

  tick() {
    if (this.state.status !== 'live') return;
    const now = this.now();
    if (this.maxMs !== null && now - this.state.startedAt >= this.maxMs) this.end('time-limit');
    else if (this.budgetUsd !== null && this.spentUsd >= this.budgetUsd) this.end('budget');
    else if (now - this.state.lastHeartbeat >= this.leaseMs) this.end('stage-lost');
  }

  end(reason = 'stopped') {
    if (this.state.status !== 'live') return false;
    const {owner, ...rest} = this.state;
    const elapsedMs = this.now() - this.state.startedAt;
    const cost = this.budgetUsd !== null && this.state.providerSessionOpened ? listPriceUsd(elapsedMs) : 0;
    this.state = {...rest, status: 'ended', reason, endedAt: this.now(), elapsedMs, spentUsd: this.state.spentUsd + cost};
    this.save();
    return true;
  }

  // Called before the proxy forwards POST /session: only one provider session per attempt.
  claimProviderSession() {
    if (!this.live || this.state.providerSessionOpened) return false;
    this.state.providerSessionOpened = true;
    this.save();
    return true;
  }

  recordProviderSession(id) {
    if (this.live && typeof id === 'string') {
      this.state.providerSessionId = id;
      this.save();
    }
  }

  allowsProviderHeartbeat(id) {
    return this.live && !!this.state.providerSessionId && id === this.state.providerSessionId;
  }

  markConfigured() {
    if (this.live && !this.state.configured) {
      this.state.configured = true;
      this.save();
    }
  }

  markFirstFrame() {
    if (this.live && !this.state.firstFrameAt) {
      this.state.firstFrameAt = this.now();
      this.save();
    }
  }

  snapshot() {
    this.tick();
    const {owner, ...state} = this.state;
    const elapsedMs = state.status === 'live' ? this.now() - state.startedAt : (state.elapsedMs ?? 0);
    return {
      ...state,
      elapsedMs,
      maxMs: this.maxMs,
      maxSessions: this.maxSessions,
      remaining: this.remaining,
      spentUsd: Math.round(this.spentUsd * 100) / 100,
      budgetUsd: this.budgetUsd,
    };
  }
}
