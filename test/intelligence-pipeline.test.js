import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";
import { MemoryStore } from "../src/infrastructure/encrypted-store.js";
import { createEmptyState } from "../src/services/demo-state.js";
import { DefenseService } from "../src/services/defense-service.js";
import { IntelligenceService } from "../src/services/intelligence-service.js";
import { ingestDataset, loadDataset } from "../src/services/intelligence-datasets.js";
import {
  ConnectorRegistry,
  DatasetConnector,
  EvmRpcConnector,
  RateLimiter,
  isRetryable,
  withRetry
} from "../src/services/intelligence-connectors.js";

const catalog = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "config", "intelligence-indicators.json"), "utf8")
);
const intelligencePolicies = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "config", "intelligence-policies.json"), "utf8")
);
const policies = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "config", "policies.json"), "utf8"));

async function fixture() {
  const config = { demoMode: true, bodyLimitBytes: 131072, rateLimitPerMinute: 1000, evm: { url: "http://127.0.0.1:8545", expectedChainId: "1" } };
  const defense = new DefenseService({
    store: new MemoryStore(createEmptyState()),
    config,
    policies,
    controls: { controls: [] },
    evmClient: null
  });
  await defense.initialize();
  const connectors = new ConnectorRegistry();
  const intelligence = new IntelligenceService({
    defenseService: defense,
    indicatorCatalog: catalog,
    policies: intelligencePolicies,
    connectors
  });
  return { defense, intelligence, connectors };
}

const SOURCE = { kind: "own-node", id: "test-node" };
const block = (height, hash, parentHash) => ({
  network: "ethereum",
  height,
  hash: "0x" + hash.repeat(64).slice(0, 64),
  parentHash: "0x" + parentHash.repeat(64).slice(0, 64),
  timestamp: new Date(Date.UTC(2026, 7, 1, height)).toISOString()
});
const transaction = (id, blockHash, height) => ({
  network: "ethereum",
  txid: "0x" + id.repeat(64).slice(0, 64),
  blockHash: "0x" + blockHash.repeat(64).slice(0, 64),
  blockHeight: height,
  timestamp: new Date(Date.UTC(2026, 7, 1, height)).toISOString(),
  transfers: [
    { from: "0x" + "a".repeat(40), to: "0x" + "b".repeat(40), amountRaw: "1000", asset: "ETH" }
  ]
});

// ── Idempotencia y duplicados ─────────────────────────────────────────────

test("ingest is idempotent: the same transaction never enters twice", async () => {
  const { intelligence } = await fixture();
  const payload = { blocks: [block(1, "a", "0")], transactions: [transaction("1", "a", 1)], source: SOURCE };
  const first = await intelligence.ingest(payload);
  const second = await intelligence.ingest(payload);
  assert.equal(first.stats.transactionsAccepted, 1);
  assert.equal(second.stats.transactionsAccepted, 0);
  assert.equal(second.stats.transactionsDuplicated, 1);
  assert.equal(second.stats.blocksDuplicated, 1);
  const state = await intelligence.read();
  assert.equal(state.transactions.length, 1);
});

test("the same transaction hash written with 0x or uppercase is the same record", async () => {
  const { intelligence } = await fixture();
  await intelligence.ingest({ transactions: [transaction("1", "a", 1)], source: SOURCE });
  const upper = { ...transaction("1", "a", 1), txid: ("0x" + "1".repeat(64)).toUpperCase() };
  const run = await intelligence.ingest({ transactions: [upper], source: SOURCE });
  assert.equal(run.stats.transactionsDuplicated, 1);
});

// ── Reorganizaciones ──────────────────────────────────────────────────────

test("a competing block at the same height is treated as a reorg, not a duplicate", async () => {
  const { intelligence } = await fixture();
  await intelligence.ingest({
    blocks: [block(10, "a", "9")],
    transactions: [transaction("a", "a", 10)],
    source: SOURCE
  });
  const run = await intelligence.ingest({
    blocks: [block(10, "b", "9")],
    transactions: [transaction("b", "b", 10)],
    source: SOURCE
  });
  assert.equal(run.stats.reorgs, 1);
  assert.equal(run.stats.orphanedTransactions, 1);

  const state = await intelligence.read();
  const orphanedBlock = state.blocks.find((entry) => entry.hash.startsWith("aaaa"));
  assert.equal(orphanedBlock.orphaned, true);
  assert.ok(orphanedBlock.replacedBy);
  assert.equal(state.ingestion.reorgs.length, 1);
  // La evidencia se conserva: nada se borra, solo se marca.
  assert.equal(state.transactions.length, 2);
  assert.equal(intelligence.activeTransactions(state).length, 1);
});

