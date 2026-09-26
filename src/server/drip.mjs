// Gives each participant wallet a small demo MON balance, once.
// The signed transfer is saved before it is broadcast. If the answer is lost, the same bytes are
// re-sent later, so a retry can never pay the same address twice.
import {receiptSucceeded} from './chain.mjs';

export class DripGate {
  constructor({store, chain, amount, limit}) {
    this.store = store;
    this.chain = chain;
    this.amount = amount;
    this.limit = limit;
    this.records = store.read('drip', {});
    this.inFlight = new Map();
  }

  get funded() {
    return Object.values(this.records).filter((r) => r.status === 'confirmed').length;
  }

  get reserved() {
    return Object.values(this.records).filter((r) => r.status === 'confirmed' || r.status === 'sent').length;
  }

  request(address) {
    const key = address.toLowerCase();
    if (!this.inFlight.has(key)) {
      const job = this.fund(key).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, job);
    }
    return this.inFlight.get(key);
  }

  async fund(address) {
    const record = this.records[address];
    if (record?.status === 'confirmed') return this.view(address);
    if (record?.status === 'sent') {
      await this.reconcile(address, record);
      if (this.records[address].status !== 'failed') return this.view(address);
    }
    if (this.reserved >= this.limit) throw new Error('drip limit reached');

    try {
      const receipt = await this.chain.transfer(address, this.amount, ({raw, hash}) => this.save(address, {status: 'sent', hash, raw}));
      this.save(address, {...this.records[address], status: receiptSucceeded(receipt) ? 'confirmed' : 'failed'});
    } catch {
      // Not signed yet: safe to try again. Signed: keep 'sent' and reconcile on the next request.
      if (this.records[address]?.status !== 'sent') this.save(address, {status: 'failed'});
    }
    return this.view(address);
  }

  async reconcile(address, record) {
    const known = await this.chain.receipt(record.hash);
    if (known) {
      this.save(address, {...record, status: receiptSucceeded(known) ? 'confirmed' : 'failed'});
      return;
    }
    try {
      const receipt = await this.chain.rebroadcast(record.raw);
      this.save(address, {...record, status: receiptSucceeded(receipt) ? 'confirmed' : 'failed'});
    } catch (error) {
      // "nonce too low" means that nonce was used by another transaction, so these bytes can never land.
      if (/nonce too low|already known.*nonce|nonce.*lower/i.test(String(error?.details ?? error?.message))) this.save(address, {status: 'failed'});
    }
  }

  save(address, record) {
    this.records[address] = record;
    this.store.write('drip', this.records);
  }

  view(address) {
    const {status, hash} = this.records[address] ?? {status: 'failed'};
    return {status, hash};
  }
}
