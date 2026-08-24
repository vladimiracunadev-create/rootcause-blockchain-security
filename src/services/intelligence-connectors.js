// Capa de adquisición: conectores de SOLO LECTURA, reemplazables y observables.
//
// Todo lo que entra al pipeline pasa por un conector, y todo conector declara
// qué puede hacer. Ninguno puede firmar, enviar ni mutar estado: la interfaz
// simplemente no tiene esas operaciones, y los adaptadores JSON-RPC llevan
// además una allowlist de métodos.
//
// Cada conector es tolerante a fallos (reintentos con espera creciente),
// respeta un límite de solicitudes y expone métricas para que el operador vea
// si su fuente está sana en vez de suponerlo.
import { normalizeBlock, normalizeTransaction, networkFor } from "../domain/intelligence/model.js";
import { isReadOnlyEvmMethod } from "../infrastructure/evm-rpc.js";

const BITCOIN_READ_ONLY_METHODS = new Set([
  "getblockchaininfo",
  "getblockhash",
  "getblock",
  "getrawtransaction",
  "getblockcount"
]);

/** Cubo de fichas simple: evita que un conector martillee su fuente. */
export class RateLimiter {
  constructor({ requestsPerMinute = 60, now = () => Date.now() } = {}) {
    this.capacity = Math.max(1, requestsPerMinute);
    this.tokens = this.capacity;
    this.windowStartedAt = now();
    this.now = now;
  }

  tryConsume() {
    const current = this.now();
    if (current - this.windowStartedAt >= 60000) {
      this.tokens = this.capacity;
      this.windowStartedAt = current;
    }
    if (this.tokens <= 0) return false;
    this.tokens -= 1;
    return true;
  }
}

export function isRetryable(error) {
  const code = String(error?.code || "");
  // Un rechazo por allowlist, por endpoint remoto o por validación no mejora
  // reintentando: reintentar solo tiene sentido ante fallos transitorios.
  if (
    code.startsWith("EVM_RPC_METHOD") ||
    code.startsWith("EVM_RPC_REMOTE") ||
    code.startsWith("EVM_RPC_CREDENTIALS") ||
    code.startsWith("EVM_RPC_PROTOCOL") ||
    code.startsWith("EVM_RPC_URL") ||
    code === "CONNECTOR_METHOD_REJECTED" ||
    code === "RATE_LIMITED"
  ) {
    return false;
  }
  return true;
}

