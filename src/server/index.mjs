// Entry point: wires configuration, chain access, the show and the HTTP server together.
import {readFileSync} from 'node:fs';
import {parseEther} from 'viem';
import {loadConfig} from './config.mjs';
import {JsonStore} from './store.mjs';
import {loadStory} from './story.mjs';
import {Chain} from './chain.mjs';
import {DirectorSession} from './session.mjs';
import {Bridge} from './bridge.mjs';
import {DripGate} from './drip.mjs';
import {Show} from './show.mjs';
import {createApp, roomIdFor} from './app.mjs';

const FAKE_ACK_DELAY_MS = 1500;
const SHUTDOWN_GRACE_MS = 10000;

const log = (message, details) => console.log(JSON.stringify({at: new Date().toISOString(), message, ...(details ? {details} : {})}));

const config = loadConfig();
const abi = JSON.parse(readFileSync(new URL('../shared/story-vote-abi.json', import.meta.url), 'utf8'));
const store = new JsonStore(config.dataDir);
const story = loadStory(config.storyFile);
const chain = new Chain({rpcUrl: config.rpcUrl, chainId: config.chainId, contract: config.contract, operatorKey: config.operatorKey, abi});

const onChainChainId = await chain.public.getChainId();
if (onChainChainId !== config.chainId) throw new Error(`RPC reports chain ${onChainChainId}, expected ${config.chainId}`);
const owner = await chain.read('owner');
if (owner.toLowerCase() !== chain.operator.toLowerCase()) throw new Error('OPERATOR_PRIVATE_KEY is not the owner of CONTRACT_ADDRESS');

const session = new DirectorSession({
  store,
  maxSessions: config.maxSessions,
  maxMs: config.maxSessionSeconds ? config.maxSessionSeconds * 1000 : null,
  budgetUsd: config.directorMode === 'live' ? config.falBudgetUsd : null,
});
const bridge = new Bridge(store);
const drip = new DripGate({store, chain, amount: parseEther(config.dripAmountMon), limit: config.dripLimit});
const show = new Show({config, chain, store, story, session, bridge, log});
await show.start();

// Fake mode is for local rehearsal and tests only: directions are acknowledged without any provider.
if (config.directorMode === 'fake') {
  setInterval(() => {
    const pending = bridge.unresolved;
    if (pending && Date.now() - Date.parse(pending.createdAt) > FAKE_ACK_DELAY_MS) bridge.message({type: 'prompt_applied', prompt_version: pending.version});
  }, 250);
}

const server = createApp({config, store, show, session, bridge, drip, chain, abi, roomId: roomIdFor(store), log});
server.listen(config.port, config.listenHost, () => {
  log('listening', {url: config.publicOrigin, port: config.port, operator: chain.operator, contract: config.contract, directorMode: config.directorMode, sessionsLeft: session.remaining});
});

// On redeploy or shutdown: end the live session and try to cancel an open round so voters can be refunded.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down', {signal});
  session.end('shutdown');
  await Promise.race([show.tick(), new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS))]);
  show.stop();
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
