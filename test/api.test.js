import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createApplication } from "../src/app.js";
import { PROJECT_ROOT } from "../src/config.js";
import { MemoryStore } from "../src/infrastructure/encrypted-store.js";
import { createDemoState } from "../src/services/demo-state.js";
import { DefenseService } from "../src/services/defense-service.js";

const policies = {
  minimumUpgradeDelaySeconds: 86400,
  minimumGovernanceTimelockSeconds: 172800,
  maximumObserverLagBlocks: 8,
  abnormalOutflowUsd: 250000,
  minimumOracleProviders: 2,
  minimumBridgeIndependentOperators: 3,
  minimumBridgeThresholdRatio: 0.6667
};

async function fixture() {
  const config = {
    demoMode: true,
    bodyLimitBytes: 131072,
    rateLimitPerMinute: 1000,
    evm: { url: "http://127.0.0.1:8545", expectedChainId: "1" }
  };
  const service = new DefenseService({
    store: new MemoryStore(createDemoState()),
    config,
    policies,
    controls: { controls: [{ id: "TEST", title: "Test", objective: "Test" }] },
    evmClient: null
  });
  await service.initialize();
  const application = createApplication({
    service,
    config,
    staticRoot: path.join(PROJECT_ROOT, "src", "web", "static")
  });
  const server = http.createServer(application);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, baseUrl: "http://127.0.0.1:" + server.address().port };
}

test("serves health, summary and controls", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  assert.equal((await fetch(baseUrl + "/api/health")).status, 200);
  const summary = await (await fetch(baseUrl + "/api/summary")).json();
  assert.equal(summary.mode, "demo");
  assert.equal(summary.totals.projects, 2);
  assert.ok(summary.risk.score > 0);
  const controls = await (await fetch(baseUrl + "/api/controls")).json();
  assert.equal(controls.controls.length, 1);
});

test("requires the local mutation header", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 403);
});

test("rejects secret fields before project registration", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", "x-rootcause-request": "1" },
    body: JSON.stringify({ name: "Unsafe", privateKey: "must-never-enter" })
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "SECRET_MATERIAL_REJECTED");
});

test("registers a public multi-chain project", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", "x-rootcause-request": "1" },
    body: JSON.stringify({
      name: "Public Registry",
      chain: { family: "evm", network: "testnet", chainId: "31337" },
      environment: "test",
      criticality: "low",
      contracts: [
        {
          name: "Registry",
          address: "0x4444444444444444444444444444444444444444",
          kind: "registry",
          verifiedSource: true,
          upgradeable: false,
          admin: { type: "none", owners: 0, threshold: 0 }
        }
      ],
      governance: { model: "none", timelockSeconds: 0 }
    })
  });
  assert.equal(response.status, 201);
  const summary = await (await fetch(baseUrl + "/api/summary")).json();
  assert.equal(summary.totals.projects, 3);
});