test("orphaned transactions are excluded from analysis", async () => {
  const { intelligence } = await fixture();
  await intelligence.ingest({ blocks: [block(5, "a", "4")], transactions: [transaction("a", "a", 5)], source: SOURCE });
  await intelligence.ingest({ blocks: [block(5, "b", "4")], transactions: [], source: SOURCE });
  const summary = await intelligence.summary();
  assert.equal(summary.orphanedTransactions, 1);
  assert.equal(summary.transactions, 0);
});

// ── Procedencia ───────────────────────────────────────────────────────────

test("every ingested record keeps its provenance and reliability", async () => {
  const { intelligence } = await fixture();
  await intelligence.ingest({ transactions: [transaction("1", "a", 1)], source: { kind: "explorer", id: "public-explorer" } });
  const state = await intelligence.read();
  assert.equal(state.transactions[0].source.kind, "explorer");
  assert.equal(state.transactions[0].source.reliability, 0.6);
  assert.ok(state.transactions[0].source.retrievedAt);
  assert.equal(state.transactions[0].epistemicLevel, "observed-fact");
});

test("an unknown source kind degrades to the lowest reliability instead of being trusted", async () => {
  const { intelligence } = await fixture();
  await intelligence.ingest({ transactions: [transaction("1", "a", 1)], source: { kind: "friend-told-me", id: "x" } });
  const state = await intelligence.read();
  assert.equal(state.transactions[0].source.kind, "unknown");
  assert.equal(state.transactions[0].source.reliability, 0.3);
});

// ── Validación de entrada ─────────────────────────────────────────────────

test("ingest rejects malformed addresses and hashes", async () => {
  const { intelligence } = await fixture();
  await assert.rejects(
    () => intelligence.ingest({ transactions: [{ ...transaction("1", "a", 1), txid: "not-a-hash" }], source: SOURCE }),
    /32-byte hash/
  );
  await assert.rejects(
    () =>
      intelligence.ingest({
        transactions: [
          { ...transaction("1", "a", 1), transfers: [{ from: "0xshort", to: "0x" + "b".repeat(40), amountRaw: "1" }] }
        ],
        source: SOURCE
      }),
    /EVM address/
  );
});

test("ingest rejects secret material at any depth", async () => {
  const { intelligence } = await fixture();
  await assert.rejects(
    () =>
      intelligence.ingest({
        transactions: [{ ...transaction("1", "a", 1), metadata: { deep: { privateKey: "0x" + "ab".repeat(32) } } }],
        source: SOURCE
      }),
    /Secret|Forbidden/i
  );
});

// ── Datasets ──────────────────────────────────────────────────────────────

test("dataset ingestion loads registries and transactions together", async () => {
  const { intelligence } = await fixture();
  const result = await ingestDataset(intelligence, "08-drainer-simulado");
  assert.equal(result.run.stats.transactionsAccepted, 2);
  const state = await intelligence.read();
  assert.equal(state.registries.drainers.length, 1);
});

test("dataset identifiers cannot escape the dataset directory", async () => {
  await assert.rejects(() => loadDataset("../../package"), /unsupported characters/i);
  await assert.rejects(() => loadDataset("..\\..\\package"), /unsupported characters/i);
  await assert.rejects(() => loadDataset("nope-does-not-exist"), /not found/i);
});

// ── Análisis y alertas ────────────────────────────────────────────────────

test("analysis creates one alert per indicator and does not duplicate on re-run", async () => {
  const { intelligence } = await fixture();
  await ingestDataset(intelligence, "08-drainer-simulado");
  const first = await intelligence.analyze();
  assert.ok(first.indicators >= 2);
  assert.equal(first.alertsCreated, first.indicators);
  const second = await intelligence.analyze();
  assert.equal(second.alertsCreated, 0);
  const alerts = await intelligence.alerts();
  assert.equal(alerts.length, first.indicators);
});

