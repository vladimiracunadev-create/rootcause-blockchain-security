import fs from "node:fs/promises";
import { assertProductionConfig, loadConfig } from "../src/config.js";
import { EncryptedFileStore } from "../src/infrastructure/encrypted-store.js";
import { createDemoState } from "../src/services/demo-state.js";

const config = loadConfig({ ...process.env, DEMO_MODE: "false" });
assertProductionConfig(config);

try {
  await fs.access(config.dataFile);
  console.error("Se rechazó sobrescribir el estado cifrado existente: " + config.dataFile);
  process.exit(1);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const state = createDemoState();
const store = new EncryptedFileStore(config.dataFile, config.dataKey, state);
await store.save(state);
console.log("Estado demo cifrado creado en " + config.dataFile);
