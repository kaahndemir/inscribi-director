import test from 'node:test';
import assert from 'node:assert/strict';
import {assetVersion, participantPage, stagePage} from '../../src/server/pages.mjs';

test('pages load assets by build hash, so a deploy is never hidden by a cached script', () => {
  const version = assetVersion();
  assert.match(version, /^([0-9a-f]{12}|dev)$/);
  assert.ok(participantPage().includes(`/assets/participant.js?v=${version}`));
  assert.ok(stagePage().includes(`/assets/stage.js?v=${version}`));
  assert.ok(stagePage().includes(`/assets/app.css?v=${version}`));
});
