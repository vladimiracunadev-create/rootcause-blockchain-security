import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";
import {
  networkFor,
  normalizeAddress,
  normalizeContractRecord,
  normalizeTransaction,
  stableId
} from "../src/domain/intelligence/model.js";
import { evaluateIndicators } from "../src/domain/intelligence/indicators.js";
import { assessRisk } from "../src/domain/intelligence/risk-score.js";

const catalog = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "config", "intelligence-indicators.json"), "utf8")
);
const policies = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "config", "intelligence-policies.json"), "utf8")
);
const DATASET_DIR = path.join(PROJECT_ROOT, "examples", "datasets");

async function loadDataset(id) {
  return JSON.parse(await fs.readFile(path.join(DATASET_DIR, id + ".json"), "utf8"));
}

function registriesFor(dataset) {
  const contracts = new Map();
  for (const entry of dataset.registries?.contracts || []) {
    const record = normalizeContractRecord(entry);
    contracts.set(record.key, record);
  }
  const drainers = new Map();
  for (const entry of dataset.registries?.drainers || []) {
    const record = normalizeContractRecord({ ...entry, flagged: true });
    drainers.set(record.key, record);
  }
  return {
    flaggedContracts: contracts,
    drainers,
    bridges: new Map(),
    exploits: (dataset.registries?.exploits || []).map((entry) => ({
      id: stableId("exploit", entry.network, entry.address, entry.occurredAt),
      network: networkFor(entry.network).id,
      address: normalizeAddress(entry.network, entry.address).address,
      label: entry.label,
      occurredAt: entry.occurredAt
    }))
  };
}

async function runDataset(id) {
  const dataset = await loadDataset(id);
  const transactions = dataset.transactions.map((entry) =>
    normalizeTransaction(entry, { kind: "local-dataset", id: dataset.id })
  );
  const indicators = evaluateIndicators({
    transactions,
    catalog,
    policies,
    registries: registriesFor(dataset),
    now: dataset.evaluateAt
  });
  return { dataset, transactions, indicators };
}

const DATASETS = [
  "01-actividad-normal",
  "02-fan-in",
  "03-fan-out",
  "04-peeling-chain",
  "05-transferencias-rapidas",
  "06-address-poisoning",
  "07-contrato-marcado",
  "08-drainer-simulado",
  "09-post-exploit",
  "10-falso-positivo"
];

// ── Cada dataset produce exactamente lo que declara esperar ────────────────

for (const id of DATASETS) {
  test("dataset " + id + " produces exactly its declared indicators", async () => {
    const { dataset, indicators } = await runDataset(id);
    const produced = [...new Set(indicators.map((entry) => entry.indicator))].sort();
    assert.deepEqual(produced, [...dataset.expected.indicators].sort());
  });
}

test("the normal-activity dataset produces no indicator at all", async () => {
  const { indicators } = await runDataset("01-actividad-normal");
  assert.equal(indicators.length, 0);
});

// ── Forma del resultado ────────────────────────────────────────────────────

test("every indicator carries the full investigative contract", async () => {
  const { indicators } = await runDataset("08-drainer-simulado");
  assert.ok(indicators.length > 0);
  for (const indicator of indicators) {
    assert.ok(indicator.id, "id");
    assert.ok(indicator.indicator, "rule id");
    assert.ok(indicator.description, "description");
    assert.ok(["critical", "high", "medium", "low"].includes(indicator.severity));
    assert.ok(indicator.evidence && typeof indicator.evidence === "object");
    assert.ok(Array.isArray(indicator.relatedTransactions) && indicator.relatedTransactions.length > 0);
    assert.ok(indicator.detectedAt);
    assert.ok(indicator.source?.kind);
    assert.ok(["low", "medium", "high"].includes(indicator.confidence));
    assert.ok(indicator.explanation.length > 20);
    assert.ok(Array.isArray(indicator.falsePositives) && indicator.falsePositives.length >= 2);
    assert.ok(indicator.recommendedAction);
    assert.equal(indicator.epistemicLevel, "indicator");
  }
});

test("indicators never assert guilt or identity", async () => {
  const forbidden = /culpable|delincuente|criminal|ladrón|es el atacante|pertenece a la persona/i;
  for (const id of DATASETS) {
    const { indicators } = await runDataset(id);
    for (const indicator of indicators) {
      const text = [indicator.title, indicator.description, indicator.explanation].join(" ");
      assert.equal(forbidden.test(text), false, indicator.indicator + " uses accusatory language");
    }
  }
});

test("evaluation is deterministic: same input, same output", async () => {
  const first = await runDataset("02-fan-in");
  const second = await runDataset("02-fan-in");
  assert.deepEqual(
    first.indicators.map((entry) => entry.id),
    second.indicators.map((entry) => entry.id)
  );
});

// ── Casos negativos y límite ───────────────────────────────────────────────

test("fan-in stays silent one source below the threshold", async () => {
  const dataset = await loadDataset("02-fan-in");
  const trimmed = dataset.transactions.slice(0, policies.thresholds["INT-FLOW-001"].minimumSources - 1);
  const indicators = evaluateIndicators({
    transactions: trimmed.map((entry) => normalizeTransaction(entry, { kind: "local-dataset", id: "trimmed" })),
    catalog,
    policies,
    registries: registriesFor(dataset),
    now: dataset.evaluateAt
  });
  assert.equal(indicators.some((entry) => entry.indicator === "INT-FLOW-001"), false);
});

