// Convierte las promesas del README en un gate ejecutable.
//
// El producto se define por lo que se NIEGA a hacer: no acepta material
// secreto, no habla con un RPC remoto por defecto y no puede firmar ni enviar
// nada por JSON-RPC. Aquí eso se comprueba de dos maneras:
//
//   1. estáticamente, leyendo el código;
//   2. arrancando la aplicación real y golpeándola con peticiones hostiles.
//
// Un README puede envejecer mal. Este script no.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadConfig } from "../src/config.js";
import { EvmRpcClient, isReadOnlyEvmMethod } from "../src/infrastructure/evm-rpc.js";
import { startServer } from "../src/server.js";

const errors = [];
const checks = [];

function ok(label) {
  checks.push(label);
}

function fail(message) {
  errors.push(message);
}

function expect(condition, label, message) {
  if (condition) ok(label);
  else fail(message);
}

// ── 1. Allowlist JSON-RPC: ni una sola llamada que mueva estado ─────────────
const rpcSource = await fs.readFile(
  path.join(PROJECT_ROOT, "src", "infrastructure", "evm-rpc.js"),
  "utf8"
);
const allowlistBlock = rpcSource.match(/READ_ONLY_METHODS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
if (!allowlistBlock) {
  fail("No se encontró la allowlist READ_ONLY_METHODS en evm-rpc.js.");
} else {
  const methods = [...allowlistBlock[1].matchAll(/"([a-z0-9_]+)"/gi)].map((match) => match[1]);
  expect(methods.length > 0, "allowlist RPC no vacía", "La allowlist RPC quedó vacía.");

  // Cualquier método capaz de firmar, enviar o desbloquear una cuenta
  // convierte un observador en algo que puede perder fondos.
  const dangerous =
    /^(?:eth_send|eth_sign|eth_account|personal_|miner_|admin_|txpool_|clique_|parity_|engine_|debug_setHead)/i;
  for (const method of methods) {
    if (dangerous.test(method)) {
      fail("Método capaz de mutar estado o firmar en la allowlist RPC: " + method);
    }
  }
  const mustHave = ["eth_chainId", "eth_blockNumber", "eth_getCode"];
  for (const method of mustHave) {
    if (!methods.includes(method)) fail("La allowlist RPC perdió " + method + ".");
  }
  ok("allowlist RPC solo de lectura (" + methods.length + " métodos)");
}

// La allowlist es una función, no solo una constante: se comprueba su efecto.
for (const forbidden of [
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTransaction",
  "personal_unlockAccount",
  "eth_accounts"
]) {
  expect(
    isReadOnlyEvmMethod(forbidden) === false,
    "allowlist rechaza " + forbidden,
    "isReadOnlyEvmMethod aceptó un método que puede mover fondos: " + forbidden
  );
}

// ── 2. RPC remoto denegado por defecto ─────────────────────────────────────
function endpointRejected(url) {
  try {
    new EvmRpcClient({
      url,
      expectedChainId: "1",
      allowRemote: false,
      timeoutMs: 1000,
      responseLimitBytes: 65536
    });
    return false;
  } catch {
    return true;
  }
}

expect(
  endpointRejected("https://mainnet.proveedor-ejemplo.test/v3/clave"),
  "RPC remoto rechazado por defecto",
  "El cliente EVM aceptó un destino remoto sin EVM_ALLOW_REMOTE_RPC."
);
expect(
  endpointRejected("http://usuario:clave@127.0.0.1:8545"),
  "credenciales en la URL de RPC rechazadas",
  "El cliente EVM aceptó credenciales incrustadas en la URL."
);
expect(
  endpointRejected("ws://127.0.0.1:8546"),
  "protocolo no HTTP rechazado",
  "El cliente EVM aceptó un protocolo fuera de HTTP/HTTPS."
);

// ── 2b. Frontera wallet: la aplicación no puede firmar, conectar ni mutar ──
//
// Con Wallet Security Posture el producto observa cuentas, pero JAMÁS se
// convierte en wallet. Este gate escanea el código ejecutable (src/**) en
// busca de métodos y capacidades prohibidos. Las cadenas se construyen por
// concatenación para que este mismo archivo —que es documentación del gate,
// no código de producto— no se denuncie a sí mismo.
const FORBIDDEN_WALLET_CAPABILITIES = [
  "eth_send" + "Transaction",
  "eth_send" + "RawTransaction",
  "eth_sign" + "Transaction",
  "eth_" + "sign",
  "personal_" + "sign",
  "eth_sign" + "TypedData",
  "wallet_request" + "Permissions",
  "wallet_add" + "EthereumChain",
  "wallet_switch" + "EthereumChain",
  "window." + "ethereum",
  "Wallet" + "Connect",
  "Connect " + "Wallet",
  "Conectar " + "wallet"
];

async function walkSource(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walkSource(target)));
    else results.push(target);
  }
  return results;
}

