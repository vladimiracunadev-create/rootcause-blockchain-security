import crypto from "node:crypto";
import { buildForensicTimeline } from "./timeline.js";
import { verifyTransactionEvidence } from "./model.js";

export function createEvidenceReport(investigation) {
  const transactions = investigation.transactions || [];
  for (const transaction of transactions) {
    if (transaction.epistemic_level !== "observed-fact" || !verifyTransactionEvidence(transaction).valid) {
      const error = new Error("Reports accept only normalized blockchain evidence with a valid evidence_hash.");
      error.code = "UNVERIFIED_EVIDENCE_REJECTED";
      error.statusCode = 400;
      throw error;
    }
  }
  const reconciliation = investigation.reconciliation || null;
  const timeline = investigation.timeline || buildForensicTimeline({ blockchain: transactions });
  const report = {
    schema_version: 1,
    title: String(investigation.title || "Investigación blockchain").replace(/[\r\n#]/g, " ").trim(),
    generated_at: new Date().toISOString(),
    scope: investigation.scope || "Conjunto de transacciones aportado",
    verified_facts: transactions.map((tx) => ({
      statement: `${tx.chain}:${tx.tx_hash} transfirió ${tx.amount} unidades mínimas de ${tx.asset} desde ${tx.from || "coinbase/unknown"} hacia ${tx.to || "contract-creation/unknown"}.`,
      transaction: tx,
      epistemic_level: "observed-fact"
    })),
    hypotheses: (investigation.hypotheses || []).map((value) => ({ statement: String(value), epistemic_level: "hypothesis", verified: false })),
    reconciliation,
    timeline,
    evidence: transactions.map((tx) => ({ tx_hash: tx.tx_hash, chain: tx.chain, evidence_hash: tx.evidence_hash, source: tx.provenance?.source || null })),
    verification_scope: transactions.map((tx) => ({
      tx_hash: tx.tx_hash,
      status: tx.provenance.source.kind === "own-node" ? "directly-observed" : tx.provenance.source.kind === "local-dataset" ? "reproducible-fixture" : "requires-independent-corroboration"
    })),
    limitations: [
      "Una dirección blockchain no identifica automáticamente a una persona o entidad.",
      "La conectividad entre direcciones no demuestra control común ni intención.",
      "Los registros internos y de exchanges requieren validación independiente de su origen.",
      "La IA puede ayudar a redactar hipótesis, pero nunca se presenta como evidencia blockchain."
    ],
    safety: { read_only: true, requested_private_keys: false, signed_transactions: false, broadcast_transactions: false }
  };
  report.report_hash = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
  return report;
}

export function reportToMarkdown(report) {
  const lines = ["# " + report.title, "", `- Generado: ${report.generated_at}`, `- Hash SHA-256 del informe: \`${report.report_hash}\``, `- Alcance: ${report.scope}`, "- Modo: sólo lectura", "", "## Hechos comprobables", ""];
  if (!report.verified_facts.length) lines.push("No se aportaron transacciones on-chain verificables.", "");
  for (const fact of report.verified_facts) lines.push(`- ${fact.statement}`, `  - Evidencia: \`${fact.transaction.evidence_hash}\``, `  - Fuente: \`${fact.transaction.provenance.source.id}\``);
  lines.push("", "## Reconciliación", "");
  if (report.reconciliation) for (const [classification, count] of Object.entries(report.reconciliation.summary)) lines.push(`- ${classification}: ${count}`);
  else lines.push("No se aportó ledger interno.");
  lines.push("", "## Hipótesis no comprobadas", "");
  if (report.hypotheses.length) report.hypotheses.forEach((item) => lines.push(`- ${item.statement} — **HIPÓTESIS, NO EVIDENCIA**`));
  else lines.push("No se registraron hipótesis.");
  lines.push("", "## Timeline", "");
  for (const item of report.timeline.events) lines.push(`- ${item.timestamp} · ${item.source} · ${item.description}`);
  lines.push("", "## Limitaciones", "", ...report.limitations.map((item) => "- " + item), "");
  return lines.join("\n");
}
