// Deploys StoryVote from the operator wallet and records the result in deployments/<chainId>.json.
// The key is read from the environment (for example `node --env-file=.env scripts/deploy-contract.mjs`)
// and is never printed. The deploying wallet becomes the contract owner, so it must be the same
// OPERATOR_PRIVATE_KEY the server runs with.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createPublicClient, createWalletClient, http, formatEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainDefinition} from '../src/server/chain.mjs';

const rpcUrl = process.env.RPC_URL || 'https://testnet-rpc.monad.xyz';
const chainId = Number(process.env.CHAIN_ID || 10143);
const key = process.env.OPERATOR_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('OPERATOR_PRIVATE_KEY is missing or malformed');

execFileSync('forge', ['build', '--root', 'contracts'], {stdio: 'inherit'});
const artifact = JSON.parse(readFileSync('contracts/out/StoryVote.sol/StoryVote.json', 'utf8'));

const chain = chainDefinition(chainId, rpcUrl);
const account = privateKeyToAccount(key);
const pub = createPublicClient({chain, transport: http(rpcUrl)});
const wallet = createWalletClient({chain, account, transport: http(rpcUrl)});

if ((await pub.getChainId()) !== chainId) throw new Error(`RPC is not chain ${chainId}`);
console.log(`Deploying StoryVote from ${account.address} (balance ${formatEther(await pub.getBalance({address: account.address}))} MON)`);

const hash = await wallet.deployContract({abi: artifact.abi, bytecode: artifact.bytecode.object});
const receipt = await pub.waitForTransactionReceipt({hash, timeout: 60000});
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);

const block = await pub.getBlock({blockNumber: receipt.blockNumber});
const record = {
  contract: receipt.contractAddress,
  owner: account.address,
  chainId,
  transaction: hash,
  block: Number(receipt.blockNumber),
  deployedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
  gasUsed: Number(receipt.gasUsed),
};
if (!process.env.DEPLOY_OUTPUT_SKIP) {
  mkdirSync('deployments', {recursive: true});
  writeFileSync(`deployments/${chainId}.json`, `${JSON.stringify(record, null, 2)}\n`);
}
console.log(JSON.stringify(record, null, 2));
