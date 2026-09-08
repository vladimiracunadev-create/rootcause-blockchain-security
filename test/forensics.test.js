import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PROJECT_ROOT } from "../src/config.js";
import { normalizeBlockchainTransaction, TRANSACTION_FIELDS, verifyTransactionEvidence } from "../src/forensics/model.js";
import { FixtureProvider, EvmForensicsProvider, BitcoinForensicsProvider } from "../src/forensics/providers.js";
import { analyzeAddress, buildTransactionGraph, FORENSIC_GRAPH_LIMITS } from "../src/forensics/analysis.js";
import { parseCsv, reconcileLedger, RECONCILIATION_CLASSES } from "../src/forensics/reconciliation.js";
import { buildForensicTimeline } from "../src/forensics/timeline.js";
import { createEvidenceReport, reportToMarkdown } from "../src/forensics/report.js";
import { graphToGraphMl } from "../src/forensics/formats.js";

const fixturePath = path.join(PROJECT_ROOT, "examples", "forensics", "investigation.json");
const ledgerPath = path.join(PROJECT_ROOT, "examples", "forensics", "internal-ledger.csv");
async function fixture(chain = null) { return FixtureProvider.fromFile(fixturePath, chain); }

test("BlockchainTransaction implements the complete normalized contract with per-field provenance", async () => {
  const tx = (await fixture("ethereum")).transactions()[0];
  assert.deepEqual(TRANSACTION_FIELDS.filter((field) => !(field in tx)), []);
  for (const field of TRANSACTION_FIELDS) assert.equal(tx.provenance.fields[field], "fixture-ethereum");
  assert.equal(tx.epistemic_level, "observed-fact");
  assert.equal(verifyTransactionEvidence(tx).valid, true);
});

test("Bitcoin, Ethereum and Polygon fixtures normalize deterministically", async () => {
  const transactions = (await fixture()).transactions();
  assert.deepEqual(transactions.map((tx) => tx.chain).sort(), ["bitcoin", "ethereum", "polygon"]);
  assert.equal(transactions.find((tx) => tx.chain === "polygon").asset, "POL");
});

test("address analysis returns exact flows, counterparties and observed range", async () => {
  const provider = await fixture("ethereum");
  const address = "0x1111111111111111111111111111111111111111";
  const analysis = analyzeAddress("ethereum", address, await provider.getAddressTransactions(address), await provider.getBalance(address));
  assert.equal(analysis.transaction_count, 1);
  assert.equal(analysis.outflows.USDC, "250000000");
  assert.equal(analysis.fees.ETH, "21000000000000");
  assert.equal(analysis.counterparties[0].address, "0x2222222222222222222222222222222222222222");
  assert.match(analysis.caveat, /no identifica/);
});

test("transaction graph is Address -> Transaction -> Address and enforces hard limits", async () => {
  const transactions = (await fixture("ethereum")).transactions();
  const graph = buildTransactionGraph(transactions, { chain: "ethereum", address: transactions[0].from, depth: 999, maxNodes: 99999, maxEdges: 99999 });
  assert.deepEqual(graph.nodes.map((node) => node.type).sort(), ["Address", "Address", "Transaction"]);
  assert.deepEqual(graph.edges.map((edge) => edge.relation), ["sent", "received"]);
  assert.equal(graph.limits.appliedDepth, FORENSIC_GRAPH_LIMITS.maxDepth);
  assert.match(graphToGraphMl(graph), /<graphml[\s\S]*<node[\s\S]*<edge/);
});

test("reconciliation classifies matches, differences and records missing on either side", async () => {
  const provider = await fixture();
  const ledger = parseCsv(await fs.readFile(ledgerPath, "utf8"));
  const result = reconcileLedger(ledger, provider.transactions());
  assert.equal(result.summary.MATCH, 1);
  assert.equal(result.summary.AMOUNT_MISMATCH, 1);
  assert.equal(result.summary.MISSING_ONCHAIN, 1);
  assert.equal(result.summary.MISSING_INTERNAL, 1);
  assert.deepEqual(Object.keys(result.summary), RECONCILIATION_CLASSES);
});

test("reconciliation detects duplicates before treating them as matches", async () => {
  const provider = await fixture("ethereum");
  const tx = provider.transactions()[0];
  const row = { tx_hash: tx.tx_hash, timestamp: tx.timestamp, from: tx.from, to: tx.to, amount: tx.amount };
  const result = reconcileLedger([row, { ...row }], [tx]);
  assert.equal(result.summary.DUPLICATE, 2);
  assert.equal(result.summary.MISSING_INTERNAL, 0);
});

test("forensic timeline preserves the origin and epistemic level of each clock", async () => {
  const tx = (await fixture("ethereum")).transactions()[0];
  const timeline = buildForensicTimeline({ ledger: [{ id: "L1", timestamp: "2026-01-15T11:59:00Z" }], blockchain: [tx] });
  assert.deepEqual(timeline.events.map((event) => event.source), ["ledger", "blockchain"]);
  assert.equal(timeline.events[1].epistemic_level, "observed-fact");
});

test("evidence report clearly separates verified facts from hypotheses", async () => {
  const transactions = (await fixture()).transactions();
  const report = createEvidenceReport({ title: "Demo", transactions, hypotheses: ["Control común not proven"] });
  assert.equal(report.verified_facts.length, 3);
  assert.equal(report.hypotheses[0].verified, false);
  assert.equal(report.safety.read_only, true);
  assert.match(reportToMarkdown(report), /HIPÓTESIS, NO EVIDENCIA/);
});

test("RPC providers reject remote defaults and embedded credentials", () => {
  assert.throws(() => new EvmForensicsProvider({ chain: "polygon", endpoint: "https://rpc.example.test" }), /Remote RPC/);
  assert.throws(() => new BitcoinForensicsProvider({ endpoint: "http://user:password@127.0.0.1:32" }), /Credentials/);
});

test("AI-labelled input is rejected before it can become blockchain evidence", () => {
  assert.throws(() => normalizeBlockchainTransaction({
    chain: "ethereum", network: "mainnet", tx_hash: "e".repeat(64), timestamp: "2026-01-01T00:00:00Z",
    from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", amount: "1", fee: "1"
  }, { kind: "ai-generated", id: "model" }), { code: "AI_EVIDENCE_REJECTED" });
});

test("CLI completes transaction, reconciliation, graph and report workflows", () => {
  const runs = [
    ["blockchain", "tx", "a".repeat(64), "--chain", "ethereum"],
    ["reconcile", ledgerPath],
    ["graph", "0x1111111111111111111111111111111111111111", "--chain", "ethereum", "--format", "graphml"],
    ["report", fixturePath, "--format", "markdown"]
  ];
  for (const args of runs) {
    const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, "src", "cli.js"), ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.length > 50);
  }
});