const sourceFiles = await walkSource(path.join(PROJECT_ROOT, "src"));
let walletBoundaryViolations = 0;
for (const file of sourceFiles) {
  const content = await fs.readFile(file, "utf8");
  for (const capability of FORBIDDEN_WALLET_CAPABILITIES) {
    if (content.includes(capability)) {
      walletBoundaryViolations += 1;
      fail(
        "Capacidad de wallet prohibida en " +
          path.relative(PROJECT_ROOT, file) +
          ": " +
          capability
      );
    }
  }
}
if (walletBoundaryViolations === 0) {
  ok("frontera wallet: sin métodos de firma, conexión ni mutación en src/ (" + FORBIDDEN_WALLET_CAPABILITIES.length + " capacidades vetadas)");
}

// ── 3. Valores por defecto conservadores ───────────────────────────────────
const defaults = loadConfig({});
expect(
  defaults.host === "127.0.0.1",
  "bind por defecto en loopback",
  "El host por defecto dejó de ser 127.0.0.1: " + defaults.host
);
expect(
  defaults.evm.allowRemote === false,
  "EVM_ALLOW_REMOTE_RPC=false por defecto",
  "El RPC remoto pasó a estar habilitado por defecto."
);
expect(
  defaults.evm.url.startsWith("http://127.0.0.1"),
  "RPC por defecto en localhost",
  "El endpoint RPC por defecto dejó de ser local: " + defaults.evm.url
);
expect(
  defaults.watchtower.enabled === false,
  "watchtower apagado por defecto",
  "El watchtower se habilitó por defecto: haría polling sin consentimiento."
);
expect(
  defaults.demoMode === true,
  "modo demo por defecto",
  "El modo demo dejó de ser el arranque por defecto."
);

// ── 4. La aplicación real, contra peticiones hostiles ──────────────────────
const runtime = await startServer({
  DEMO_MODE: "true",
  HOST: "127.0.0.1",
  PORT: "0",
  WATCHTOWER_ENABLED: "false"
});
const port = runtime.server.address().port;
const base = "http://127.0.0.1:" + port;

