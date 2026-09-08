import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildRuntime } from "../src/server.js";

async function serverFixture() {
  const runtime = await buildRuntime({ DEMO_MODE: "true", PORT: "0" });
  const server = http.createServer(runtime.application);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, baseUrl: "http://127.0.0.1:" + server.address().port };
}

test("forensics API exposes providers and resolves deterministic evidence", async (context) => {
  const { server, baseUrl } = await serverFixture();
  context.after(() => server.close());
  const providers = await (await fetch(baseUrl + "/api/v1/forensics/providers")).json();
  assert.ok(providers.providers.some((provider) => provider.id === "ethereum-rpc"));
  assert.ok(providers.providers.some((provider) => provider.id === "forensic-demo"));

  const response = await fetch(baseUrl + "/api/v1/forensics/transactions/polygon/" + "b".repeat(64) + "?provider=forensic-demo");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.transaction.chain, "polygon");
  assert.equal(body.transaction.provenance.fields.tx_hash, "fixture-polygon");
});

test("forensics API analyzes addresses and applies graph limits", async (context) => {
  const { server, baseUrl } = await serverFixture();
  context.after(() => server.close());
  const address = "0x1111111111111111111111111111111111111111";
  const analysis = await (await fetch(baseUrl + "/api/v1/forensics/addresses/ethereum/" + address + "?provider=forensic-demo")).json();
  assert.equal(analysis.analysis.transaction_count, 1);
  const graph = await (await fetch(baseUrl + "/api/v1/forensics/graph/ethereum/" + address + "?provider=forensic-demo&depth=999&maxNodes=99999")).json();
  assert.equal(graph.graph.limits.appliedDepth, 6);
  assert.ok(graph.graph.nodes.some((node) => node.type === "Transaction"));
});

test("forensics API reconciliation remains protected as a local mutation", async (context) => {
  const { server, baseUrl } = await serverFixture();
  context.after(() => server.close());
  const rejected = await fetch(baseUrl + "/api/v1/forensics/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(rejected.status, 403);
  const accepted = await fetch(baseUrl + "/api/v1/forensics/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json", "x-rootcause-request": "1" },
    body: JSON.stringify({ ledger: [] })
  });
  assert.equal(accepted.status, 200);
  assert.ok((await accepted.json()).reconciliation.summary.MISSING_INTERNAL >= 1);
});
