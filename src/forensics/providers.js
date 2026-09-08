// Providers intercambiables y estrictamente de solo lectura.
import fs from "node:fs/promises";
import { normalizeBlockchainTransaction } from "./model.js";
import { networkFor } from "../domain/intelligence/model.js";

function providerError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export class ProviderRegistry {
  constructor() { this.providers = new Map(); }
  register(provider) {
    if (!provider?.id) throw providerError("Provider id is required.", "PROVIDER_INVALID");
    this.providers.set(provider.id, provider);
    return provider;
  }
  get(id) {
    const provider = this.providers.get(id);
    if (!provider) throw providerError("Unknown provider: " + id, "PROVIDER_NOT_FOUND", 404);
    return provider;
  }
  list() { return [...this.providers.values()].map((provider) => provider.describe()); }
}

export class FixtureProvider {
  constructor({ id = "fixture", chain, document }) {
    this.id = id;
    this.chain = chain;
    this.document = document;
  }
  static async fromFile(filePath, chain) {
    return new FixtureProvider({
      id: "fixture:" + filePath,
      chain,
      document: JSON.parse(await fs.readFile(filePath, "utf8"))
    });
  }
  describe() {
    return { id: this.id, kind: "local-fixture", chain: this.chain || "multi-chain", readOnly: true, capabilities: ["transaction", "address"] };
  }
  transactions() {
    return (this.document.transactions || [])
      .filter((entry) => !this.chain || entry.chain === this.chain)
      .map((entry) => normalizeBlockchainTransaction(entry, entry.provenance?.source || {
        kind: "local-dataset", id: this.id, endpoint: "file"
      }));
  }
  async getTransaction(txHash) {
    const canonical = String(txHash).toLowerCase().replace(/^0x/, "");
    return this.transactions().find((entry) => entry.tx_hash === canonical) || null;
  }
  async getAddressTransactions(address) {
    const target = String(address).toLowerCase();
    return this.transactions().filter((entry) => entry.from?.toLowerCase() === target || entry.to?.toLowerCase() === target);
  }
  async getBalance(address) {
    const transactions = await this.getAddressTransactions(address);
    const target = String(address).toLowerCase();
    const balances = new Map();
    for (const tx of transactions.filter((entry) => entry.status === "confirmed")) {
      if (tx.to?.toLowerCase() === target) balances.set(tx.asset, (balances.get(tx.asset) || 0n) + BigInt(tx.amount));
      if (tx.from?.toLowerCase() === target) {
        balances.set(tx.asset, (balances.get(tx.asset) || 0n) - BigInt(tx.amount));
        const nativeAsset = networkFor(tx.chain).nativeAsset;
        balances.set(nativeAsset, (balances.get(nativeAsset) || 0n) - BigInt(tx.fee));
      }
    }
    return Object.fromEntries([...balances].map(([asset, amount]) => [asset, amount.toString()]));
  }
}

