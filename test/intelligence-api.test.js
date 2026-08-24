import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createApplication } from "../src/app.js";
import { PROJECT_ROOT } from "../src/config.js";
import { MemoryStore } from "../src/infrastructure/encrypted-store.js";
import { createEmptyState } from "../src/services/demo-state.js";
import { DefenseService } from "../src/services/defense-service.js";
import { IntelligenceService } from "../src/services/intelligence-service.js";
import { ConnectorRegistry, DatasetConnector } from "../src/services/intelligence-connectors.js";
import { createIntelligenceRouter } from "../src/api/intelligence-router.js";

const catalog = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "config", "intelligence-indicators.json"), "utf8")
);
const intelligencePolicies = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "config", "intelligence-policies.json"), "utf8")
);
const policies = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "config", "policies.json"), "utf8"));

const MUTATE = { "content-type": "application/json", "x-rootcause-request": "1" };

async function fixture() {
  const config = {
    demoMode: true,
    bodyLimitBytes: 131072,
    rateLimitPerMinute: 1000,
    evm: { url: "http://127.0.0.1:8545", expectedChainId: "1" }
  };
  const defense = new DefenseService({
    store: new MemoryStore(createEmptyState()),
    config,
    policies,
    controls: { controls: [] },
    evmClient: null
  });
  await defense.initialize();
  const connectors = new ConnectorRegistry();
  connectors.register(new DatasetConnector({ network: "ethereum", dataset: { id: "empty", transactions: [] } }));
  const intelligence = new IntelligenceService({
    defenseService: defense,
    indicatorCatalog: catalog,
    policies: intelligencePolicies,
    connectors
  });
  const application = createApplication({
    service: defense,
    config,
    staticRoot: path.join(PROJECT_ROOT, "src", "web", "static"),
    intelligenceRouter: createIntelligenceRouter({ intelligence })
  });
  const server = http.createServer(application);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, baseUrl: "http://127.0.0.1:" + server.address().port, intelligence };
}

async function seed(baseUrl, datasetId = "08-drainer-simulado") {
  await fetch(baseUrl + "/api/v1/intelligence/ingest/dataset", {
    method: "POST",
    headers: MUTATE,
    body: JSON.stringify({ datasetId })
  });
  await fetch(baseUrl + "/api/v1/intelligence/analyze", { method: "POST", headers: MUTATE, body: "{}" });
}

test("the API is versioned and exposes summary, catalog and datasets", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const summary = await (await fetch(baseUrl + "/api/v1/intelligence/summary")).json();
  assert.equal(summary.apiVersion, "v1");
  assert.equal(summary.summary.modelVersion, catalog.modelVersion);
  const indicators = await (await fetch(baseUrl + "/api/v1/intelligence/indicators")).json();
  assert.equal(indicators.indicators.length, 15);
  const datasets = await (await fetch(baseUrl + "/api/v1/intelligence/datasets")).json();
  assert.equal(datasets.datasets.length, 10);
  assert.ok(datasets.datasets.every((entry) => Array.isArray(entry.expected.indicators)));
});

test("ingesting a dataset and analysing produces alerts through the API", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const ingest = await fetch(baseUrl + "/api/v1/intelligence/ingest/dataset", {
    method: "POST",
    headers: MUTATE,
    body: JSON.stringify({ datasetId: "08-drainer-simulado" })
  });
  assert.equal(ingest.status, 202);
  const analyze = await fetch(baseUrl + "/api/v1/intelligence/analyze", { method: "POST", headers: MUTATE, body: "{}" });
  assert.equal(analyze.status, 200);
  const alerts = await (await fetch(baseUrl + "/api/v1/intelligence/alerts")).json();
  assert.ok(alerts.alerts.length >= 2);
});

test("risk endpoint returns the score together with its full explanation", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  await seed(baseUrl);
  const victim = "0xc8c8" + "0".repeat(36);
  const response = await fetch(baseUrl + "/api/v1/risk/addresses/ethereum/" + victim);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.apiVersion, "v1");
  const assessment = body.assessment;
  assert.ok(Number.isInteger(assessment.score));
  assert.ok(assessment.bandLabel);
  assert.ok(assessment.confidence);
  assert.ok(assessment.factorsIncreasing.length > 0);
  assert.ok(assessment.limitations.length >= 3);
  assert.ok(assessment.modelVersion);
  assert.ok(assessment.evaluatedAt);
  assert.equal(assessment.requiresHumanReview, true);
  assert.equal(assessment.subject, "ethereum:" + victim);
});

