import crypto from "node:crypto";
import { redactForAudit } from "../domain/secret-guard.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function appendAuditEntry(audit, input) {
  const previousHash = audit.at(-1)?.hash || "GENESIS";
  const entryWithoutHash = {
    id: crypto.randomUUID(),
    occurredAt: input.occurredAt || new Date().toISOString(),
    actor: input.actor || "system",
    action: input.action,
    entityType: input.entityType || "system",
    entityId: input.entityId || "rootcause-blockchain-security",
    metadata: redactForAudit(input.metadata || {}),
    previousHash
  };
  return [...audit, { ...entryWithoutHash, hash: digest(entryWithoutHash) }];
}

export function verifyAuditChain(audit) {
  let previousHash = "GENESIS";
  for (const entry of audit) {
    const { hash, ...entryWithoutHash } = entry;
    if (entryWithoutHash.previousHash !== previousHash) {
      return { valid: false, brokenAt: entry.id, reason: "previous_hash_mismatch" };
    }
    if (digest(entryWithoutHash) !== hash) {
      return { valid: false, brokenAt: entry.id, reason: "entry_hash_mismatch" };
    }
    previousHash = hash;
  }
  return { valid: true, entries: audit.length, head: previousHash };
}
