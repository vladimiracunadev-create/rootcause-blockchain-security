// Observador de cadena: cliente JSON-RPC de SOLO LECTURA.
//
// La allowlist es una lista blanca, no una lista negra: un método nuevo no está
// permitido por omisión. Es la diferencia entre un observador y algo capaz de
// mutar estado, y por eso la vigilan dos mecanismos independientes —un gate que
// comprueba su contenido y ejercita la función real, y una búsqueda
// deliberadamente tosca en el workflow de CI—.
//
// El endpoint se valida en el CONSTRUCTOR, no en la primera llamada: una URL
// inválida, con credenciales embebidas o remota sin permiso explícito impide
// arrancar la aplicación. Un observador mal configurado es peor que ninguno,
// porque produce hechos falsos con apariencia de verificados.
//
// La respuesta se corta MIENTRAS llega: un nodo averiado o malicioso podría
// devolver algo enorme, y comprobar su tamaño después de materializarlo ya
// habría consumido la memoria.
const READ_ONLY_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_call",
  "eth_getLogs",
  "net_version",
  "web3_clientVersion"
]);

const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function rpcError(message, code = "EVM_RPC_ERROR") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateEndpoint(value, allowRemote) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw rpcError("EVM_RPC_URL must be a valid URL.", "EVM_RPC_URL_INVALID");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw rpcError("EVM RPC must use HTTP or HTTPS.", "EVM_RPC_PROTOCOL_REJECTED");
  }
  if (url.username || url.password) {
    throw rpcError("Credentials embedded in EVM_RPC_URL are rejected.", "EVM_RPC_CREDENTIALS_REJECTED");
  }
  if (!allowRemote && !LOCAL_HOSTS.has(url.hostname)) {
    throw rpcError(
      "Remote EVM RPC is disabled. Use localhost or explicitly enable EVM_ALLOW_REMOTE_RPC.",
      "EVM_RPC_REMOTE_REJECTED"
    );
  }
  return url;
}

function parseQuantity(value, name) {
  if (!/^0x[0-9a-f]+$/i.test(String(value || ""))) {
    throw rpcError(name + " returned an invalid hexadecimal quantity.");
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw rpcError(name + " exceeds the safe integer range.");
  }
  return Number(parsed);
}

async function readLimitedBody(response, maximumBytes) {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (declared > maximumBytes) throw rpcError("EVM RPC response is too large.", "EVM_RPC_RESPONSE_LIMIT");
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maximumBytes) {
      throw rpcError("EVM RPC response is too large.", "EVM_RPC_RESPONSE_LIMIT");
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw rpcError("EVM RPC response is too large.", "EVM_RPC_RESPONSE_LIMIT");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class EvmRpcClient {
  constructor(options, fetchImpl = globalThis.fetch) {
    this.options = options;
    this.url = validateEndpoint(options.url, options.allowRemote);
    this.fetch = fetchImpl;
    this.nextId = 1;
  }

  async call(method, params = []) {
    if (!READ_ONLY_METHODS.has(method)) {
      throw rpcError("EVM RPC method rejected by the read-only allowlist.", "EVM_RPC_METHOD_REJECTED");
    }
    const response = await this.fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(this.options.timeoutMs)
    });
    if (!response.ok) {
      throw rpcError("EVM RPC returned HTTP " + response.status + ".");
    }
    let payload;
    try {
      payload = JSON.parse(
        await readLimitedBody(response, this.options.responseLimitBytes || 2097152)
      );
    } catch (error) {
      if (error.code) throw error;
      throw rpcError("EVM RPC returned malformed JSON.");
    }
    if (payload.error) {
      throw rpcError("EVM RPC rejected " + method + ": " + String(payload.error.message || "unknown error"));
    }
    return payload.result;
  }

  async snapshot() {
    const [chainIdHex, blockHex, clientVersion, latestBlock] = await Promise.all([
      this.call("eth_chainId"),
      this.call("eth_blockNumber"),
      this.call("web3_clientVersion"),
      this.call("eth_getBlockByNumber", ["latest", false])
    ]);
    const chainId = String(parseQuantity(chainIdHex, "eth_chainId"));
    const blockNumber = parseQuantity(blockHex, "eth_blockNumber");
    return {
      id: "evm-primary",
      family: "evm",
      endpoint: this.url.origin + this.url.pathname,
      connected: true,
      expectedChainId: String(this.options.expectedChainId),
      chainId,
      blockNumber,
      latestObservedBlockNumber: blockNumber,
      blockTimestamp: latestBlock?.timestamp
        ? new Date(parseQuantity(latestBlock.timestamp, "block.timestamp") * 1000).toISOString()
        : null,
      clientVersion: String(clientVersion || "unknown").slice(0, 120),
      checkedAt: new Date().toISOString()
    };
  }
}

export function isReadOnlyEvmMethod(method) {
  return READ_ONLY_METHODS.has(method);
}