test("alerts follow their lifecycle and record who changed what", async () => {
  const { intelligence } = await fixture();
  await ingestDataset(intelligence, "02-fan-in");
  await intelligence.analyze();
  const [alert] = await intelligence.alerts();
  assert.equal(alert.status, "new");
  const reviewing = await intelligence.updateAlert(alert.id, { status: "in-review", assignedTo: "analyst-1" }, "analyst-1");
  assert.equal(reviewing.status, "in-review");
  assert.equal(reviewing.assignedTo, "analyst-1");
  const closed = await intelligence.updateAlert(
    alert.id,
    { status: "false-positive", note: "Direccion de deposito conocida" },
    "analyst-1"
  );
  assert.equal(closed.status, "false-positive");
  assert.match(closed.falsePositiveReason, /deposito/i);
  assert.equal(closed.history.length, 3);
});

test("an unsupported alert status is rejected", async () => {
  const { intelligence } = await fixture();
  await ingestDataset(intelligence, "02-fan-in");
  await intelligence.analyze();
  const [alert] = await intelligence.alerts();
  await assert.rejects(() => intelligence.updateAlert(alert.id, { status: "deleted" }), /Unsupported alert status/);
});

// ── Casos y evidencia ─────────────────────────────────────────────────────

test("a case collects alerts, notes, decisions, evidence and a timeline", async () => {
  const { intelligence } = await fixture();
  await ingestDataset(intelligence, "08-drainer-simulado");
  await intelligence.analyze();
  const alerts = await intelligence.alerts();
  const investigation = await intelligence.openCase(
    { title: "Vaciado sospechoso", summary: "Aprobacion ilimitada seguida de transferencia", alertIds: [alerts[0].id] },
    "analyst-1"
  );
  assert.equal(investigation.status, "open");
  const evidence = await intelligence.attachEvidence(
    investigation.id,
    { kind: "transaction", description: "Transferencia observada", payload: { txid: alerts[0].indicatorHitId } },
    "analyst-1"
  );
  assert.ok(evidence.contentHash);
  const updated = await intelligence.updateCase(
    investigation.id,
    { note: "Confirmado con una segunda fuente", decision: "Escalar a respuesta", status: "in-review" },
    "analyst-1"
  );
  assert.equal(updated.notes.length, 1);
  assert.equal(updated.decisions.length, 1);
  assert.equal(updated.status, "in-review");
  assert.ok(updated.timeline.length >= 4);

  const integrity = await intelligence.verifyEvidenceIntegrity();
  assert.equal(integrity.valid, true);
  assert.equal(integrity.total, 1);
});

test("a case report separates facts, indicators and inferences", async () => {
  const { intelligence } = await fixture();
  await ingestDataset(intelligence, "08-drainer-simulado");
  await intelligence.analyze();
  const alerts = await intelligence.alerts();
  const investigation = await intelligence.openCase({ title: "Informe", alertIds: alerts.map((a) => a.id) });
  const report = await intelligence.caseReport(investigation.id);
  assert.ok(report.alerts.length > 0);
  assert.ok(report.assessments.length > 0);
  assert.match(report.epistemicNotice, /HECHOS OBSERVADOS/);
  assert.ok(report.limitations.length >= 3);
  assert.equal(report.assessments[0].requiresHumanReview, true);
});

test("attaching evidence to an unknown case fails cleanly", async () => {
  const { intelligence } = await fixture();
  await assert.rejects(
    () => intelligence.attachEvidence("case-" + "0".repeat(20), { kind: "note", payload: {} }),
    /Case not found/
  );
});

// ── Análisis previo de transacción ────────────────────────────────────────

test("transaction intent analysis is advisory and never authorises anything", async () => {
  const { intelligence } = await fixture();
  await ingestDataset(intelligence, "08-drainer-simulado");
  await intelligence.analyze();
  const result = await intelligence.assessTransactionIntent({
    network: "ethereum",
    from: "0x" + "c8c8".padEnd(40, "0"),
    to: "0x" + "dada".padEnd(40, "0")
  });
  assert.equal(result.decision, "advisory-only");
  assert.match(result.notice, /no construye, firma ni transmite/i);
  assert.ok(result.warnings.length >= 1);
  assert.equal(result.counterparty.requiresHumanReview, true);
});

