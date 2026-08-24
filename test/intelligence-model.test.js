import test from "node:test";
import assert from "node:assert/strict";
import {
  addressKey,
  formatAmount,
  isValidAddress,
  makeEvidence,
  makeWalletCluster,
  normalizeAddress,
  normalizeAmount,
  normalizeTransaction,
  transactionKey,
  verifyEvidence
} from "../src/domain/intelligence/model.js";

// Vectores públicos conocidos. Si la validación de checksum se rompe, estas
// direcciones dejan de aceptarse y la prueba lo detecta.
const VALID_BITCOIN = [
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
  "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"
];

test("accepts valid Bitcoin addresses across base58check, bech32 and bech32m", () => {
  for (const address of VALID_BITCOIN) {
    assert.equal(isValidAddress("bitcoin", address), true, address);
  }
});

test("rejects Bitcoin addresses with a broken checksum", () => {
  // Un solo carácter cambiado invalida el checksum en las tres codificaciones.
  assert.equal(isValidAddress("bitcoin", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"), false);
  assert.equal(isValidAddress("bitcoin", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"), false);
  assert.equal(isValidAddress("bitcoin", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLz"), false);
});

test("normalizes EVM addresses to lowercase but keeps the received form", () => {
  const mixed = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  const normalized = normalizeAddress("ethereum", mixed);
  assert.equal(normalized.address, mixed.toLowerCase());
  assert.equal(normalized.displayAddress, mixed);
  assert.equal(addressKey("ethereum", mixed), addressKey("ethereum", mixed.toLowerCase()));
});

test("rejects malformed addresses and unsupported networks", () => {
  assert.equal(isValidAddress("ethereum", "0x123"), false);
  assert.equal(isValidAddress("ethereum", ""), false);
  assert.throws(() => normalizeAddress("dogecoin", "0x" + "11".repeat(20)), /Unsupported network/);
});

test("amounts stay exact integers and never become floating point", () => {
  const huge = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  assert.equal(normalizeAmount(huge), huge);
  assert.equal(formatAmount("123456789", 8), "1.23456789");
  assert.equal(formatAmount("1000000000000000000", 18), "1");
  assert.throws(() => normalizeAmount("1.5"), /integer string/);
  assert.throws(() => normalizeAmount("-1"), /integer string/);
});

test("transaction keys are canonical regardless of 0x prefix or case", () => {
  const bare = "AB".repeat(32);
  assert.equal(transactionKey("ethereum", "0x" + bare), transactionKey("ethereum", bare.toLowerCase()));
});

test("derives UTXO transfers from inputs and outputs and marks them as derived", () => {
  const transaction = normalizeTransaction(
    {
      network: "bitcoin",
      txid: "0x" + "ab".repeat(32),
      timestamp: "2026-08-01T00:00:00.000Z",
      inputs: [{ address: VALID_BITCOIN[0], amountRaw: "100000000" }],
      outputs: [
        { address: VALID_BITCOIN[1], amountRaw: "20000000" },
        { address: VALID_BITCOIN[0], amountRaw: "79000000" }
      ]
    },
    { kind: "local-dataset", id: "test" }
  );
  assert.equal(transaction.transfers.length, 2);
  assert.equal(transaction.transfers[0].from, VALID_BITCOIN[0]);
  assert.equal(transaction.transfers[0].kind, "utxo-derived");
  assert.equal(transaction.epistemicLevel, "observed-fact");
  assert.equal(transaction.source.kind, "local-dataset");
});

test("evidence is hashed on creation and detects tampering", () => {
  const evidence = makeEvidence({
    kind: "transaction",
    description: "captura de una transferencia",
    payload: { txid: "0x" + "cd".repeat(32), amountRaw: "1000" },
    source: { kind: "own-node", id: "node-1" }
  });
  assert.equal(verifyEvidence(evidence).valid, true);
  assert.equal(evidence.immutable, true);
  const tampered = { ...evidence, payload: { ...evidence.payload, amountRaw: "999999" } };
  assert.equal(verifyEvidence(tampered).valid, false);
});

test("wallet clusters are always hypotheses, never verified identities", () => {
  const cluster = makeWalletCluster({
    network: "bitcoin",
    members: [VALID_BITCOIN[1], VALID_BITCOIN[0]],
    heuristic: "common-input-ownership",
    confidence: "medium"
  });
  assert.equal(cluster.epistemicLevel, "hypothesis");
  assert.match(cluster.caveat, /no identidad/i);
  // Orden estable: el mismo conjunto produce siempre el mismo identificador.
  const twin = makeWalletCluster({
    network: "bitcoin",
    members: [VALID_BITCOIN[0], VALID_BITCOIN[1]],
    heuristic: "common-input-ownership"
  });
  assert.equal(cluster.id, twin.id);
});