async function post(pathname, body, headers = {}) {
  return fetch(base + pathname, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

try {
  const health = await fetch(base + "/api/health");
  const healthBody = await health.json();
  expect(
    health.status === 200 && healthBody.service === "rootcause-blockchain-security",
    "/api/health responde",
    "El endpoint de salud no respondió como se espera."
  );

  const page = await fetch(base + "/");
  expect(page.status === 200, "el dashboard se sirve", "El dashboard no se sirvió en /.");
  const csp = page.headers.get("content-security-policy") || "";
  expect(
    csp.includes("default-src 'self'") && !csp.includes("unsafe-inline"),
    "cabecera CSP self-only",
    "La CSP servida no es self-only: " + csp
  );
  expect(
    page.headers.get("x-frame-options") === "DENY",
    "clickjacking bloqueado",
    "Falta la cabecera x-frame-options: DENY."
  );

  const unguarded = await post("/api/projects", { name: "sin cabecera" });
  expect(
    unguarded.status === 403,
    "mutación sin cabecera local rechazada",
    "Una mutación sin x-rootcause-request devolvió " + unguarded.status + " en vez de 403."
  );

  const crossSite = await post(
    "/api/projects",
    { name: "cross-site" },
    { "x-rootcause-request": "1", "sec-fetch-site": "cross-site" }
  );
  expect(
    crossSite.status === 403,
    "mutación cross-site rechazada",
    "Una mutación cross-site devolvió " + crossSite.status + " en vez de 403."
  );

  // El corazón del producto: la aplicación no acepta claves ni credenciales,
  // ni siquiera cuando el usuario insiste en dárselas.
  const secretPayloads = [
    { name: "p", privateKey: "0x" + "ab".repeat(32) },
    { name: "p", deployer: { mnemonic: "abandon abandon abandon" } },
    { name: "p", metadata: { keystore: "material de wallet cifrado" } },
    { name: "p", rpcPassword: "correct horse battery staple" },
    { name: "p", contracts: [{ apiKey: "clave-de-proveedor-000000" }] },
    { name: "p", notes: "http://operador:clave@rpc.interno.test/v1" },
    {
      name: "p",
      // El prefijo va concatenado a propósito: así el vector de prueba existe
      // en tiempo de ejecución pero el archivo no contiene una clave extendida
      // literal que el validador del repositorio tendría que denunciar.
      notes2:
        "xp" +
        "rv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi"
    }
  ];
  for (const payload of secretPayloads) {
    const response = await post("/api/projects", payload, { "x-rootcause-request": "1" });
    const body = await response.json().catch(() => ({}));
    const rejected = response.status === 422 && body?.error?.code === "SECRET_MATERIAL_REJECTED";
    expect(
      rejected,
      "material secreto rechazado (" +
        Object.keys(payload)
          .filter((key) => key !== "name")
          .join(",") +
        ")",
      "La aplicación NO rechazó material secreto: " +
        JSON.stringify(payload) +
        " → " +
        response.status +
        " " +
        JSON.stringify(body)
    );
  }

  // Y el inventario público sí debe entrar: el guard protege, no bloquea el uso.
  const inventory = await post(
    "/api/projects",
    {
      name: "Verificación de inventario",
      chain: { family: "evm", network: "sepolia", chainId: "11155111" },
      environment: "test",
      criticality: "low",
      contracts: [
        {
          name: "TestVault",
          address: "0x" + "11".repeat(20),
          kind: "vault",
          verifiedSource: true,
          upgradeable: false,
          admin: { type: "multisig", owners: 5, threshold: 3 }
        }
      ],
      governance: { model: "multisig", timelockSeconds: 172800 }
    },
    { "x-rootcause-request": "1" }
  );
  expect(
    inventory.status === 201,
    "inventario público aceptado",
    "El inventario público fue rechazado con " +
      inventory.status +
      ": " +
      JSON.stringify(await inventory.json().catch(() => ({})))
  );

  // ── Frontera wallet en runtime ──────────────────────────────────────────
  // La postura de wallets acepta direcciones públicas y hechos observados;
  // rechaza seeds, transacciones firmadas y material de firma en cualquier
  // profundidad del evento.
  const walletSecretPayloads = [
    { address: "0x" + "aa".repeat(20), projectId: "project-atlas-treasury", seedPhrase: "abandon abandon" },
    { address: "0x" + "aa".repeat(20), projectId: "project-atlas-treasury", backup: { keystore: "cifrado" } }
  ];
  for (const payload of walletSecretPayloads) {
    const response = await post("/api/accounts", payload, { "x-rootcause-request": "1" });
    expect(
      response.status === 422,
      "cuenta con material secreto rechazada",
      "Una cuenta vigilada con material secreto devolvió " + response.status + " en vez de 422."
    );
  }

  const walletAccount = await post(
    "/api/accounts",
    {
      projectId: "project-atlas-treasury",
      chainId: "1",
      address: "0x" + "77".repeat(20),
      accountType: "eoa",
      purpose: "Cuenta de verificación del gate",
      criticality: "low"
    },
    { "x-rootcause-request": "1" }
  );
  expect(
    walletAccount.status === 201,
    "cuenta pública vigilada aceptada",
    "El registro de una cuenta pública devolvió " + walletAccount.status + "."
  );

  const signedTxEvent = await post(
    "/api/observe/event",
    {
      type: "wallet.transfer.observed",
      chainId: "1",
      blockNumber: 1,
      transactionHash: "0x" + "ab".repeat(32),
      logIndex: 0,
      walletAddress: "0x" + "77".repeat(20),
      rawSignedTransaction: "0xf86b..."
    },
    { "x-rootcause-request": "1" }
  );
  expect(
    signedTxEvent.status === 422,
    "evento con transacción firmada rechazado",
    "Un evento wallet con transacción firmada devolvió " + signedTxEvent.status + " en vez de 422."
  );

  const walletEventBody = {
    type: "wallet.allowance.changed",
    chainId: "1",
    blockNumber: 21000099,
    transactionHash: "0x" + "cd".repeat(32),
    logIndex: 3,
    walletAddress: "0x" + "77".repeat(20),
    contractAddress: "0x" + "ee".repeat(20),
    spender: "0x" + "ff".repeat(20),
    amountRaw: "1000",
    decimals: 18,
    source: "gate-probe"
  };
  const firstEvent = await post("/api/observe/event", walletEventBody, { "x-rootcause-request": "1" });
  const secondEvent = await post("/api/observe/event", walletEventBody, { "x-rootcause-request": "1" });
  const firstBody = await firstEvent.json().catch(() => ({}));
  const secondBody = await secondEvent.json().catch(() => ({}));
  expect(
    firstEvent.status === 201 && secondEvent.status === 201 && firstBody?.event?.id === secondBody?.event?.id,
    "evento wallet idempotente por chainId + txHash + logIndex",
    "El mismo log entró dos veces: " + JSON.stringify([firstBody?.event?.id, secondBody?.event?.id])
  );

  const walletSummary = await (await fetch(base + "/api/summary")).json();
  expect(
    Number(walletSummary?.walletPosture?.accounts || 0) > 0 &&
      walletSummary.incidents.some((incident) => String(incident.code || "").startsWith("BLK-WALLET-")),
    "wallet posture presente con incidentes demo",
    "El resumen no expone la postura de wallets o el demo no produce incidentes BLK-WALLET-*."
  );

  const dashboardHtml = await (await fetch(base + "/")).text();
  for (const forbiddenUi of ["Connect " + "Wallet", "Conectar " + "wallet", "Revocar" + " allowance"]) {
    expect(
      !dashboardHtml.includes(forbiddenUi),
      "dashboard sin botón «" + forbiddenUi + "»",
      "El dashboard servido contiene una capacidad de wallet prohibida: " + forbiddenUi
    );
  }

  // ── Frontera de inteligencia ────────────────────────────────────────────
  // El dominio de análisis on-chain amplía mucho la superficie: ingiere datos
  // de terceros, puntúa direcciones y expone una API para wallets. Cada una de
  // esas capacidades tiene una forma de convertirse en algo peligroso, y aquí
  // se comprueba que ninguna lo ha hecho.
  const intelSummary = await (await fetch(base + "/api/v1/intelligence/summary")).json();
  expect(
    intelSummary?.apiVersion === "v1" && Number(intelSummary?.summary?.transactions || 0) > 0,
    "API de inteligencia versionada y con datos (" + intelSummary?.summary?.transactions + " transacciones)",
    "La API v1 de inteligencia no respondió con datos: " + JSON.stringify(intelSummary).slice(0, 200)
  );

  // Un puntaje sin explicación es exactamente lo que este producto no puede
  // producir: se comprueba sobre la respuesta real.
  const sampleAddress = "0xc8c8" + "0".repeat(36);
  const riskResponse = await fetch(base + "/api/v1/risk/addresses/ethereum/" + sampleAddress);
  const riskBody = await riskResponse.json();
  const assessment = riskBody?.assessment;
  expect(
    riskResponse.status === 200 &&
      Number.isInteger(assessment?.score) &&
      Array.isArray(assessment?.factorsIncreasing) &&
      Array.isArray(assessment?.limitations) &&
      assessment.limitations.length >= 3 &&
      assessment.requiresHumanReview === true &&
      Boolean(assessment.modelVersion),
    "el puntaje nunca viaja sin explicación, límites y revisión humana",
    "Una evaluación de riesgo llegó sin explicación completa: " + JSON.stringify(riskBody).slice(0, 300)
  );

  // La API de riesgo para wallets es el punto donde un producto así se
  // convierte en custodio por accidente. No debe aceptar material privado ni
  // pretender autorizar nada.
  for (const secret of [
    { network: "ethereum", to: "0x" + "b".repeat(40), seedPhrase: "abandon abandon abandon" },
    { network: "ethereum", to: "0x" + "b".repeat(40), wallet: { privateKey: "0x" + "ab".repeat(32) } },
    { network: "ethereum", to: "0x" + "b".repeat(40), signedTransaction: { rawSignedTransaction: "0xf86b" } }
  ]) {
    const response = await post("/api/v1/risk/transactions", secret, { "x-rootcause-request": "1" });
    expect(
      response.status === 422,
      "la API de riesgo rechaza material privado (" + Object.keys(secret).filter((key) => key !== "network" && key !== "to") + ")",
      "La API de riesgo aceptó material privado: " + response.status
    );
  }

  const advisory = await post(
    "/api/v1/risk/transactions",
    { network: "ethereum", from: sampleAddress, to: "0xdada" + "0".repeat(36) },
    { "x-rootcause-request": "1" }
  );
  const advisoryBody = await advisory.json();
  expect(
    advisory.status === 200 &&
      advisoryBody.decision === "advisory-only" &&
      !("approved" in advisoryBody) &&
      !("blocked" in advisoryBody) &&
      !("signature" in advisoryBody),
    "el análisis previo de transacción es consultivo, no autoriza ni bloquea",
    "El análisis previo devolvió algo que parece una autorización: " + JSON.stringify(advisoryBody).slice(0, 300)
  );

  // El grafo tiene que estar acotado siempre: una consulta hostil no puede
  // pedir profundidad ilimitada y agotar el proceso.
  const hostileGraph = await (
    await fetch(
      base + "/api/v1/intelligence/graph/ethereum/" + sampleAddress + "?depth=100000&maxNodes=100000000"
    )
  ).json();
  expect(
    hostileGraph?.limits?.maxDepth <= 6 && hostileGraph?.limits?.maxNodes <= 2000,
    "el grafo aplica sus cotas aunque se pidan valores extremos",
    "El grafo aceptó límites desmedidos: " + JSON.stringify(hostileGraph?.limits)
  );

  // Ninguna consulta debe poder salirse del directorio de datasets.
  const traversal = await post(
    "/api/v1/intelligence/ingest/dataset",
    { datasetId: "../../package" },
    { "x-rootcause-request": "1" }
  );
  expect(
    traversal.status === 400,
    "el cargador de datasets rechaza el path traversal",
    "Un datasetId con travesía de rutas devolvió " + traversal.status + "."
  );

  // Ninguna lista remota de reputación: consultarla filtraría qué se vigila.
  const intelligenceSources = [
    "src/domain/intelligence/indicators.js",
    "src/domain/intelligence/risk-score.js",
    "src/services/intelligence-service.js"
  ];
  let remoteIntel = 0;
  for (const relative of intelligenceSources) {
    const content = await fs.readFile(path.join(PROJECT_ROOT, relative), "utf8");
    if (/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(content)) {
      remoteIntel += 1;
      fail("El dominio de inteligencia referencia un origen remoto en " + relative + ".");
    }
  }
  if (remoteIntel === 0) ok("inteligencia sin listas remotas de reputación");

  // El paquete distribuido tiene que arrancar CON contenido. Una aplicación
  // que abre vacía es el fallo que nadie detecta a tiempo.
  const summary = await (await fetch(base + "/api/summary")).json();
  expect(
    Number(summary?.totals?.projects || 0) > 0,
    "arranca con inventario (" + summary?.totals?.projects + " proyectos)",
    "La aplicación arrancó sin inventario: el contenido no viajó dentro."
  );
  expect(
    summary?.audit?.valid === true,
    "cadena de auditoría íntegra",
    "La cadena de auditoría no verifica al arrancar."
  );
} finally {
  runtime.watchtower.stop();
  await new Promise((resolve) => runtime.server.close(resolve));
}

if (errors.length) {
  // Escritura síncrona y process.exitCode (no process.exit): en Windows,
  // forzar la salida con handles vivos aborta libuv y se pierde el informe.
  fsSync.writeSync(
    2,
    "Invariantes de seguridad incumplidos:\n" + errors.map((error) => "- " + error).join("\n") + "\n"
  );
  process.exitCode = 1;
} else {
  console.log(checks.map((check) => "  ok  " + check).join("\n"));
  console.log("Invariantes de seguridad verificados: " + checks.length + " comprobaciones.");
}
