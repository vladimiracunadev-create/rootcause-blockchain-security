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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function buildRuntime(env = process.env) {
  const config = loadConfig(env);
  assertProductionConfig(config);
  const [policies, controls] = await Promise.all([
    readJson(path.join(PROJECT_ROOT, "config", "policies.json")),
    readJson(path.join(PROJECT_ROOT, "config", "control-catalog.json"))
  ]);
  const initialState = config.demoMode ? createDemoState() : createEmptyState();
  const store = config.demoMode
    ? new MemoryStore(initialState)
    : new EncryptedFileStore(config.dataFile, config.dataKey, initialState);
  const evmClient = new EvmRpcClient(config.evm);
  const service = new DefenseService({ store, config, policies, controls, evmClient });
  await service.initialize();
  const application = createApplication({
    service,
    config,
    staticRoot: path.join(PROJECT_ROOT, "src", "web", "static")
  });
  const watchtower = new Watchtower(service, config.watchtower);
  return { application, config, service, watchtower };
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
