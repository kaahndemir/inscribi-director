import test from 'node:test';
import assert from 'node:assert/strict';
import {DIRECTOR_APP, proxyDecision} from '../../src/server/fal-proxy.mjs';

const live = {live: true, allowsProviderHeartbeat: (id) => id === 'fal-1'};
const idle = {live: false, allowsProviderHeartbeat: () => false};

test('only the Director model on the three WMA paths is allowed', () => {
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/session', body: {app_id: DIRECTOR_APP}, session: live}).allow, true);
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/ice', body: {app_id: DIRECTOR_APP}, session: live}).allow, true);
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/session', body: {app_id: 'other/model'}, session: live}).reason, 'model');
  assert.equal(proxyDecision({targetUrl: 'https://queue.fal.run/fal-ai/flux', body: {}, session: live}).reason, 'target');
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/session?x=1', body: {app_id: DIRECTOR_APP}, session: live}).reason, 'target');
  assert.equal(proxyDecision({targetUrl: 'not a url', body: {}, session: live}).reason, 'target');
});

test('nothing passes while the session is not live', () => {
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/session', body: {app_id: DIRECTOR_APP}, session: idle}).allow, false);
});

test('heartbeats must belong to this attempt\'s provider session', () => {
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/session/heartbeat', body: {session_id: 'fal-1'}, session: live}).allow, true);
  assert.equal(proxyDecision({targetUrl: 'https://wma.fal.run/session/heartbeat', body: {session_id: 'fal-2'}, session: live}).allow, false);
});
