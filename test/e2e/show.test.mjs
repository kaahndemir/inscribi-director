// End-to-end rehearsal on a local Anvil chain with the Director in fake mode:
// operator login, stage start, three participant phones, paid votes over several rounds,
// winner directions, security refusals, and a restart that cancels the open round and allows refunds.
//
// Requires Foundry (anvil, forge) and Google Chrome. Uses Anvil's public test key only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {request} from 'node:http';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createPublicClient, createWalletClient, http, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

const ROOT = new URL('../../', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ANVIL_PORT = 18645;
const APP_PORT = 3399;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADMIN_TOKEN = 'e2e-admin-token-0123456789abcdef';
const chain = {id: 31337, name: 'Anvil', nativeCurrency: {name: 'ETH', symbol: 'ETH', decimals: 18}, rpcUrls: {default: {http: [RPC]}}};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, {timeout = 30000, interval = 250, label = 'condition'} = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}: ${last?.message ?? JSON.stringify(last)}`);
}

function startServer(env) {
  const child = spawn(process.execPath, ['src/server/index.mjs'], {cwd: ROOT, env: {...process.env, ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  child.output = '';
  child.stdout.on('data', (d) => (child.output += d));
  child.stderr.on('data', (d) => (child.output += d));
  return child;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}

test('full rehearsal on a local chain', {timeout: 240000}, async (t) => {
  execFileSync('forge', ['build', '--root', 'contracts'], {cwd: ROOT, stdio: 'ignore'});
  const anvil = spawn('anvil', ['--port', String(ANVIL_PORT), '--block-time', '1', '--silent'], {stdio: 'ignore'});
  const pub = createPublicClient({chain, transport: http(RPC)});
  await until(() => pub.getChainId(), {label: 'anvil'});

  const artifact = JSON.parse(readFileSync(join(ROOT, 'contracts/out/StoryVote.sol/StoryVote.json'), 'utf8'));
  const operator = createWalletClient({chain, account: privateKeyToAccount(ANVIL_KEY), transport: http(RPC)});
  const deployHash = await operator.deployContract({abi: artifact.abi, bytecode: artifact.bytecode.object});
  const {contractAddress} = await pub.waitForTransactionReceipt({hash: deployHash});

  const env = {
    PUBLIC_URL: APP,
    PORT: String(APP_PORT),
    HOST: '127.0.0.1',
    DATA_DIR: mkdtempSync(join(tmpdir(), 'inscribi-director-e2e-')),
    RPC_URL: RPC,
    CHAIN_ID: '31337',
    CONTRACT_ADDRESS: contractAddress,
    OPERATOR_PRIVATE_KEY: ANVIL_KEY,
    ADMIN_TOKEN,
    DIRECTOR_MODE: 'fake',
    MAX_SESSIONS: '1',
    MAX_SESSION_SECONDS: '0',
    ROUND_SECONDS: '6',
    DRIP_AMOUNT_MON: '0.08',
  };
  let server = startServer(env);
  const browser = await chromium.launch({executablePath: CHROME, headless: true});
  const pageErrors = [];

  t.after(async () => {
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
    anvil.kill('SIGTERM');
  });

  await until(() => fetch(`${APP}/healthz`).then((r) => r.ok), {label: 'server health'});
  const read = (functionName, args = []) => pub.readContract({address: contractAddress, abi: artifact.abi, functionName, args});

  // Operator logs in with the private link; the token leaves the address bar.
  const operatorContext = await browser.newContext();
  const admin = await operatorContext.newPage();
  admin.on('pageerror', (e) => pageErrors.push(`admin: ${e}`));
  await admin.goto(`${APP}/admin#${ADMIN_TOKEN}`);
  await admin.locator('#console').waitFor({state: 'visible'});
  assert.equal(new URL(admin.url()).hash, '');

  const adminState = () => admin.evaluate(() => fetch('/api/admin/state').then((r) => r.json()));

  const stage = await operatorContext.newPage();
  stage.on('pageerror', (e) => pageErrors.push(`stage: ${e}`));
  await stage.goto(`${APP}/stage`);
  await stage.locator('#start').waitFor({state: 'visible'});

  // Three phones join before the show starts.
  const phones = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(`phone ${i}: ${e}`));
    await page.goto(APP);
    await page.locator('#join').click();
    await until(() => page.locator('#wallet-status').textContent().then((s) => s.includes('hazır')), {label: `phone ${i} funded`});
    await until(() => page.locator('#balance').textContent().then((s) => s.includes('0,08 MON')), {label: `phone ${i} balance shown`});
    phones.push(page);
  }

  await stage.locator('#start').click();
  await until(async () => (await adminState()).session.status === 'live', {label: 'live session'});

  async function voteRound(step, picks) {
    const round = await until(async () => {
      const s = await adminState();
      return s.round?.open && s.round.number === step ? s.round : null;
    }, {label: `round ${step} open`});
    for (const [index, choice] of picks.entries()) {
      const button = phones[index].locator('#choices button').nth(choice);
      await until(() => button.isEnabled(), {label: `phone ${index} can vote`});
      await button.click();
      await until(() => phones[index].locator('#result').textContent().then((s) => s.includes('kayıtlı')), {label: `phone ${index} vote recorded`});
      // The same phone cannot vote again in this round.
      assert.equal(await phones[index].locator('#choices button').first().isDisabled(), true);
    }
    return round;
  }

  await t.test('round 1: votes are paid on chain, the winner is directed', async () => {
    const round = await voteRound(1, [1, 1, 2]);
    await until(async () => (await read('getRound', [BigInt(round.id)])).finalized, {label: 'round 1 finalized'});
    const onChain = await read('getRound', [BigInt(round.id)]);
    assert.deepEqual(onChain.counts.map(Number), [0, 2, 1, 0]);
    assert.equal(Number(onChain.winner), 1);
    assert.equal(onChain.pot, parseEther('0.003'));
    const state = await until(async () => {
      const s = await adminState();
      return s.bridge.entries.find((e) => e.round === round.id && e.status === 'applied') ? s : null;
    }, {label: 'direction applied'});
    assert.equal(state.bridge.entries[0].choice, 1);
    assert.equal(state.bridge.entries[0].version, 2);
    await until(() => stage.locator('#winner').textContent().then((s) => s.includes('Seçilen')), {label: 'stage winner banner'});
  });

  await t.test('round 2 opens automatically and steers the same session', async () => {
    const round = await voteRound(2, [3, 0, 3]);
    const state = await until(async () => {
      const s = await adminState();
      return s.bridge.entries.find((e) => e.round === round.id && e.status === 'applied') ? s : null;
    }, {label: 'round 2 direction applied'});
    const entry = state.bridge.entries.find((e) => e.round === round.id);
    assert.equal(entry.choice, 3);
    assert.equal(entry.version, 3);
    assert.equal(state.session.attempts, 1);
  });

  await t.test('security: operator API, origin and RPC relay refuse outsiders', async () => {
    const noCookie = await fetch(`${APP}/api/admin/round/open`, {method: 'POST', headers: {origin: APP, 'content-type': 'application/json'}, body: '{}'});
    assert.equal(noCookie.status, 401);
    const badOrigin = await fetch(`${APP}/api/drip`, {method: 'POST', headers: {origin: 'https://evil.example', 'content-type': 'application/json'}, body: '{}'});
    assert.equal(badOrigin.status, 403);
    const badLogin = await fetch(`${APP}/api/admin/login`, {method: 'POST', headers: {origin: APP, 'content-type': 'application/json'}, body: JSON.stringify({token: 'wrong'})});
    assert.equal(badLogin.status, 401);
    const stranger = privateKeyToAccount(`0x${'2'.repeat(64)}`);
    const raw = await stranger.signTransaction({chainId: 31337, type: 'eip1559', to: stranger.address, value: 1n, nonce: 0, gas: 21000n, maxFeePerGas: 10n ** 10n, maxPriorityFeePerGas: 1n});
    const relay = await fetch(`${APP}/api/rpc`, {method: 'POST', headers: {origin: APP, 'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [raw]})});
    assert.equal(relay.status, 403);
    const call = await fetch(`${APP}/api/rpc`, {method: 'POST', headers: {origin: APP, 'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_call', params: []})});
    assert.equal(call.status, 403);
    const wrongHost = await new Promise((resolve, reject) => {
      request({host: '127.0.0.1', port: APP_PORT, path: '/', headers: {host: 'evil.example'}}, (res) => resolve(res.statusCode)).on('error', reject).end();
    });
    assert.equal(wrongHost, 421);
  });

  await t.test('restart during an open round: the round is cancelled, nothing restarts, the voter gets a refund', async () => {
    const round = await voteRound(3, [0]);
    await stopServer(server);
    server = startServer(env);
    await until(() => fetch(`${APP}/healthz`).then((r) => r.ok), {label: 'server back'});

    const onChain = await until(async () => {
      const r = await read('getRound', [BigInt(round.id)]);
      return r.cancelled ? r : null;
    }, {label: 'round cancelled on shutdown'});
    assert.equal(onChain.cancelled, true);

    const state = await adminState();
    assert.equal(state.session.status, 'ended');
    assert.equal(state.session.remaining, 0);
    const restart = await admin.evaluate(() => fetch('/api/admin/session/start', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({stageId: 'stage-0000-0000-9999'})}).then((r) => r.status));
    assert.equal(restart, 400);

    const refund = phones[0].locator('#refund');
    await until(() => refund.isVisible(), {label: 'refund button'});
    await refund.click();
    await until(() => phones[0].locator('#status').textContent().then((s) => s.includes('İade hesabına döndü')), {label: 'refund confirmed'});
    assert.equal((await read('getRound', [BigInt(round.id)])).pot, 0n);
  });

  await t.test('no uncaught browser errors', () => {
    assert.deepEqual(pageErrors, []);
  });
});
