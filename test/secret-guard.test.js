import test from "node:test";
import assert from "node:assert/strict";
import { assertNoSecretMaterial, redactForAudit } from "../src/domain/secret-guard.js";

test("rejects forbidden secret fields at any depth", () => {
  assert.throws(
    () => assertNoSecretMaterial({ project: { deployer: { privateKey: "never" } } }),
    /Forbidden secret field/
  );
  assert.throws(
    () => assertNoSecretMaterial({ connector: { accessToken: "never" } }),
    /Forbidden secret field/
  );
});

test("accepts public blockchain evidence", () => {
  assert.doesNotThrow(() =>
    assertNoSecretMaterial({
      address: "0x1111111111111111111111111111111111111111",
      transactionHash: "0x" + "a".repeat(64),
      bytecodeHash: "0x" + "b".repeat(64),
      signature: "public-event-signature"
    })
  );
});

test("redacts forbidden audit fields", () => {
  const result = redactForAudit({ metadata: { apiKey: "never-log-this", address: "0x123" } });
  assert.equal(result.metadata.apiKey, "[REDACTED]");
  assert.equal(result.metadata.address, "0x123");
});
