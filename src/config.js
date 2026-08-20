import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SOURCE_DIR, "..");

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function parseInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export function loadConfig(env = process.env) {
  const demoMode = parseBoolean(env.DEMO_MODE, true);
  const dataDir = path.resolve(env.DATA_DIR || path.join(PROJECT_ROOT, "data"));

  return Object.freeze({
    host: env.HOST || "127.0.0.1",
    port: parseInteger(env.PORT, 8790, 0, 65535),
    demoMode,
    dataDir,
    dataFile: path.join(dataDir, "state.enc.json"),
    dataKey: env.ROOTCAUSE_DATA_KEY || "",
    bodyLimitBytes: parseInteger(env.REQUEST_BODY_LIMIT_BYTES, 131072, 1024, 1048576),
    rateLimitPerMinute: parseInteger(env.RATE_LIMIT_PER_MINUTE, 120, 10, 10000),
    evm: Object.freeze({
      url: env.EVM_RPC_URL || "http://127.0.0.1:8545",
      expectedChainId: String(env.EVM_EXPECTED_CHAIN_ID || "1"),
      allowRemote: parseBoolean(env.EVM_ALLOW_REMOTE_RPC, false),
      timeoutMs: parseInteger(env.EVM_RPC_TIMEOUT_MS, 5000, 500, 60000),
      responseLimitBytes: parseInteger(env.EVM_RPC_RESPONSE_LIMIT_BYTES, 2097152, 1024, 16777216)
    }),
    watchtower: Object.freeze({
      enabled: parseBoolean(env.WATCHTOWER_ENABLED, false),
      intervalMs: parseInteger(env.WATCHTOWER_INTERVAL_MS, 15000, 5000, 3600000)
    })
  });
}

export function assertProductionConfig(config) {
  if (!config.demoMode && !config.dataKey) {
    throw new Error(
      "ROOTCAUSE_DATA_KEY is required when DEMO_MODE=false. Run pnpm generate:data-key."
    );
  }
}
