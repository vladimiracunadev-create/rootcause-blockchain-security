#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureProvider, ProviderRegistry } from "./forensics/providers.js";
import { analyzeAddress, buildTransactionGraph } from "./forensics/analysis.js";
import { parseCsv, reconcileLedger } from "./forensics/reconciliation.js";
import { buildForensicTimeline } from "./forensics/timeline.js";
import { createEvidenceReport, reportToMarkdown } from "./forensics/report.js";
import { graphToGraphMl, toCsv } from "./forensics/formats.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EVIDENCE = path.join(ROOT, "examples", "forensics", "investigation.json");

function parseArguments(values) {
  const positional = [], options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) positional.push(value);
    else {
      const [name, inline] = value.slice(2).split("=", 2);
      options[name] = inline ?? (values[index + 1] && !values[index + 1].startsWith("--") ? values[++index] : true);
    }
  }
  return { positional, options };
}

function usage() {
  return `RootCause Blockchain Forensics (read only)

rootcause blockchain tx <hash> --chain <bitcoin|ethereum|polygon> [--evidence file]
rootcause blockchain address <address> --chain <chain> [--evidence file]
rootcause reconcile <internal-ledger.csv> [--evidence file] [--format json|csv]
rootcause graph <address> --chain <chain> [--depth 2] [--format json|graphml]
rootcause report <investigation.json> [--format markdown|json]
rootcause lab <1-8>

Opciones comunes: --output <file>. La CLI nunca pide claves, firma ni transmite.`;
}

async function fixture(filePath, chain) {
  const registry = new ProviderRegistry();
  const provider = await FixtureProvider.fromFile(path.resolve(filePath || DEFAULT_EVIDENCE), chain);
  registry.register(provider);
  return registry.get(provider.id);
}

function render(value, format, kind) {
  if (format === "csv") return toCsv(value.results || value.transactions || value);
  if (format === "graphml") return graphToGraphMl(value);
  if (format === "markdown") return reportToMarkdown(value);
  if (format !== "json") throw new Error("Unsupported format: " + format);
  return JSON.stringify(value, null, 2) + "\n";
}

async function execute(argv) {
  const { positional, options } = parseArguments(argv);
  const [command, subject, identifier] = positional;
  if (!command || command === "help" || options.help) return { output: usage() + "\n" };
  if (command === "blockchain" && subject === "tx") {
    const chain = String(options.chain || "ethereum");
    const provider = await fixture(options.evidence, chain);
    const transaction = await provider.getTransaction(identifier);
    if (!transaction) throw new Error("Transaction not found in evidence fixture.");
    return { output: render(transaction, options.format || "json") };
  }
  if (command === "blockchain" && subject === "address") {
    const chain = String(options.chain || "ethereum");
    const provider = await fixture(options.evidence, chain);
    const transactions = await provider.getAddressTransactions(identifier);
    const analysis = analyzeAddress(chain, identifier, transactions, await provider.getBalance(identifier));
    return { output: render(analysis, options.format || "json") };
  }
  if (command === "reconcile") {
    const ledgerPath = subject;
    if (!ledgerPath) throw new Error("A ledger CSV path is required.");
    const evidence = await fixture(options.evidence, null);
    const ledger = parseCsv(await fs.readFile(path.resolve(ledgerPath), "utf8"));
    const result = reconcileLedger(ledger, evidence.transactions(), { timestampToleranceSeconds: Number(options.tolerance || 300) });
    return { output: render(result, options.format || "json") };
  }
  if (command === "graph") {
    const chain = String(options.chain || "ethereum");
    const evidence = await fixture(options.evidence, chain);
    const graph = buildTransactionGraph(evidence.transactions(), { chain, address: subject, depth: Number(options.depth || 2), maxNodes: Number(options["max-nodes"] || 100), maxEdges: Number(options["max-edges"] || 200) });
    return { output: render(graph, options.format || "json") };
  }
  if (command === "report") {
    const document = JSON.parse(await fs.readFile(path.resolve(subject || DEFAULT_EVIDENCE), "utf8"));
    const evidence = new FixtureProvider({ chain: null, document });
    const transactions = evidence.transactions();
    const reconciliation = document.ledger ? reconcileLedger(document.ledger, transactions, document.reconciliationOptions) : null;
    const timeline = buildForensicTimeline({ ledger: document.ledger || [], application: document.applicationEvents || [], exchange: document.exchangeEvents || [], blockchain: transactions });
    const report = createEvidenceReport({ ...document, transactions, reconciliation, timeline });
    return { output: render(report, options.format || "markdown") };
  }
  if (command === "lab") {
    const number = Number(subject);
    if (!Number.isInteger(number) || number < 1 || number > 8) throw new Error("Lab must be a number from 1 to 8.");
    return { output: `Lab ${number}: docs/labs/LAB-${String(number).padStart(2, "0")}.md\nEvidence: examples/forensics/investigation.json\n` };
  }
  throw new Error("Unknown command.\n\n" + usage());
}

export async function runCli(argv = process.argv.slice(2)) {
  const { positional, options } = parseArguments(argv);
  const result = await execute(argv);
  if (options.output) await fs.writeFile(path.resolve(String(options.output)), result.output, "utf8");
  else process.stdout.write(result.output);
  return { ...result, command: positional[0] || "help" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => { process.stderr.write(`ERROR [${error.code || "CLI_FAILED"}]: ${error.message}\n`); process.exitCode = 1; });
}
