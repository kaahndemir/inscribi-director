// Guards the paid Director session: a fixed budget of attempts, one provider session per attempt,
// a hard time limit and an operator lease kept alive by the stage tab.
// A server restart ends a running session and never starts a new one by itself.

const OWNER = /^[a-zA-Z0-9-]{16,80}$/;

export class DirectorSession {
  constructor({store, maxSessions, maxMs, leaseMs = 8000, now = Date.now}) {
    this.store = store;
    this.maxSessions = maxSessions;
    this.maxMs = maxMs;
    this.leaseMs = leaseMs;
    this.now = now;
    this.state = store.read('session', null) ?? {attempts: 0, status: 'idle'};
    if (this.state.status === 'live') this.end('interrupted');
  }

  get live() {
    this.tick();
    return this.state.status === 'live';
  }

  get remaining() {
    return Math.max(0, this.maxSessions - this.state.attempts);
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
    const now = this.now();
    this.state = {
      attempts: this.state.attempts + 1,
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
    if (now - this.state.startedAt >= this.maxMs) this.end('time-limit');
    else if (now - this.state.lastHeartbeat >= this.leaseMs) this.end('stage-lost');
  }

  end(reason = 'stopped') {
    if (this.state.status !== 'live') return false;
    const {owner, ...rest} = this.state;
    this.state = {...rest, status: 'ended', reason, endedAt: this.now(), elapsedMs: this.now() - this.state.startedAt};
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
    return {...state, elapsedMs, maxMs: this.maxMs, maxSessions: this.maxSessions, remaining: this.remaining};
  }
}