test("transaction intent analysis rejects secret material", async () => {
  const { intelligence } = await fixture();
  await assert.rejects(
    () =>
      intelligence.assessTransactionIntent({
        network: "ethereum",
        to: "0x" + "b".repeat(40),
        privateKey: "0x" + "ab".repeat(32)
      }),
    /Secret|Forbidden/i
  );
});

// ── Conectores ────────────────────────────────────────────────────────────

test("the dataset connector reads without touching the network", async () => {
  const dataset = await loadDataset("05-transferencias-rapidas");
  const connector = new DatasetConnector({ network: "ethereum", dataset });
  const health = await connector.healthCheck();
  assert.equal(health.healthy, true);
  const transactions = await connector.fetchTransactions();
  assert.equal(transactions.length, 3);
  assert.equal(connector.describe().readOnly, true);
  assert.equal(connector.describe().canSign, false);
  assert.equal(connector.describe().canBroadcast, false);
});

test("the EVM connector refuses any method outside the read-only allowlist", async () => {
  const connector = new EvmRpcConnector({ client: { call: async () => null, snapshot: async () => ({}) } });
  assert.throws(() => connector.assertReadOnly("eth_sendRawTransaction"), /non read-only/);
  assert.throws(() => connector.assertReadOnly("personal_sign"), /non read-only/);
  assert.doesNotThrow(() => connector.assertReadOnly("eth_getBlockByNumber"));
});

test("the rate limiter blocks once the budget is spent", () => {
  let clock = 0;
  const limiter = new RateLimiter({ requestsPerMinute: 2, now: () => clock });
  assert.equal(limiter.tryConsume(), true);
  assert.equal(limiter.tryConsume(), true);
  assert.equal(limiter.tryConsume(), false);
  clock += 60001;
  assert.equal(limiter.tryConsume(), true);
});

test("a connector reports rate limiting instead of hammering its source", async () => {
  const dataset = await loadDataset("01-actividad-normal");
  const connector = new DatasetConnector({ network: "ethereum", dataset });
  connector.limiter = new RateLimiter({ requestsPerMinute: 1, now: () => 0 });
  await connector.fetchTransactions();
  await assert.rejects(() => connector.fetchTransactions(), /rate limit/i);
  assert.equal(connector.metrics.failures, 1);
});

test("retries happen for transient failures and never for rejected methods", async () => {
  let attempts = 0;
  const value = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary");
      return "ok";
    },
    { attempts: 4, sleep: async () => {} }
  );
  assert.equal(value.value, "ok");
  assert.equal(value.attempts, 3);

  const permanent = new Error("nope");
  permanent.code = "CONNECTOR_METHOD_REJECTED";
  assert.equal(isRetryable(permanent), false);
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw permanent;
        },
        { attempts: 5, sleep: async () => {} }
      ),
    /nope/
  );
  assert.equal(calls, 1);
});

test("connector metrics make the health of the source observable", async () => {
  const dataset = await loadDataset("01-actividad-normal");
  const connector = new DatasetConnector({ network: "ethereum", dataset });
  await connector.fetchTransactions();
  const described = connector.describe();
  assert.equal(described.metrics.requests, 1);
  assert.equal(described.metrics.failures, 0);
  assert.ok(described.metrics.lastSuccessAt);
});

test("the registry exposes connectors and fails clearly on an unknown id", () => {
  const registry = new ConnectorRegistry();
  registry.register(new DatasetConnector({ network: "ethereum", dataset: { id: "x", transactions: [] } }));
  assert.equal(registry.list().length, 1);
  assert.throws(() => registry.get("nope"), /Unknown connector/);
});

// ── Estado heredado ───────────────────────────────────────────────────────

test("state written before this version gains the intelligence block safely", async () => {
  const legacy = createEmptyState();
  delete legacy.intelligence;
  const intelligence = IntelligenceService.ensureState(legacy);
  assert.deepEqual(intelligence.transactions, []);
  assert.deepEqual(intelligence.registries.contracts, []);
  assert.equal(intelligence.ingestion.reorgs.length, 0);
});