test("address poisoning needs more than visual similarity", async () => {
  const dataset = await loadDataset("06-address-poisoning");
  // Mismo escenario pero con un importe normal: deja de ser un candidato.
  const transactions = dataset.transactions.map((entry) => {
    if (entry.transfers[0].amountRaw !== "0") return entry;
    return { ...entry, transfers: [{ ...entry.transfers[0], amountRaw: "5000000000000000000" }] };
  });
  const indicators = evaluateIndicators({
    transactions: transactions.map((entry) => normalizeTransaction(entry, { kind: "local-dataset", id: "fp" })),
    catalog,
    policies,
    registries: registriesFor(dataset),
    now: dataset.evaluateAt
  });
  assert.equal(indicators.some((entry) => entry.indicator === "INT-EXPO-002"), false);
});

test("a poisoning candidate is always reported as heuristic with its caveat", async () => {
  const { indicators } = await runDataset("06-address-poisoning");
  const hit = indicators.find((entry) => entry.indicator === "INT-EXPO-002");
  assert.equal(hit.confidence, "low");
  assert.match(hit.evidence.caveat, /heur/i);
});

test("an approval is not counted as value flow for concentration", async () => {
  const { indicators } = await runDataset("08-drainer-simulado");
  assert.equal(indicators.some((entry) => entry.indicator === "INT-ASSET-001"), false);
});

// ── Puntaje explicable ─────────────────────────────────────────────────────

test("the score is never returned without its explanation", async () => {
  const { indicators } = await runDataset("08-drainer-simulado");
  const subject = indicators[0].subject;
  const assessment = assessRisk({
    subject,
    network: "ethereum",
    indicators: indicators.filter((entry) => entry.subject === subject),
    policies,
    now: "2026-08-02T00:00:00.000Z"
  });
  assert.ok(assessment.score >= 0 && assessment.score <= 100);
  assert.ok(assessment.bandLabel);
  assert.ok(assessment.factorsIncreasing.length > 0);
  assert.ok(assessment.limitations.length >= 3);
  assert.equal(assessment.requiresHumanReview, true);
  assert.ok(assessment.recommendation);
  for (const factor of assessment.factorsIncreasing) {
    assert.ok(Number.isFinite(factor.points));
    assert.ok(factor.label);
    assert.ok(factor.weight);
  }
});

test("bands follow the declared ranges", () => {
  const bands = policies.scoring.bands.map((band) => [band.min, band.max, band.id]);
  assert.deepEqual(bands, [
    [0, 24, "low"],
    [25, 49, "moderate"],
    [50, 74, "high"],
    [75, 100, "critical"]
  ]);
});

test("no indicators yields a zero score that says so explicitly", () => {
  const assessment = assessRisk({
    subject: "ethereum:0x" + "11".repeat(20),
    network: "ethereum",
    indicators: [],
    policies,
    now: "2026-08-02T00:00:00.000Z"
  });
  assert.equal(assessment.score, 0);
  assert.equal(assessment.band, "low");
  assert.ok(assessment.limitations.some((item) => /no se activó ningún indicador/i.test(item)));
});

test("aged evidence weighs less than fresh evidence", async () => {
  const { indicators } = await runDataset("08-drainer-simulado");
  const subject = indicators[0].subject;
  const own = indicators.filter((entry) => entry.subject === subject);
  const fresh = assessRisk({ subject, network: "ethereum", indicators: own, policies, now: "2026-08-02T00:00:00.000Z" });
  const old = assessRisk({ subject, network: "ethereum", indicators: own, policies, now: "2027-08-02T00:00:00.000Z" });
  assert.ok(old.score < fresh.score, "old=" + old.score + " fresh=" + fresh.score);
});

test("a locally labelled counterparty reduces the score of a false positive", async () => {
  const { dataset, indicators } = await runDataset("10-falso-positivo");
  const deposit = normalizeContractRecord(dataset.registries.contracts[0]);
  const own = indicators.filter((entry) => entry.subject === deposit.key);
  assert.ok(own.length > 0, "the dataset must produce indicators on the deposit address");
  const plain = assessRisk({
    subject: deposit.key,
    network: "ethereum",
    indicators: own,
    policies,
    now: dataset.evaluateAt
  });
  const labelled = assessRisk({
    subject: deposit.key,
    network: "ethereum",
    indicators: own,
    context: { locallyLabelled: true, label: deposit.label },
    policies,
    now: dataset.evaluateAt
  });
  assert.ok(labelled.score < plain.score);
  assert.ok(labelled.factorsDecreasing.some((factor) => factor.id === "labelled-counterparty"));
});

test("low source reliability lowers both the score and the stated confidence", async () => {
  const { indicators } = await runDataset("02-fan-in");
  const subject = indicators[0].subject;
  const own = indicators.filter((entry) => entry.subject === subject);
  const weak = own.map((entry) => ({ ...entry, source: { ...entry.source, reliability: 0.3 } }));
  const strong = assessRisk({ subject, network: "ethereum", indicators: own, policies, now: "2026-08-02T00:00:00.000Z" });
  const doubtful = assessRisk({ subject, network: "ethereum", indicators: weak, policies, now: "2026-08-02T00:00:00.000Z" });
  assert.ok(doubtful.score < strong.score);
  assert.equal(doubtful.confidence, "low");
  assert.ok(doubtful.limitations.some((item) => /fiabilidad baja/i.test(item)));
});
