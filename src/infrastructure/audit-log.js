// Cadena de auditoría: qué pasó, en qué orden y sin poder reescribirlo.
//
// Cada entrada guarda el hash de la anterior, y su propio hash se calcula sobre
// la entrada completa incluido ese enlace. Modificar o eliminar una entrada
// intermedia invalida esa y todas las posteriores.
//
// `canonicalize` ordena las claves antes de hashear porque JSON.stringify
// conserva el orden de inserción: sin ese paso, el mismo contenido escrito en
// otro orden produciría otro hash y la verificación fallaría sin que nadie
// hubiera manipulado nada. Cambiar esta función o el algoritmo invalida todas
// las cadenas ya escritas.
//
// Lo que esto garantiza y lo que no: detecta manipulación accidental o poco
// sofisticada. NO detecta el truncado del final de la cadena, ni impide que
// alguien con acceso de escritura al archivo y a la clave la reconstruya entera.
// El modelo de amenazas lo declara así explícitamente.
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
