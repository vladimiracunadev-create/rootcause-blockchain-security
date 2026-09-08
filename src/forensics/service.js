import { analyzeAddress, buildTransactionGraph } from "./analysis.js";
import { fromIntelligenceTransaction, normalizeBlockchainTransaction } from "./model.js";
import { reconcileLedger } from "./reconciliation.js";
import { buildForensicTimeline } from "./timeline.js";
import { createEvidenceReport } from "./report.js";

export class ForensicsService {
  constructor({ intelligence = null, providers = null } = {}) { this.intelligence = intelligence; this.providers = providers; }
  async storedTransactions() {
    if (!this.intelligence) return [];
    const state = await this.intelligence.read();
    return (state.transactions || []).map(fromIntelligenceTransaction);
  }
  async transaction(chain, txHash, providerId = null) {
    if (providerId && this.providers) return this.providers.get(providerId).getTransaction(txHash);
    const canonical = String(txHash).toLowerCase().replace(/^0x/, "");
    return (await this.storedTransactions()).find((tx) => tx.chain === chain && tx.tx_hash === canonical) || null;
  }
  async address(chain, address, providerId = null) {
    let transactions, balance = {};
    if (providerId && this.providers) {
      const provider = this.providers.get(providerId);
      [transactions, balance] = await Promise.all([provider.getAddressTransactions(address), provider.getBalance(address)]);
    } else transactions = await this.storedTransactions();
    return analyzeAddress(chain, address, transactions, balance);
  }
  async graph(options = {}) {
    let transactions;
    if (options.transactions) transactions = options.transactions.map((tx) => normalizeBlockchainTransaction(tx, tx.provenance?.source));
    else if (options.providerId && this.providers) transactions = await this.providers.get(options.providerId).getAddressTransactions(options.address);
    else transactions = await this.storedTransactions();
    return buildTransactionGraph(transactions, options);
  }
  async reconcile(ledger, options = {}) { return reconcileLedger(ledger, await this.storedTransactions(), options); }
  timeline(input) { return buildForensicTimeline(input); }
  report(input) {
    const transactions = (input.transactions || []).map((tx) => normalizeBlockchainTransaction(tx, tx.provenance?.source));
    return createEvidenceReport({ ...input, transactions });
  }
}
