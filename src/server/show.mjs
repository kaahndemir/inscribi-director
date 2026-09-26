// The show: keeps a fresh snapshot of the chain, runs rounds during a live Director session and
// hands each winner to the bridge.
//
// Round flow while the Director is live:
//   open (story step N) -> votes until the on-chain deadline -> finalize -> winner prompt
//   -> the winner's first video chunk plays in full -> next step
// Steps run in story order; once every step has been used in this session, steps repeat at random.
// If the session ends while a round is open, that round is cancelled so voters can take a refund.
import {formatEther, parseEther} from 'viem';
import {choicesHash} from './story.mjs';

const TICK_MS = 1000;
const BALANCE_REFRESH_MS = 10000;
// Leave time after a round for the prompt to be applied and one video chunk (~8.5 s) to play.
const VISIBLE_EFFECT_MS = 15000;
// If the provider never reports the winner's chunk, the show moves on after this long.
const EFFECT_TIMEOUT_MS = 20000;
const NO_WINNER = 255;

export class Show {
  constructor({config, chain, store, story, session, bridge, log = () => {}, random = Math.random, now = Date.now}) {
    this.random = random;
    this.now = now;
    this.config = config;
    this.chain = chain;
    this.store = store;
    this.story = story;
    this.session = session;
    this.bridge = bridge;
    this.log = log;
    this.rounds = store.read('rounds', {});
    this.cancelled = store.read('cancelled', []);
    this.snapshot = null;
    this.stale = true;
    this.fees = null;
    this.operatorBalance = null;
    this.balanceAt = 0;
    this.queue = Promise.resolve();
    this.timer = null;
    this.lastError = null;
  }

