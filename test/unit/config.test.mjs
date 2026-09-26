import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../../src/server/config.mjs';

const valid = {
  PUBLIC_URL: 'https://live.inscribi.com',
  CONTRACT_ADDRESS: '0x79e1301adca03b67aa17e8ade8d80ff897e4f730',
  OPERATOR_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
  ADMIN_TOKEN: 'a'.repeat(32),
  FAL_KEY: 'test-key',
};

test('a complete environment loads with safe defaults', () => {
  const config = loadConfig(valid);
  assert.equal(config.publicOrigin, 'https://live.inscribi.com');
  assert.equal(config.chainId, 10143);
  assert.equal(config.maxSessions, 2);
  assert.equal(config.directorMode, 'live');
});

test('missing secrets and unsafe values are rejected together', () => {
  assert.throws(() => loadConfig({...valid, FAL_KEY: '', ADMIN_TOKEN: 'short', PUBLIC_URL: 'http://live.inscribi.com'}), (error) => {
    return /FAL_KEY/.test(error.message) && /ADMIN_TOKEN/.test(error.message) && /https/.test(error.message);
  });
});

test('fake mode does not need a fal key', () => {
  assert.equal(loadConfig({...valid, FAL_KEY: '', DIRECTOR_MODE: 'fake'}).directorMode, 'fake');
});