export async function withRetry(operation, { attempts = 3, baseDelayMs = 150, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) break;
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

class BaseConnector {
  constructor({ id, kind, network, requestsPerMinute = 60, attempts = 3, sleep }) {
    this.id = id;
    this.kind = kind;
    this.network = networkFor(network).id;
    this.limiter = new RateLimiter({ requestsPerMinute });
    this.attempts = attempts;
    this.sleep = sleep;
    this.metrics = {
      requests: 0,
      failures: 0,
      retries: 0,
      lastError: null,
      lastLatencyMs: null,
      lastSuccessAt: null
    };
  }

  describe() {
    return {
      id: this.id,
      kind: this.kind,
      network: this.network,
      readOnly: true,
      canSign: false,
      canBroadcast: false,
      capabilities: this.capabilities(),
      metrics: { ...this.metrics }
    };
  }

  capabilities() {
    return ["fetchBlock", "fetchTransactions", "healthCheck"];
  }

  source(extra = {}) {
    return { id: this.id, kind: this.kind, retrievedAt: new Date().toISOString(), ...extra };
  }

  async run(operation) {
    if (!this.limiter.tryConsume()) {
      const error = new Error("Connector rate limit exceeded: " + this.id);
      error.code = "RATE_LIMITED";
      error.statusCode = 429;
      this.metrics.failures += 1;
      this.metrics.lastError = error.message;
      throw error;
    }
    const startedAt = Date.now();
    this.metrics.requests += 1;
    try {
      const { value, attempts } = await withRetry(operation, {
        attempts: this.attempts,
        sleep: this.sleep
      });
      this.metrics.retries += attempts - 1;
      this.metrics.lastLatencyMs = Date.now() - startedAt;
      this.metrics.lastSuccessAt = new Date().toISOString();
      return value;
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.lastError = String(error.message || error).slice(0, 200);
      throw error;
    }
  }
}

/**
 * Conector por defecto: lee un dataset local ya validado. No toca la red, lo
 * que permite ejecutar todo el pipeline y todas las pruebas sin depender de
 * ningún tercero y sin revelar qué se está investigando.
 */
export class DatasetConnector extends BaseConnector {
  constructor({ id = "local-dataset", network, dataset, sleep }) {
    super({ id, kind: "local-dataset", network, requestsPerMinute: 10000, attempts: 1, sleep });
    this.dataset = dataset;
  }

  capabilities() {
    return ["fetchBlock", "fetchTransactions", "healthCheck", "replay"];
  }

  async healthCheck() {
    return this.run(async () => ({
      healthy: Array.isArray(this.dataset?.transactions),
      network: this.network,
      transactions: this.dataset?.transactions?.length || 0,
      datasetId: this.dataset?.id || null
    }));
  }

  async fetchTransactions() {
    return this.run(async () => {
      const source = this.source({ endpoint: "dataset:" + (this.dataset?.id || "unknown") });
      return (this.dataset?.transactions || []).map((entry) =>
        normalizeTransaction({ ...entry, network: entry.network || this.network }, source)
      );
    });
  }

  async fetchBlocks() {
    return this.run(async () => {
      const source = this.source({ endpoint: "dataset:" + (this.dataset?.id || "unknown") });
      return (this.dataset?.blocks || []).map((entry) =>
        normalizeBlock({ ...entry, network: entry.network || this.network }, source)
      );
    });
  }
}

/**
 * Conector EVM sobre el cliente JSON-RPC existente, que ya impone una allowlist
 * de solo lectura. Aquí solo se traduce el resultado al modelo normalizado.
 */
export class EvmRpcConnector extends BaseConnector {
  constructor({ id = "evm-rpc", network = "ethereum", client, requestsPerMinute = 60, sleep }) {
    super({ id, kind: "own-node", network, requestsPerMinute, attempts: 3, sleep });
    this.client = client;
  }

  capabilities() {
    return ["fetchBlock", "fetchTransactions", "healthCheck", "chainHead"];
  }

  assertReadOnly(method) {
    if (!isReadOnlyEvmMethod(method)) {
      const error = new Error("Connector rejected a non read-only RPC method: " + method);
      error.code = "CONNECTOR_METHOD_REJECTED";
      error.statusCode = 400;
      throw error;
    }
  }

  async healthCheck() {
    return this.run(async () => {
      const snapshot = await this.client.snapshot();
      return {
        healthy: Boolean(snapshot?.connected),
        network: this.network,
        chainId: snapshot?.chainId || null,
        blockNumber: snapshot?.blockNumber ?? null
      };
    });
  }

  async fetchBlock(blockNumber) {
    return this.run(async () => {
      this.assertReadOnly("eth_getBlockByNumber");
      const hex = "0x" + Number(blockNumber).toString(16);
      const block = await this.client.call("eth_getBlockByNumber", [hex, true]);
      if (!block) return null;
      const source = this.source({ endpoint: "eth_getBlockByNumber" });
      const timestamp = new Date(Number(BigInt(block.timestamp)) * 1000).toISOString();
      const normalizedBlock = normalizeBlock(
        {
          network: this.network,
          height: Number(BigInt(block.number)),
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp,
          transactionCount: (block.transactions || []).length
        },
        source
      );
      const transactions = (block.transactions || [])
        .filter((entry) => entry && entry.from)
        .map((entry) =>
          normalizeTransaction(
            {
              network: this.network,
              txid: entry.hash,
              blockHash: block.hash,
              blockHeight: normalizedBlock.height,
              timestamp,
              transfers: [
                {
                  from: entry.from,
                  to: entry.to || null,
                  amountRaw: BigInt(entry.value || "0x0").toString(),
                  asset: "ETH",
                  decimals: 18,
                  kind: entry.to ? "transfer" : "contract-creation"
                }
              ].filter((transfer) => transfer.from || transfer.to),
              contractAddress: entry.to || null
            },
            source
          )
        );
      return { block: normalizedBlock, transactions };
    });
  }
}

/**
 * Conector Bitcoin de solo lectura con allowlist propia.
 *
 * Limitación declarada: no acepta credenciales. Bitcoin Core normalmente exige
 * autenticación RPC, y este producto rechaza almacenar credenciales por diseño;
 * el camino soportado es un endpoint local de solo lectura sin autenticación o
 * la importación de datasets. Está documentado en BLOCKCHAIN-FORENSICS.md.
 */
export class BitcoinRpcConnector extends BaseConnector {
  constructor({ id = "bitcoin-rpc", endpoint, fetchImpl = globalThis.fetch, requestsPerMinute = 30, timeoutMs = 5000, sleep }) {
    super({ id, kind: "own-node", network: "bitcoin", requestsPerMinute, attempts: 3, sleep });
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol)) {
      const error = new Error("Bitcoin RPC must use HTTP or HTTPS.");
      error.code = "CONNECTOR_ENDPOINT_REJECTED";
      throw error;
    }
    if (url.username || url.password) {
      const error = new Error("Credentials embedded in the Bitcoin RPC URL are rejected.");
      error.code = "CONNECTOR_CREDENTIALS_REJECTED";
      throw error;
    }
    this.url = url;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
  }

  capabilities() {
    return ["fetchBlock", "fetchTransaction", "healthCheck"];
  }

  async call(method, params = []) {
    if (!BITCOIN_READ_ONLY_METHODS.has(method)) {
      const error = new Error("Bitcoin RPC method rejected by the read-only allowlist: " + method);
      error.code = "CONNECTOR_METHOD_REJECTED";
      error.statusCode = 400;
      throw error;
    }
    const response = await this.fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "1.0", id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      throw new Error("Bitcoin RPC returned HTTP " + response.status + ".");
    }
    const payload = await response.json();
    if (payload.error) throw new Error("Bitcoin RPC rejected " + method + ".");
    return payload.result;
  }

  async healthCheck() {
    return this.run(async () => {
      const info = await this.call("getblockchaininfo");
      return {
        healthy: Boolean(info),
        network: this.network,
        chain: info?.chain || null,
        blocks: info?.blocks ?? null
      };
    });
  }

  async fetchBlock(height) {
    return this.run(async () => {
      const hash = await this.call("getblockhash", [Number(height)]);
      const block = await this.call("getblock", [hash, 2]);
      const source = this.source({ endpoint: "getblock" });
      const timestamp = new Date(Number(block.time) * 1000).toISOString();
      const normalizedBlock = normalizeBlock(
        {
          network: "bitcoin",
          height: Number(block.height),
          hash: block.hash,
          parentHash: block.previousblockhash,
          timestamp,
          transactionCount: (block.tx || []).length
        },
        source
      );
      const transactions = (block.tx || []).map((entry) =>
        normalizeTransaction(
          {
            network: "bitcoin",
            txid: entry.txid,
            blockHash: block.hash,
            blockHeight: Number(block.height),
            timestamp,
            inputs: (entry.vin || []).map((input) => ({
              previousTxid: input.txid,
              previousIndex: input.vout,
              coinbase: Boolean(input.coinbase),
              amountRaw: "0"
            })),
            outputs: (entry.vout || []).map((output) => ({
              address: output.scriptPubKey?.address,
              amountRaw: String(Math.round(Number(output.value || 0) * 1e8)),
              scriptType: output.scriptPubKey?.type
            }))
          },
          source
        )
      );
      return { block: normalizedBlock, transactions };
    });
  }
}

/** Registro de conectores disponibles en tiempo de ejecución. */
export class ConnectorRegistry {
  constructor() {
    this.connectors = new Map();
  }

  register(connector) {
    this.connectors.set(connector.id, connector);
    return connector;
  }

  get(id) {
    const connector = this.connectors.get(id);
    if (!connector) {
      const error = new Error("Unknown connector: " + id);
      error.statusCode = 404;
      error.code = "CONNECTOR_NOT_FOUND";
      throw error;
    }
    return connector;
  }

  list() {
    return [...this.connectors.values()].map((connector) => connector.describe());
  }
}