  async start() {
    await this.refresh();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  // Show actions run one at a time, whether they come from the timer or from the operator.
  exclusive(task) {
    const run = this.queue.then(task);
    this.queue = run.catch(() => {});
    return run;
  }

  async refresh() {
    try {
      const snapshot = await this.chain.snapshot();
      if (!this.snapshot || snapshot.block >= this.snapshot.block) this.snapshot = snapshot;
      this.fees = await this.chain.fees();
      if (Date.now() - this.balanceAt > BALANCE_REFRESH_MS) {
        this.operatorBalance = await this.chain.balance(this.chain.operator);
        this.balanceAt = Date.now();
      }
      this.stale = false;
    } catch (error) {
      this.lastError = String(error?.shortMessage ?? error?.message ?? error);
      if (!this.stale) this.log('chain refresh failed', this.lastError);
      this.stale = true;
    }
  }

  get latest() {
    const snap = this.snapshot;
    if (!snap?.latestRound || !snap.round) return null;
    const {round} = snap;
    return {
      id: snap.latestRound,
      deadline: Number(round.deadline),
      fee: round.fee,
      counts: round.counts.map(Number),
      winner: Number(round.winner),
      finalized: round.finalized,
      cancelled: round.cancelled,
      open: !round.finalized && !round.cancelled,
      expired: snap.blockTime >= round.deadline,
      meta: this.rounds[snap.latestRound] ?? null,
    };
  }

  tick() {
    return this.exclusive(async () => {
      await this.refresh();
      if (this.stale) return;
      const round = this.latest;
      if (!this.session.live) {
        if (round?.open && round.meta) await this.cancelLatest('session ended');
        return;
      }
      if (round?.open && round.expired) await this.finalizeLatest();
      this.steerPending();
      if (this.config.autoRounds && this.canAutoOpen()) await this.openNext(this.config.roundSeconds);
    }).catch((error) => {
      this.lastError = String(error?.shortMessage ?? error?.message ?? error);
      this.log('tick failed', this.lastError);
    });
  }

  roundsThisSession() {
    return Object.values(this.rounds).filter((r) => r.attempt === this.session.state.attempts);
  }

  canAutoOpen() {
    const state = this.session.state;
    if (!state.configured || !state.firstFrameAt) return false;
    const round = this.latest;
    if (round?.open) return false;
    const previous = this.roundsThisSession().at(-1);
    if (previous && !this.effectWatched(previous.round)) return false;
    if (this.session.maxMs === null) return true;
    const remainingMs = state.startedAt + this.session.maxMs - this.now();
    return remainingMs >= this.config.roundSeconds * 1000 + VISIBLE_EFFECT_MS;
  }

  // The audience watches a winner before the next vote: the first chunk made with it has played in full.
  // A round without a winner, and a direction the provider refused or the operator abandoned, need no wait.
  effectWatched(roundId) {
    const entry = this.bridge.state.entries.find((e) => e.round === roundId);
    if (!entry) {
      const round = this.latest;
      return round?.id === roundId && (round.cancelled || (round.finalized && round.winner === NO_WINNER));
    }
    if (entry.status === 'rejected' || entry.status === 'abandoned') return true;
    const now = this.now();
    if (entry.shownAt) return now >= Date.parse(entry.shownAt) + entry.playbackMs;
    return now - Date.parse(entry.createdAt) >= EFFECT_TIMEOUT_MS;
  }

  // What the screens say about the latest winner: on its way to the video, then on stage.
  effect() {
    if (!this.session.live) return null;
    const entry = this.bridge.state.entries.at(-1);
    if (!entry || entry.status === 'rejected' || entry.status === 'abandoned') return null;
    const label = this.choicesFor(this.rounds[entry.round])?.[entry.choice]?.label;
    if (!label) return null;
    const showing = !!entry.shownAt && this.now() >= Date.parse(entry.shownAt);
    return {round: entry.round, label, state: showing ? 'showing' : 'coming'};
  }

  // Operator-facing actions ------------------------------------------------------------

  openRound(duration = this.config.roundSeconds) {
    return this.exclusive(() => this.openNext(duration));
  }

  finalizeRound() {
    return this.exclusive(() => this.finalizeLatest());
  }

  cancelRound() {
    return this.exclusive(() => this.cancelLatest('operator'));
  }

  async openNext(duration) {
    if (!Number.isInteger(duration) || duration < 5 || duration > 600) throw new Error('round duration must be 5-600 seconds');
    if (!this.session.live) throw new Error('the Director session is not live');
    if (this.latest?.open) throw new Error('a round is already open');
    const step = this.nextStep();
    const storyRound = this.story.rounds[step];

    const hash = choicesHash(storyRound.choices);
    const fee = parseEther(this.config.voteFeeMon);
    await this.chain.write('open', [hash, BigInt(duration), fee]);
    const id = Number(await this.chain.read('latestRound'));
    this.rounds[id] = {round: id, step, attempt: this.session.state.attempts, choicesHash: hash, openedAt: new Date().toISOString()};
    this.store.write('rounds', this.rounds);
    this.log('round opened', {id, step: step + 1});
    await this.refresh();
    return this.rounds[id];
  }

  // Story order first; afterwards a random step, never the same one twice in a row.
  nextStep() {
    const opened = this.roundsThisSession();
    const total = this.story.rounds.length;
    if (opened.length < total) return opened.length;
    if (total === 1) return 0;
    const last = opened.at(-1).step;
    const pick = Math.floor(this.random() * (total - 1));
    return pick >= last ? pick + 1 : pick;
  }

  async finalizeLatest() {
    const round = this.latest;
    if (!round?.open) throw new Error('no open round');
    if (!round.expired) throw new Error('the round has not ended yet');
    await this.chain.write('finalize', [BigInt(round.id)]);
    await this.refresh();
    this.log('round finalized', {id: round.id, winner: this.latest?.winner});
    this.steerPending();
  }

  async cancelLatest(reason) {
    const round = this.latest;
    if (!round?.open) throw new Error('no open round');
    await this.chain.write('cancel', [BigInt(round.id)]);
    if (!this.cancelled.includes(round.id)) {
      this.cancelled.push(round.id);
      this.store.write('cancelled', this.cancelled);
    }
    this.log('round cancelled', {id: round.id, reason});
    await this.refresh();
  }

  // Hands the latest finalized winner to the bridge. Retried every tick until the bridge accepts it.
  steerPending() {
    const round = this.latest;
    if (!round?.finalized || round.winner === NO_WINNER || !round.meta || !this.session.live) return;
    if (round.meta.attempt !== this.session.state.attempts) return;
    const choice = this.story.rounds[round.meta.step]?.choices[round.winner];
    if (choice) this.bridge.steer(round.id, round.winner, choice.prompt);
  }

  // Views -------------------------------------------------------------------------------

  choicesFor(meta) {
    return meta ? this.story.rounds[meta.step]?.choices ?? null : null;
  }

  publicState() {
    const round = this.latest;
    const choices = this.choicesFor(round?.meta);
    const session = this.session.snapshot();
    return {
      title: this.story.title,
      joinUrl: this.config.publicOrigin,
      stale: this.stale,
      blockTime: this.snapshot ? Number(this.snapshot.blockTime) : null,
      fees: this.fees ? {maxFeePerGas: String(this.fees.maxFeePerGas), maxPriorityFeePerGas: String(this.fees.maxPriorityFeePerGas)} : null,
      round: round && choices
        ? {
            id: round.id,
            storyStep: round.meta.step + 1,
            number: Object.values(this.rounds).filter((r) => r.attempt === round.meta.attempt && r.round <= round.id).length,
            labels: choices.map((c) => c.label),
            counts: round.counts,
            deadline: round.deadline,
            fee: String(round.fee),
            open: round.open,
            finalized: round.finalized,
            cancelled: round.cancelled,
            winner: round.winner === NO_WINNER ? null : round.winner,
          }
        : null,
      cancelledRounds: this.cancelled,
      effect: this.effect(),
      director: {status: session.status, live: session.status === 'live', firstFrame: !!session.firstFrameAt},
    };
  }

  adminState(drip) {
    const session = this.session.snapshot();
    return {
      ...this.publicState(),
      session,
      bridge: this.bridge.state,
      rounds: Object.values(this.rounds).slice(-10),
      drip,
      operator: {address: this.chain.operator, balanceMon: this.operatorBalance === null ? null : formatEther(this.operatorBalance)},
      settings: {autoRounds: this.config.autoRounds, roundSeconds: this.config.roundSeconds, directorMode: this.config.directorMode, voteFeeMon: this.config.voteFeeMon, chunkSeconds: this.config.chunkSeconds},
      story: {title: this.story.title, opening: this.story.opening, steps: this.story.rounds.length},
      // Spend at provider list price ($0.08/s, 60 s minimum per session); an upper bound of the real bill on the fal dashboard.
      spentUsd: session.spentUsd,
      budgetUsd: session.budgetUsd,
      lastError: this.lastError,
    };
  }
}
