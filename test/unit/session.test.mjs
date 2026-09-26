import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectorSession} from '../../src/server/session.mjs';
import {MemoryStore} from './helpers.mjs';

const OWNER = 'stage-0000-0000-0001';

function clock(start = 1_000_000) {
  const time = {now: start};
  return {time, now: () => time.now};
}

test('the attempt budget is enforced and survives restarts', () => {
  const store = new MemoryStore();
  const {now} = clock();
  const session = new DirectorSession({store, maxSessions: 1, maxMs: 60000, now});
  session.start(OWNER);
  session.end('operator');
  assert.throws(() => session.start(OWNER), /budget/);
  assert.throws(() => new DirectorSession({store, maxSessions: 1, maxMs: 60000, now}).start(OWNER), /budget/);
});

test('only one provider session per attempt', () => {
  const session = new DirectorSession({store: new MemoryStore(), maxSessions: 2, maxMs: 60000, now: clock().now});
  session.start(OWNER);
  assert.equal(session.claimProviderSession(), true);
  assert.equal(session.claimProviderSession(), false);
  session.recordProviderSession('fal-1');
  assert.equal(session.allowsProviderHeartbeat('fal-1'), true);
  assert.equal(session.allowsProviderHeartbeat('fal-2'), false);
});

test('the hard time limit ends the session even with heartbeats', () => {
  const {time, now} = clock();
  const session = new DirectorSession({store: new MemoryStore(), maxSessions: 1, maxMs: 60000, now});
  session.start(OWNER);
  for (let t = 0; t < 12; t++) {
    time.now += 5000;
    if (session.live) session.heartbeat(OWNER);
  }
  assert.equal(session.live, false);
  assert.equal(session.state.reason, 'time-limit');
  assert.equal(session.allowsProviderHeartbeat('anything'), false);
});

test('a lost stage lease ends the session and a late heartbeat cannot revive it', () => {
  const {time, now} = clock();
  const session = new DirectorSession({store: new MemoryStore(), maxSessions: 1, maxMs: 60000, now});
  session.start(OWNER);
  time.now += 9000;
  assert.equal(session.live, false);
  assert.equal(session.state.reason, 'stage-lost');
  assert.throws(() => session.heartbeat(OWNER), /lease/);
});

test('another stage tab cannot take over a live session', () => {
  const session = new DirectorSession({store: new MemoryStore(), maxSessions: 3, maxMs: 60000, now: clock().now});
  session.start(OWNER);
  assert.throws(() => session.start('stage-0000-0000-0002'), /another stage/);
  assert.throws(() => session.heartbeat('stage-0000-0000-0002'), /lease/);
});

test('a restart ends a live session and never starts a new one', () => {
  const store = new MemoryStore();
  const {now} = clock();
  new DirectorSession({store, maxSessions: 2, maxMs: 60000, now}).start(OWNER);
  const restarted = new DirectorSession({store, maxSessions: 2, maxMs: 60000, now});
  assert.equal(restarted.live, false);
  assert.equal(restarted.state.reason, 'interrupted');
  assert.equal(restarted.remaining, 1);
});

test('stage ids are validated', () => {
  const session = new DirectorSession({store: new MemoryStore(), maxSessions: 1, maxMs: 60000, now: clock().now});
  assert.throws(() => session.start('short'), /invalid/);
  assert.equal(session.remaining, 1);
});