test("the risk API never asks for or accepts wallet secrets", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/v1/risk/transactions", {
    method: "POST",
    headers: MUTATE,
    body: JSON.stringify({
      network: "ethereum",
      to: "0x" + "b".repeat(40),
      seedPhrase: "abandon abandon abandon"
    })
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "SECRET_MATERIAL_REJECTED");
});

test("transaction pre-check is advisory: it warns, it does not authorise", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  await seed(baseUrl);
  const response = await fetch(baseUrl + "/api/v1/risk/transactions", {
    method: "POST",
    headers: MUTATE,
    body: JSON.stringify({ network: "ethereum", from: "0xc8c8" + "0".repeat(36), to: "0xdada" + "0".repeat(36) })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.decision, "advisory-only");
  assert.match(body.notice, /no construye, firma ni transmite/i);
  assert.ok(!("approved" in body));
  assert.ok(!("blocked" in body));
});

test("an invalid address is rejected with a clear error, not a wrong answer", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/v1/risk/addresses/ethereum/0x123456789012345678901234");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "ADDRESS_INVALID");
});

test("an unsupported network is rejected", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/v1/risk/addresses/dogecoin/" + "0x" + "a".repeat(40));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "NETWORK_NOT_SUPPORTED");
});

test("graph endpoint applies and reports its limits", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  await seed(baseUrl, "05-transferencias-rapidas");
  const start = "0xe1e1" + "0".repeat(36);
  const response = await fetch(
    baseUrl + "/api/v1/intelligence/graph/ethereum/" + start + "?direction=forward&depth=1"
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.limits.maxDepth, 1);
  assert.ok(body.nodes.length >= 1);
  assert.match(body.caveat, /no una relación entre personas/i);
});

test("graph query parameters are validated instead of trusted", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const start = "0xe1e1" + "0".repeat(36);
  const response = await fetch(baseUrl + "/api/v1/intelligence/graph/ethereum/" + start + "?depth=abc");
  assert.equal(response.status, 400);
  const bad = await fetch(baseUrl + "/api/v1/intelligence/paths?network=ethereum&from=" + start);
  assert.equal(bad.status, 400);
});

test("mutations require the local header, exactly like the rest of the API", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/v1/intelligence/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 403);
});

test("cross-site mutations are rejected on the v1 API too", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/v1/intelligence/analyze", {
    method: "POST",
    headers: { ...MUTATE, "sec-fetch-site": "cross-site" },
    body: "{}"
  });
  assert.equal(response.status, 403);
});

test("alerts and cases can be driven end to end over HTTP", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  await seed(baseUrl);
  const alerts = (await (await fetch(baseUrl + "/api/v1/intelligence/alerts")).json()).alerts;

  const patched = await fetch(baseUrl + "/api/v1/intelligence/alerts/" + alerts[0].id, {
    method: "PATCH",
    headers: MUTATE,
    body: JSON.stringify({ status: "in-review", assignedTo: "analyst-1" })
  });
  assert.equal(patched.status, 200);

  const created = await fetch(baseUrl + "/api/v1/intelligence/cases", {
    method: "POST",
    headers: MUTATE,
    body: JSON.stringify({ title: "Investigacion de prueba", alertIds: [alerts[0].id] })
  });
  assert.equal(created.status, 201);
  const investigation = (await created.json()).case;

  const evidence = await fetch(baseUrl + "/api/v1/intelligence/cases/" + investigation.id + "/evidence", {
    method: "POST",
    headers: MUTATE,
    body: JSON.stringify({ kind: "note", description: "Observacion", payload: { note: "verificado" } })
  });
  assert.equal(evidence.status, 201);

  const report = await (await fetch(baseUrl + "/api/v1/intelligence/cases/" + investigation.id + "/report")).json();
  assert.ok(report.case);
  assert.ok(report.evidence[0].integrity.valid);

  const integrity = await (await fetch(baseUrl + "/api/v1/intelligence/evidence/verify")).json();
  assert.equal(integrity.valid, true);
});

test("unknown v1 routes fall through to a 404 instead of a wrong handler", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  const response = await fetch(baseUrl + "/api/v1/intelligence/nope");
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});

test("legacy API routes keep working alongside v1", async (context) => {
  const { server, baseUrl } = await fixture();
  context.after(() => server.close());
  assert.equal((await fetch(baseUrl + "/api/health")).status, 200);
  assert.equal((await fetch(baseUrl + "/api/summary")).status, 200);
  assert.equal((await fetch(baseUrl + "/api/controls")).status, 200);
});
