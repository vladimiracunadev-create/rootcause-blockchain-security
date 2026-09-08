export const RECONCILIATION_CLASSES = Object.freeze([
  "MATCH", "MISSING_ONCHAIN", "MISSING_INTERNAL", "AMOUNT_MISMATCH",
  "TIMESTAMP_MISMATCH", "ADDRESS_MISMATCH", "DUPLICATE", "UNKNOWN"
]);

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((value) => value.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function canonicalHash(value) { return String(value || "").trim().toLowerCase().replace(/^0x/, ""); }
function canonicalAddress(value) { return String(value || "").trim().toLowerCase(); }
function timestampDifference(a, b) { return Math.abs(new Date(a).getTime() - new Date(b).getTime()); }

export function reconcileLedger(ledger, onchainTransactions, { timestampToleranceSeconds = 300 } = {}) {
  const onchainByHash = new Map(onchainTransactions.map((tx) => [canonicalHash(tx.tx_hash), tx]));
  const counts = new Map();
  for (const entry of ledger) {
    const key = canonicalHash(entry.tx_hash || entry.txHash || entry.transaction_hash);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const seen = new Set();
  const results = ledger.map((entry, index) => {
    const key = canonicalHash(entry.tx_hash || entry.txHash || entry.transaction_hash);
    const tx = onchainByHash.get(key);
    if (tx) seen.add(key);
    let classification = "UNKNOWN", differences = [];
    if (!key || !/^[0-9a-f]{64}$/.test(key)) classification = "UNKNOWN";
    else if (counts.get(key) > 1) classification = "DUPLICATE";
    else if (!tx) classification = "MISSING_ONCHAIN";
    else {
      const from = entry.from || entry.from_address;
      const to = entry.to || entry.to_address;
      if ((from && canonicalAddress(from) !== canonicalAddress(tx.from)) || (to && canonicalAddress(to) !== canonicalAddress(tx.to))) {
        classification = "ADDRESS_MISMATCH"; differences.push("address");
      } else if (String(entry.amount ?? entry.amount_raw ?? "") !== String(tx.amount)) {
        classification = "AMOUNT_MISMATCH"; differences.push("amount");
      } else if (entry.timestamp && timestampDifference(entry.timestamp, tx.timestamp) > timestampToleranceSeconds * 1000) {
        classification = "TIMESTAMP_MISMATCH"; differences.push("timestamp");
      } else classification = "MATCH";
    }
    return { ledger_row: index + 2, internal_id: entry.internal_id || entry.id || null, tx_hash: key || null, classification, differences, internal: entry, onchain: tx || null };
  });
  for (const tx of onchainTransactions) {
    if (!seen.has(tx.tx_hash)) results.push({ ledger_row: null, internal_id: null, tx_hash: tx.tx_hash, classification: "MISSING_INTERNAL", differences: [], internal: null, onchain: tx });
  }
  const summary = Object.fromEntries(RECONCILIATION_CLASSES.map((classification) => [classification, results.filter((row) => row.classification === classification).length]));
  return { generated_at: new Date().toISOString(), timestamp_tolerance_seconds: timestampToleranceSeconds, summary, results, epistemic_level: "inference" };
}
