// Contrato público de RootCause Blockchain Forensics.
//
// Los valores monetarios son enteros decimales en la unidad mínima del activo.
// Cada campo conserva una referencia de procedencia; una observación on-chain
// nunca se mezcla con contenido generado por IA.
import crypto from "node:crypto";
import { networkFor, normalizeAddress, normalizeAmount } from "../domain/intelligence/model.js";

export const TRANSACTION_FIELDS = Object.freeze([
  "chain", "network", "tx_hash", "block", "timestamp", "from", "to",
  "asset", "amount", "fee", "status", "input_data", "contract", "confirmations"
]);

function forensicError(message, code = "FORENSIC_INPUT_REJECTED") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function hash(value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(raw)) throw forensicError("tx_hash must be a 32-byte hash.", "HASH_INVALID");
  return raw;
}

function instant(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw forensicError("timestamp must be a valid instant.", "TIMESTAMP_INVALID");
  return date.toISOString();
}

function nullableAddress(chain, value) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeAddress(chain, value).address;
}

function sourceDocument(source = {}) {
  const kind = String(source.kind || "unknown").slice(0, 40);
  if (/^(?:ai|llm)(?:-|$)/i.test(kind)) throw forensicError("AI-generated data cannot be registered as blockchain evidence.", "AI_EVIDENCE_REJECTED");
  const id = String(source.id || "unspecified").slice(0, 160);
  const retrievedAt = new Date(source.retrievedAt || Date.now()).toISOString();
  return Object.freeze({
    kind,
    id,
    endpoint: source.endpoint ? String(source.endpoint).slice(0, 240) : null,
    retrievedAt,
    evidenceHash: source.evidenceHash ? String(source.evidenceHash) : null
  });
}

export function normalizeBlockchainTransaction(input, source = {}) {
  const chain = networkFor(input.chain || input.network).id;
  const network = String(input.networkName || input.network || chain).toLowerCase().slice(0, 60);
  const txHash = hash(input.tx_hash ?? input.txHash ?? input.txid ?? input.hash);
  const normalizedSource = sourceDocument(input.provenance?.source || source);
  const transaction = {
    chain,
    network,
    tx_hash: txHash,
    block: Number.isSafeInteger(Number(input.block ?? input.blockHeight)) ? Number(input.block ?? input.blockHeight) : null,
    timestamp: instant(input.timestamp),
    from: nullableAddress(chain, input.from),
    to: nullableAddress(chain, input.to),
    asset: String(input.asset || networkFor(chain).nativeAsset).slice(0, 80),
    amount: normalizeAmount(input.amount ?? input.amountRaw ?? "0", "amount"),
    fee: normalizeAmount(input.fee ?? input.feeRaw ?? "0", "fee"),
    status: ["confirmed", "pending", "failed", "orphaned", "unknown"].includes(input.status)
      ? input.status
      : "unknown",
    input_data: String(input.input_data ?? input.inputData ?? input.method ?? "").slice(0, 131072),
    contract: nullableAddress(chain, input.contract ?? input.contractAddress),
    confirmations: Math.max(0, Number.parseInt(input.confirmations ?? 0, 10) || 0),
    provenance: {
      source: normalizedSource,
      fields: Object.fromEntries(TRANSACTION_FIELDS.map((field) => [field, normalizedSource.id]))
    },
    epistemic_level: "observed-fact"
  };
  transaction.evidence_hash = crypto.createHash("sha256").update(JSON.stringify(transaction)).digest("hex");
  return Object.freeze(transaction);
}

export function fromIntelligenceTransaction(input) {
  const transfer = (input.transfers || []).find((entry) => entry.from || entry.to) || {};
  return normalizeBlockchainTransaction(
    {
      chain: input.network,
      network: input.network,
      tx_hash: input.txid,
      block: input.blockHeight,
      timestamp: input.timestamp,
      from: transfer.from,
      to: transfer.to,
      asset: transfer.asset,
      amount: transfer.amountRaw,
      fee: input.feeRaw,
      status: input.orphaned ? "orphaned" : input.blockHeight === null ? "pending" : "confirmed",
      input_data: input.method,
      contract: input.contractAddress,
      confirmations: input.confirmations || 0
    },
    input.source
  );
}

export function verifyTransactionEvidence(transaction) {
  const clone = { ...transaction };
  delete clone.evidence_hash;
  const actual = crypto.createHash("sha256").update(JSON.stringify(clone)).digest("hex");
  return { valid: actual === transaction.evidence_hash, expected: transaction.evidence_hash, actual };
}
