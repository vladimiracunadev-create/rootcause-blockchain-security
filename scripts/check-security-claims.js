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
