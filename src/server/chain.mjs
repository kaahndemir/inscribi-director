// Monad access for the server: reads the StoryVote state and sends the operator's transactions.
// All operator transactions go through one queue so nonces never collide.
import {createPublicClient, createWalletClient, http, keccak256} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

const FEE_CACHE_MS = 8000;
const TRANSFER_GAS = 21000n;
const MAX_UPSTREAM_IN_FLIGHT = 10;

export function chainDefinition(chainId, rpcUrl) {
  return {
    id: chainId,
    name: chainId === 10143 ? 'Monad Testnet' : `Chain ${chainId}`,
    nativeCurrency: {name: 'MON', symbol: 'MON', decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}},
  };
}

const isUnsupportedMethod = (error) => /method.*(not found|not supported|does not exist|not available)|-32601/i.test(String(error?.details ?? error?.message ?? error));

export function receiptSucceeded(receipt) {
  return receipt?.status === 'success' || receipt?.status === '0x1';
}

export class Chain {
  constructor({rpcUrl, chainId, contract, operatorKey, abi}) {
    this.rpcUrl = rpcUrl;
    this.contract = contract;
    this.abi = abi;
    this.chain = chainDefinition(chainId, rpcUrl);
    this.account = privateKeyToAccount(operatorKey);
    this.public = createPublicClient({chain: this.chain, transport: http(rpcUrl, {retryCount: 2, retryDelay: 500}), pollingInterval: 400});
    this.wallet = createWalletClient({chain: this.chain, account: this.account, transport: http(rpcUrl, {retryCount: 0})});
    this.queue = Promise.resolve();
    this.cachedFees = null;
    this.feesAt = 0;
    this.syncSendSupported = true;
    this.inFlight = 0;
    this.waiting = [];
  }

  get operator() {
    return this.account.address;
  }

  // Runs operator work strictly one after another.
  serial(task) {
    const run = this.queue.then(task);
    this.queue = run.catch(() => {});
    return run;
  }

  async fees() {
    if (!this.cachedFees || Date.now() - this.feesAt > FEE_CACHE_MS) {
      this.cachedFees = await this.public.estimateFeesPerGas();
      this.feesAt = Date.now();
    }
    return this.cachedFees;
  }

  async snapshot() {
    const block = await this.public.getBlock();
    const latestRound = Number(await this.read('latestRound', [], block.number));
    const round = latestRound ? await this.read('getRound', [BigInt(latestRound)], block.number) : null;
    return {block: block.number, blockTime: block.timestamp, latestRound, round};
  }

  read(functionName, args = [], blockNumber) {
    return this.public.readContract({address: this.contract, abi: this.abi, functionName, args, ...(blockNumber ? {blockNumber} : {})});
  }

  // Sends a StoryVote transaction from the operator and waits for a successful receipt.
  write(functionName, args) {
    return this.serial(async () => {
      const hash = await this.wallet.writeContract({address: this.contract, abi: this.abi, functionName, args});
      const receipt = await this.public.waitForTransactionReceipt({hash, timeout: 30000});
      if (!receiptSucceeded(receipt)) throw new Error(`${functionName} reverted`);
      return {hash, receipt};
    });
  }

  // Signs a plain MON transfer, lets the caller persist the signed bytes, then broadcasts them.
  transfer(to, value, onSigned) {
    return this.serial(async () => {
      const nonce = await this.public.getTransactionCount({address: this.operator, blockTag: 'pending'});
      const fees = await this.fees();
      const raw = await this.account.signTransaction({
        chainId: this.chain.id,
        type: 'eip1559',
        to,
        value,
        nonce,
        gas: TRANSFER_GAS,
        maxFeePerGas: (fees.maxFeePerGas * 125n) / 100n,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      const hash = keccak256(raw);
      await onSigned({raw, hash});
      return this.broadcastNow(raw, hash);
    });
  }

  // Re-sends exactly the same signed bytes; this can never create a second payment.
  rebroadcast(raw) {
    return this.serial(() => this.broadcastNow(raw, keccak256(raw)));
  }

  async broadcastNow(raw, hash) {
    if (this.syncSendSupported) {
      try {
        return await this.public.request({method: 'eth_sendRawTransactionSync', params: [raw]});
      } catch (error) {
        if (!isUnsupportedMethod(error)) throw error;
        this.syncSendSupported = false;
      }
    }
    await this.public.sendRawTransaction({serializedTransaction: raw});
    return this.public.waitForTransactionReceipt({hash, timeout: 30000});
  }

  async receipt(hash) {
    try {
      return await this.public.getTransactionReceipt({hash});
    } catch {
      return null;
    }
  }

  balance(address) {
    return this.public.getBalance({address});
  }

  // Forwards an allow-listed JSON-RPC call for participants, with a cap on concurrent upstream requests.
  async forward(body) {
    if (this.inFlight >= MAX_UPSTREAM_IN_FLIGHT) await new Promise((resolve) => this.waiting.push(resolve));
    this.inFlight++;
    try {
      const response = await fetch(this.rpcUrl, {method: 'POST', headers: {'content-type': 'application/json'}, body, signal: AbortSignal.timeout(8000)});
      return {status: response.status, text: await response.text()};
    } finally {
      this.inFlight--;
      this.waiting.shift()?.();
    }
  }
}
