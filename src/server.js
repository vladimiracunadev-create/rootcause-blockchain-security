// Punto de composición del sistema y arranque del servidor local.
//
// Es el único archivo que decide QUÉ se usa: almacén en memoria o cifrado en
// disco, qué conectores se registran, qué routers se montan y si se precargan
// los escenarios de demostración. Todo lo demás recibe sus dependencias ya
// construidas, y por eso el resto del código se puede probar sin levantar un
// servidor.
//
// `buildRuntime` compone y devuelve; `startServer` escucha. Están separados a
// propósito: las pruebas y los gates de seguridad usan el primero sin publicar
// ningún puerto.
//
// El bloque final solo arranca si este archivo es el punto de entrada del
// proceso, de modo que importarlo nunca levanta un servidor por sorpresa.
import fs from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApplication } from "./app.js";
import { PROJECT_ROOT, assertProductionConfig, loadConfig } from "./config.js";
import { EncryptedFileStore, MemoryStore } from "./infrastructure/encrypted-store.js";
import { EvmRpcClient } from "./infrastructure/evm-rpc.js";
import { createDemoState, createEmptyState } from "./services/demo-state.js";
import { DefenseService } from "./services/defense-service.js";
import { Watchtower } from "./services/watchtower.js";
import { createIntelligenceRouter } from "./api/intelligence-router.js";
import { IntelligenceService } from "./services/intelligence-service.js";
import { ingestDataset } from "./services/intelligence-datasets.js";
import {
  ConnectorRegistry,
  DatasetConnector,
  EvmRpcConnector
} from "./services/intelligence-connectors.js";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function buildRuntime(env = process.env) {
  const config = loadConfig(env);
  assertProductionConfig(config);
  const [policies, controls, indicatorCatalog, intelligencePolicies] = await Promise.all([
    readJson(path.join(PROJECT_ROOT, "config", "policies.json")),
    readJson(path.join(PROJECT_ROOT, "config", "control-catalog.json")),
    readJson(path.join(PROJECT_ROOT, "config", "intelligence-indicators.json")),
    readJson(path.join(PROJECT_ROOT, "config", "intelligence-policies.json"))
  ]);
  const initialState = config.demoMode ? createDemoState() : createEmptyState();
  const store = config.demoMode
    ? new MemoryStore(initialState)
    : new EncryptedFileStore(config.dataFile, config.dataKey, initialState);
  const evmClient = new EvmRpcClient(config.evm);
  const service = new DefenseService({ store, config, policies, controls, evmClient });
  await service.initialize();

  // Conectores de adquisición. El de dataset local está siempre disponible y no
  // toca la red; el de EVM reutiliza el cliente JSON-RPC con su allowlist de
  // solo lectura y hereda su restricción de destino local por defecto.
  const connectors = new ConnectorRegistry();
  connectors.register(new DatasetConnector({ network: "ethereum", dataset: { id: "empty", transactions: [] } }));
  connectors.register(new EvmRpcConnector({ network: "ethereum", client: evmClient }));

  const intelligence = new IntelligenceService({
    defenseService: service,
    indicatorCatalog,
    policies: intelligencePolicies,
    connectors
  });

  // La demo arranca con escenarios reproducibles cargados: una consola de
  // inteligencia vacía no permite comprobar nada.
  if (config.demoMode) {
    for (const datasetId of [
      "02-fan-in",
      "04-peeling-chain",
      "06-address-poisoning",
      "08-drainer-simulado",
      "09-post-exploit",
      "10-falso-positivo"
    ]) {
      await ingestDataset(intelligence, datasetId, "demo-seed");
    }
    await intelligence.analyze("demo-seed");
  }

  const application = createApplication({
    service,
    config,
    staticRoot: path.join(PROJECT_ROOT, "src", "web", "static"),
    intelligenceRouter: createIntelligenceRouter({ intelligence })
  });
  const watchtower = new Watchtower(service, config.watchtower);
  return { application, config, service, intelligence, connectors, watchtower };
}

// La edicion de escritorio necesita que el panel aparezca solo al arrancar.
// Es opcional y explicita: solo se abre si el lanzador lo pide y solo hacia una
// direccion de loopback, para que un despliegue de servidor nunca lance un
// navegador ni exponga una URL remota.
export function openBrowserIfRequested(env, config, url) {
  if (String(env.ROOTCAUSE_OPEN_BROWSER || "") !== "1") return false;
  const host = String(config.host || "").replace(/^\[|\]$/g, "");
  const isLoopback = host === "localhost" || host === "::1" || host.startsWith("127.");
  if (!isLoopback) return false;

  const command =
    process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };

  try {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function startServer(env = process.env) {
  const runtime = await buildRuntime(env);
  const server = http.createServer(runtime.application);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(runtime.config.port, runtime.config.host, resolve);
  });
  runtime.watchtower.start();
  const address = server.address();
  const localUrl =
    "http://" +
    runtime.config.host +
    ":" +
    (typeof address === "object" && address ? address.port : runtime.config.port);
  const browserOpened = openBrowserIfRequested(env, runtime.config, localUrl);
  console.log(
    JSON.stringify({
      level: "info",
      event: "server_started",
      address: localUrl,
      mode: runtime.config.demoMode ? "demo" : "persistent",
      watchtower: runtime.config.watchtower.enabled,
      browserOpened
    })
  );
  const shutdown = () => {
    runtime.watchtower.stop();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return { ...runtime, server };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  startServer().catch((error) => {
    console.error(
      JSON.stringify({ level: "fatal", event: "startup_failed", message: error.message })
    );
    process.exit(1);
  });
}
