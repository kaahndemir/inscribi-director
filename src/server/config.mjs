// Reads and validates all runtime settings from the environment.
// Every secret comes from the environment; nothing secret is ever written to disk or logs.
import {isAddress} from 'viem';

const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';

export function loadConfig(env = process.env) {
  const errors = [];
  const required = (name) => {
    const value = env[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    return value;
  };
  const integer = (name, fallback, min, max) => {
    const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) errors.push(`${name} must be an integer between ${min} and ${max}`);
    return value;
  };
  const decimal = (name, fallback) => {
    const value = env[name]?.trim() || fallback;
    if (!/^\d+(\.\d{1,18})?$/.test(value) || Number(value) <= 0) errors.push(`${name} must be a positive decimal`);
    return value;
  };

  const directorMode = env.DIRECTOR_MODE?.trim() || 'live';
  if (!['live', 'fake'].includes(directorMode)) errors.push('DIRECTOR_MODE must be live or fake');

  const publicUrl = required('PUBLIC_URL');
  let publicOrigin;
  try {
    const url = new URL(publicUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) throw Error();
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol === 'http:' && !local) errors.push('PUBLIC_URL must use https unless it is localhost');
    publicOrigin = url.origin;
  } catch {
    errors.push('PUBLIC_URL must be an http(s) origin such as https://live.inscribi.com');
  }

  const contract = required('CONTRACT_ADDRESS');
  if (contract && !isAddress(contract)) errors.push('CONTRACT_ADDRESS is not an address');

  const operatorKey = required('OPERATOR_PRIVATE_KEY');
  if (operatorKey && !/^0x[0-9a-fA-F]{64}$/.test(operatorKey)) errors.push('OPERATOR_PRIVATE_KEY must be 0x followed by 64 hex characters');

  const adminToken = required('ADMIN_TOKEN');
  if (adminToken && adminToken.length < 24) errors.push('ADMIN_TOKEN must be at least 24 characters');

  const falKey = directorMode === 'live' ? required('FAL_KEY') : env.FAL_KEY?.trim();

  const config = {
    port: integer('PORT', 3000, 1, 65535),
    listenHost: env.HOST?.trim() || '0.0.0.0',
    publicOrigin,
    dataDir: env.DATA_DIR?.trim() || './data',
    rpcUrl: env.RPC_URL?.trim() || MONAD_TESTNET_RPC,
    chainId: integer('CHAIN_ID', 10143, 1, 2 ** 31),
    contract,
    operatorKey,
    adminToken,
    falKey,
    directorMode,
    maxSessions: integer('MAX_SESSIONS', 2, 1, 50),
    // 0 = no server-side limit; the operator stops the show (the provider caps a session at 15 minutes).
    maxSessionSeconds: integer('MAX_SESSION_SECONDS', 75, 0, 900),
    falBudgetUsd: integer('FAL_BUDGET_USD', 20, 5, 1000),
    roundSeconds: integer('ROUND_SECONDS', 20, 5, 600),
    autoRounds: (env.AUTO_ROUNDS ?? 'true') !== 'false',
    voteFeeMon: decimal('VOTE_FEE_MON', '0.001'),
    dripAmountMon: decimal('DRIP_AMOUNT_MON', '0.08'),
    dripLimit: integer('DRIP_LIMIT', 60, 1, 10000),
    storyFile: env.STORY_FILE?.trim() || new URL('../story/story.json', import.meta.url).pathname,
  };

  if (config.maxSessionSeconds > 0 && config.maxSessionSeconds < 20) errors.push('MAX_SESSION_SECONDS must be 0 (no limit) or at least 20');
  if (errors.length) throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  return Object.freeze(config);
}
