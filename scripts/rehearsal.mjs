// Local rehearsal: a fresh Anvil chain, a freshly deployed StoryVote and the server in fake Director mode.
// Prints the phone and operator links; Ctrl+C stops everything. Uses Anvil's public test key only.
//
//   npm run rehearsal            (needs Foundry: anvil, forge)
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

const ROOT = new URL('../', import.meta.url).pathname;
const ANVIL_PORT = 18646;
const PORT = Number(process.env.PORT ?? 3400);
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const APP = `http://localhost:${PORT}`;
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADMIN_TOKEN = 'rehearsal-admin-token-0123456789';
const chain = {id: 31337, name: 'Anvil', nativeCurrency: {name: 'ETH', symbol: 'ETH', decimals: 18}, rpcUrls: {default: {http: [RPC]}}};

execFileSync('npm', ['run', 'build'], {cwd: ROOT, stdio: 'ignore'});
execFileSync('forge', ['build', '--root', 'contracts'], {cwd: ROOT, stdio: 'ignore'});
const anvil = spawn('anvil', ['--port', String(ANVIL_PORT), '--block-time', '1', '--silent'], {stdio: 'ignore'});
const pub = createPublicClient({chain, transport: http(RPC)});
for (let i = 0; ; i++) {
  try {
    await pub.getChainId();
    break;
  } catch {
    if (i > 50) throw new Error('anvil did not start');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const artifact = JSON.parse(readFileSync(join(ROOT, 'contracts/out/StoryVote.sol/StoryVote.json'), 'utf8'));
const operator = createWalletClient({chain, account: privateKeyToAccount(ANVIL_KEY), transport: http(RPC)});
const hash = await operator.deployContract({abi: artifact.abi, bytecode: artifact.bytecode.object});
const {contractAddress} = await pub.waitForTransactionReceipt({hash});

const server = spawn(process.execPath, ['src/server/index.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    PUBLIC_URL: APP,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DATA_DIR: mkdtempSync(join(tmpdir(), 'inscribi-director-rehearsal-')),
    RPC_URL: RPC,
    CHAIN_ID: '31337',
    CONTRACT_ADDRESS: contractAddress,
    OPERATOR_PRIVATE_KEY: ANVIL_KEY,
    ADMIN_TOKEN,
    DIRECTOR_MODE: 'fake',
    MAX_SESSIONS: '5',
    MAX_SESSION_SECONDS: '0',
    ROUND_SECONDS: process.env.ROUND_SECONDS ?? '15',
  },
});

console.log(`\nPhones:   ${APP}\nOperator: ${APP}/admin#${ADMIN_TOKEN}\nStage:    ${APP}/stage (open after the operator link, same browser)\n`);

const stop = () => {
  server.kill('SIGTERM');
  anvil.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