class JsonRpcProvider {
  constructor({ id, chain, endpoint, methods, fetchImpl = globalThis.fetch, allowRemote = false, timeoutMs = 5000 }) {
    this.id = id;
    this.chain = chain;
    this.methods = new Set(methods);
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.url = new URL(endpoint);
    if (!/^https?:$/.test(this.url.protocol)) throw providerError("RPC endpoint must use HTTP or HTTPS.", "PROVIDER_PROTOCOL_REJECTED");
    if (this.url.username || this.url.password) throw providerError("Credentials in RPC URLs are rejected.", "PROVIDER_CREDENTIALS_REJECTED");
    const local = ["localhost", "127.0.0.1", "::1"].includes(this.url.hostname);
    if (!local && !allowRemote) throw providerError("Remote RPC is disabled by default.", "PROVIDER_REMOTE_REJECTED");
  }
  describe() { return { id: this.id, kind: "own-node", chain: this.chain, readOnly: true, capabilities: ["transaction"] }; }
  async call(method, params = []) {
    if (!this.methods.has(method)) throw providerError("RPC method is outside the read-only allowlist.", "PROVIDER_METHOD_REJECTED");
    const response = await this.fetch(this.url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw providerError("RPC returned HTTP " + response.status + ".", "PROVIDER_HTTP_ERROR", 502);
    const payload = await response.json();
    if (payload.error) throw providerError("RPC rejected " + method + ".", "PROVIDER_RPC_ERROR", 502);
    return payload.result;
  }
}

export class EvmForensicsProvider extends JsonRpcProvider {
  constructor({ chain = "ethereum", endpoint, ...options }) {
    if (!["ethereum", "polygon"].includes(chain)) throw providerError("EVM provider supports ethereum or polygon.", "PROVIDER_CHAIN_REJECTED");
    super({ id: options.id || chain + "-rpc", chain, endpoint, methods: ["eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByHash", "eth_blockNumber", "eth_getBalance"], ...options });
  }
  async getTransaction(txHash) {
    const value = String(txHash).startsWith("0x") ? String(txHash) : "0x" + txHash;
    const transaction = await this.call("eth_getTransactionByHash", [value]);
    if (!transaction) return null;
    const [receipt, head] = await Promise.all([
      this.call("eth_getTransactionReceipt", [value]), this.call("eth_blockNumber")
    ]);
    const block = transaction.blockHash ? await this.call("eth_getBlockByHash", [transaction.blockHash, false]) : null;
    const blockNumber = transaction.blockNumber ? Number(BigInt(transaction.blockNumber)) : null;
    const confirmations = blockNumber === null ? 0 : Math.max(0, Number(BigInt(head)) - blockNumber + 1);
    const gasUsed = receipt?.gasUsed ? BigInt(receipt.gasUsed) : 0n;
    const gasPrice = receipt?.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : BigInt(transaction.gasPrice || 0);
    return normalizeBlockchainTransaction({
      chain: this.chain, network: this.chain, tx_hash: transaction.hash, block: blockNumber,
      timestamp: block ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : new Date().toISOString(),
      from: transaction.from, to: transaction.to, asset: this.chain === "polygon" ? "POL" : "ETH",
      amount: BigInt(transaction.value || 0).toString(), fee: (gasUsed * gasPrice).toString(),
      status: transaction.blockNumber === null ? "pending" : receipt?.status === "0x0" ? "failed" : "confirmed",
      input_data: transaction.input || "", contract: receipt?.contractAddress || transaction.to,
      confirmations
    }, { kind: "own-node", id: this.id, endpoint: this.url.origin, retrievedAt: new Date().toISOString() });
  }
  async getBalance(address) {
    const value = await this.call("eth_getBalance", [address, "latest"]);
    return { [this.chain === "polygon" ? "POL" : "ETH"]: BigInt(value).toString() };
  }
  async getAddressTransactions() {
    throw providerError("A standard EVM node cannot enumerate address history; configure an indexer or import a dataset.", "PROVIDER_CAPABILITY_UNAVAILABLE", 501);
  }
}

export class BitcoinForensicsProvider extends JsonRpcProvider {
  constructor({ endpoint, ...options }) {
    super({ id: options.id || "bitcoin-rpc", chain: "bitcoin", endpoint, methods: ["getrawtransaction", "getblockheader", "getblockcount"], ...options });
  }
  async getTransaction(txHash) {
    const transaction = await this.call("getrawtransaction", [String(txHash).replace(/^0x/, ""), true]);
    if (!transaction) return null;
    const head = await this.call("getblockcount");
    const header = transaction.blockhash ? await this.call("getblockheader", [transaction.blockhash, true]) : null;
    const outputs = transaction.vout || [];
    const firstOutput = outputs.find((entry) => entry.scriptPubKey?.address) || outputs[0] || {};
    return normalizeBlockchainTransaction({
      chain: "bitcoin", network: "bitcoin", tx_hash: transaction.txid,
      block: header?.height ?? null, timestamp: new Date(Number(transaction.blocktime || transaction.time || Date.now() / 1000) * 1000).toISOString(),
      from: null, to: firstOutput.scriptPubKey?.address || null, asset: "BTC",
      amount: String(Math.round(Number(firstOutput.value || 0) * 1e8)), fee: "0",
      status: transaction.confirmations > 0 ? "confirmed" : "pending", input_data: "", contract: null,
      confirmations: transaction.confirmations ?? (header ? Number(head) - Number(header.height) + 1 : 0)
    }, { kind: "own-node", id: this.id, endpoint: this.url.origin, retrievedAt: new Date().toISOString() });
  }
  async getAddressTransactions() {
    throw providerError("Bitcoin Core without an address index cannot enumerate arbitrary address history; import a dataset.", "PROVIDER_CAPABILITY_UNAVAILABLE", 501);
  }
  async getBalance() {
    throw providerError("Balance by arbitrary address requires an address index; import a dataset.", "PROVIDER_CAPABILITY_UNAVAILABLE", 501);
  }
}
