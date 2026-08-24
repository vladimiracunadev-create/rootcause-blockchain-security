import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_UINT256,
  evaluateWalletPosture,
  latestAllowances,
  walletPostureSummary
} from "../src/domain/wallet-rules.js";
import { createDemoState } from "../src/services/demo-state.js";

const WALLET = "0x" + "aa".repeat(20);
const TOKEN = "0x" + "10".repeat(20);
const SPENDER_OK = "0x" + "20".repeat(20);
const SPENDER_BAD = "0x" + "30".repeat(20);
const COUNTERPARTY = "0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c001";
const LOOKALIKE = "0xc0c0c0ffee00000000000000000000000000c001";

const policies = {
  wallet: {
    maximumAllowanceAgeDays: 90,
    maximumOperatorAgeDays: 90,
    dormancyDays: 30,
    allowedChainIds: ["1"],
    authorizedSpenders: [],
    authorizedOperators: [],
    knownCounterparties: [],
    defaultDustThresholdRaw: "0",
    assetPolicies: [
      {
        chainId: "1",
        tokenContract: TOKEN,
        decimals: 6,
        maximumAllowanceRaw: "1000000",
        maximumAgeDays: 60,
        dustThresholdRaw: "100"
      }
    ],
    poisoning: { minimumPrefixMatch: 4, minimumSuffixMatch: 4, minimumSignals: 2 }
  }
};

function account(overrides = {}) {
  return {
    id: "account-1",
    projectId: "project-1",
    chainId: "1",
    address: WALLET,
    accountType: "eoa",
    purpose: "test",
    criticality: "high",
    expectedActivity: { description: "", activeHours: null },
    allowedSpenders: [SPENDER_OK],
    knownCounterparties: [COUNTERPARTY],
    allowedTokenContracts: [TOKEN],
    approvalPolicies: [],
    dormancyPolicy: { dormantAfterDays: 0 },
    smartAccountPolicy: {
      expectedOwners: [],
      expectedGuardians: [],
      expectedModules: [],
      expectedThreshold: 0,
      expectedImplementation: null,
      expectedDelegate: null,
      allowedChainIds: ["1"]
    },
    tags: [],
    ...overrides
  };
}

function allowanceEvent(overrides = {}) {
  return {
    id: "event-" + Math.random().toString(36).slice(2),
    type: "wallet.allowance.changed",
    chainId: "1",
    blockNumber: 100,
    blockHash: "0x" + "11".repeat(32),
    transactionHash: "0x" + "22".repeat(32),
    logIndex: 0,
    walletAddress: WALLET,
    contractAddress: TOKEN,
    spender: SPENDER_OK,
    amountRaw: "500000",
    decimals: 6,
    source: "test",
    confidence: "observed",
    observedAt: new Date().toISOString(),
    ...overrides
  };
}

function run(accounts, events, approvals = []) {
  return evaluateWalletPosture(
    { watchedAccounts: accounts, walletEvents: events, approvals },
    { policies }
  );
}

function codes(findings) {
  return findings.map((finding) => finding.code);
}

// ── BLK-WALLET-001 · allowance ──────────────────────────────────────────────

test("BLK-WALLET-001 fires on max-uint256 allowance", () => {
  const findings = run([account()], [allowanceEvent({ amountRaw: MAX_UINT256.toString() })]);
  assert.ok(codes(findings).includes("BLK-WALLET-001"));
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-001");
  assert.equal(finding.confidence, "observed");
  assert.equal(finding.evidence.amountRaw, MAX_UINT256.toString());
  assert.ok(finding.evidence.transactionHash);
  assert.ok(finding.remediation.length >= 2);
});

test("BLK-WALLET-001 fires when allowance exceeds the per-asset policy limit", () => {
  const findings = run([account()], [allowanceEvent({ amountRaw: "2000000" })]);
  assert.ok(codes(findings).includes("BLK-WALLET-001"));
});

test("BLK-WALLET-001 stays quiet for an in-policy allowance", () => {
  const findings = run([account()], [allowanceEvent({ amountRaw: "500000" })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-001"));
});

test("BLK-WALLET-001 fires on an aged allowance still active", () => {
  const old = new Date(Date.now() - 70 * 86400000).toISOString();
  const findings = run([account()], [allowanceEvent({ amountRaw: "500000", observedAt: old })]);
  assert.ok(codes(findings).includes("BLK-WALLET-001"));
});

test("a zero-value revocation clears a previous unlimited allowance", () => {
  const findings = run(
    [account()],
    [
      allowanceEvent({ amountRaw: MAX_UINT256.toString(), blockNumber: 100 }),
      allowanceEvent({ amountRaw: "0", blockNumber: 101, transactionHash: "0x" + "33".repeat(32) })
    ]
  );
  assert.ok(!codes(findings).includes("BLK-WALLET-001"));
});

test("latestAllowances keeps only the newest event per wallet-token-spender", () => {
  const map = latestAllowances([
    allowanceEvent({ amountRaw: "1", blockNumber: 5 }),
    allowanceEvent({ amountRaw: "2", blockNumber: 9 })
  ]);
  assert.equal([...map.values()][0].amountRaw, "2");
});

// ── BLK-WALLET-002 · spender ────────────────────────────────────────────────

test("BLK-WALLET-002 fires for an unknown spender and never claims malice", () => {
  const findings = run([account()], [allowanceEvent({ spender: SPENDER_BAD })]);
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-002");
  assert.ok(finding);
  assert.equal(finding.title, "Spender no reconocido por la política local");
  // El incidente describe la desviación de política; nunca afirma malicia.
  assert.ok(!finding.title.includes("malicioso"));
  assert.ok(!finding.explanation.includes("malicioso"));
  assert.ok(!finding.rootCause.includes("malicioso"));
});

test("BLK-WALLET-002 stays quiet for an allowlisted spender", () => {
  const findings = run([account()], [allowanceEvent({ spender: SPENDER_OK })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-002"));
});

// ── BLK-WALLET-003 · operador NFT ───────────────────────────────────────────

function operatorEvent(overrides = {}) {
  return allowanceEvent({
    type: "wallet.operator.changed",
    operator: SPENDER_BAD,
    spender: "",
    amountRaw: null,
    approved: true,
    approvalScope: "all",
    tokenStandard: "erc-721",
    ...overrides
  });
}

test("BLK-WALLET-003 fires for a global operator outside policy", () => {
  const findings = run([account()], [operatorEvent()]);
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-003");
  assert.ok(finding);
  assert.equal(finding.evidence.approvalScope, "all");
});

test("BLK-WALLET-003 distinguishes single-token approvals from global ones", () => {
  const findings = run([account()], [operatorEvent({ approvalScope: "single" })]);
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-003");
  assert.ok(finding);
  assert.ok(!finding.title.includes("global"));
});

test("BLK-WALLET-003 stays quiet for an authorized operator", () => {
  const findings = run([account()], [operatorEvent({ operator: SPENDER_OK })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-003"));
});

test("an operator revocation produces no finding", () => {
  const findings = run([account()], [operatorEvent({ approved: false })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-003"));
});

// ── BLK-WALLET-004 · permit ─────────────────────────────────────────────────

test("BLK-WALLET-004 fires for a permit used by an unregistered contract", () => {
  const findings = run(
    [account()],
    [allowanceEvent({ type: "wallet.permit.used", spender: SPENDER_BAD, permitStandard: "eip-2612" })]
  );
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-004");
  assert.ok(finding);
  assert.ok(finding.limitations.join(" ").includes("off-chain"));
});

test("BLK-WALLET-004 stays quiet for an in-policy permit (off-chain signatures are unobservable)", () => {
  // Caso negativo y a la vez el límite estructural: un permit firmado pero no
  // usado no genera evento y por lo tanto no puede evaluarse.
  const findings = run(
    [account()],
    [allowanceEvent({ type: "wallet.permit.used", spender: SPENDER_OK, amountRaw: "500000" })]
  );
  assert.ok(!codes(findings).includes("BLK-WALLET-004"));
});

// ── BLK-WALLET-005 · address poisoning ──────────────────────────────────────

function transferEvent(overrides = {}) {
  return allowanceEvent({
    type: "wallet.transfer.observed",
    spender: "",
    direction: "in",
    sourceAddress: LOOKALIKE,
    destination: WALLET,
    amountRaw: "0",
    ...overrides
  });
}

test("BLK-WALLET-005 flags a realistic poisoning candidate as heuristic", () => {
  const findings = run([account()], [transferEvent()]);
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-005");
  assert.ok(finding);
  assert.equal(finding.confidence, "heuristic");
  assert.ok(finding.title.includes("candidato"));
  assert.equal(finding.evidence.resemblesKnownCounterparty, COUNTERPARTY);
});

test("BLK-WALLET-005 does not fire on similarity alone (normal-value transfer)", () => {
  const findings = run([account()], [transferEvent({ amountRaw: "900000" })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-005"));
});

test("BLK-WALLET-005 does not fire for a known counterparty", () => {
  const findings = run([account()], [transferEvent({ sourceAddress: COUNTERPARTY })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-005"));
});

// ── BLK-WALLET-006 · smart account ──────────────────────────────────────────

function smartAccountEvent(overrides = {}) {
  return allowanceEvent({
    type: "wallet.smart-account.changed",
    spender: "",
    amountRaw: null,
    changeKind: "owner-added",
    subject: SPENDER_BAD,
    approvalHash: "",
    ...overrides
  });
}

test("BLK-WALLET-006 fires on an unapproved owner change", () => {
  const findings = run([account({ accountType: "smart-account" })], [smartAccountEvent()]);
  assert.ok(codes(findings).includes("BLK-WALLET-006"));
});

test("BLK-WALLET-006 fires on module and guardian changes", () => {
  const findings = run(
    [account({ accountType: "smart-account" })],
    [
      smartAccountEvent({ changeKind: "module-enabled", transactionHash: "0x" + "44".repeat(32) }),
      smartAccountEvent({ changeKind: "guardian-changed", transactionHash: "0x" + "55".repeat(32) })
    ]
  );
  assert.equal(codes(findings).filter((code) => code === "BLK-WALLET-006").length, 2);
});

test("BLK-WALLET-006 stays quiet when the approval hash is registered", () => {
  const hash = "a".repeat(64);
  const findings = run(
    [account({ accountType: "smart-account" })],
    [smartAccountEvent({ approvalHash: hash })],
    [{ hash }]
  );
  assert.ok(!codes(findings).includes("BLK-WALLET-006"));
});

test("BLK-WALLET-006 stays quiet when the change matches the expected configuration", () => {
  const expected = account({
    accountType: "smart-account",
    smartAccountPolicy: {
      expectedOwners: [SPENDER_BAD],
      expectedGuardians: [],
      expectedModules: [],
      expectedThreshold: 0,
      expectedImplementation: null,
      expectedDelegate: null,
      allowedChainIds: ["1"]
    }
  });
  const findings = run([expected], [smartAccountEvent()]);
  assert.ok(!codes(findings).includes("BLK-WALLET-006"));
});

// ── BLK-WALLET-007 · delegación EIP-7702 ────────────────────────────────────

function delegationEvent(overrides = {}) {
  return allowanceEvent({
    type: "wallet.delegation.changed",
    spender: "",
    amountRaw: null,
    delegate: "0x" + "77".repeat(20),
    approvalHash: "",
    ...overrides
  });
}

test("BLK-WALLET-007 fires on an unregistered EIP-7702 delegation", () => {
  const findings = run([account()], [delegationEvent()]);
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-007");
  assert.ok(finding);
  assert.ok(finding.limitations.join(" ").includes("legítimo"));
});

test("BLK-WALLET-007 stays quiet when the delegate is the expected implementation", () => {
  const configured = account({
    smartAccountPolicy: {
      expectedOwners: [],
      expectedGuardians: [],
      expectedModules: [],
      expectedThreshold: 0,
      expectedImplementation: null,
      expectedDelegate: "0x" + "77".repeat(20),
      allowedChainIds: ["1"]
    }
  });
  const findings = run([configured], [delegationEvent()]);
  assert.ok(!codes(findings).includes("BLK-WALLET-007"));
});

test("BLK-WALLET-007 fires when the delegation happens on a disallowed chain", () => {
  const configured = account({
    smartAccountPolicy: {
      expectedOwners: [],
      expectedGuardians: [],
      expectedModules: [],
      expectedThreshold: 0,
      expectedImplementation: null,
      expectedDelegate: "0x" + "77".repeat(20),
      allowedChainIds: ["1"]
    }
  });
  const findings = run([configured], [delegationEvent({ chainId: "999" })]);
  assert.ok(codes(findings).includes("BLK-WALLET-007"));
});

// ── BLK-WALLET-008 · actividad ──────────────────────────────────────────────

function activityEvent(overrides = {}) {
  return allowanceEvent({
    type: "wallet.activity.observed",
    spender: "",
    amountRaw: null,
    counterparty: COUNTERPARTY,
    kind: "transfer",
    ...overrides
  });
}

test("BLK-WALLET-008 fires when a dormant critical wallet reactivates", () => {
  const dormant = account({
    criticality: "critical",
    dormancyPolicy: { dormantAfterDays: 30 }
  });
  const findings = run(
    [dormant],
    [
      activityEvent({ observedAt: new Date(Date.now() - 60 * 86400000).toISOString(), transactionHash: "0x" + "66".repeat(32) }),
      activityEvent({ observedAt: new Date().toISOString(), transactionHash: "0x" + "88".repeat(32) })
    ]
  );
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-008");
  assert.ok(finding);
  assert.ok(finding.title.includes("reactivada"));
});

test("BLK-WALLET-008 stays quiet for regular activity within the dormancy window", () => {
  const dormant = account({ criticality: "critical", dormancyPolicy: { dormantAfterDays: 30 } });
  const findings = run(
    [dormant],
    [
      activityEvent({ observedAt: new Date(Date.now() - 5 * 86400000).toISOString(), transactionHash: "0x" + "66".repeat(32) }),
      activityEvent({ observedAt: new Date().toISOString(), transactionHash: "0x" + "88".repeat(32) })
    ]
  );
  assert.ok(!codes(findings).some((code) => code === "BLK-WALLET-008"));
});

test("BLK-WALLET-008 fires for activity on a disallowed chain", () => {
  const findings = run([account()], [activityEvent({ chainId: "999" })]);
  const finding = findings.find((entry) => entry.code === "BLK-WALLET-008");
  assert.ok(finding);
  assert.ok(finding.title.includes("red no autorizada"));
});

test("BLK-WALLET-008 flags an unknown counterparty and accepts a known one", () => {
  const unknown = run([account()], [activityEvent({ counterparty: SPENDER_BAD })]);
  assert.ok(codes(unknown).includes("BLK-WALLET-008"));
  const known = run([account()], [activityEvent({ counterparty: COUNTERPARTY })]);
  assert.ok(!codes(known).includes("BLK-WALLET-008"));
});

test("BLK-WALLET-008 flags activity outside the declared operating window", () => {
  const windowed = account({
    expectedActivity: { description: "", activeHours: { startHour: 9, endHour: 17 } }
  });
  const at3amUtc = new Date();
  at3amUtc.setUTCHours(3, 0, 0, 0);
  const findings = run([windowed], [activityEvent({ observedAt: at3amUtc.toISOString() })]);
  assert.ok(
    findings.some(
      (entry) => entry.code === "BLK-WALLET-008" && entry.title.includes("ventana")
    )
  );
});

// ── Sincronización, demo y resumen ─────────────────────────────────────────

test("demo state produces every wallet rule exactly once and a healthy account", () => {
  const state = createDemoState();
  const findings = evaluateWalletPosture(state, {
    policies: { wallet: { ...policies.wallet, assetPolicies: [], allowedChainIds: ["1", "11155111"] } }
  });
  const produced = codes(findings);
  for (let index = 1; index <= 8; index += 1) {
    const code = "BLK-WALLET-00" + index;
    assert.equal(produced.filter((entry) => entry === code).length, 1, code);
  }
  const healthy = state.watchedAccounts.find((entry) => entry.id === "account-northstar-watch");
  assert.ok(healthy);
  assert.ok(!findings.some((entry) => entry.entityId === healthy.address));
});

test("walletPostureSummary counts allowances, operators and incidents", () => {
  const state = createDemoState();
  state.incidents = evaluateWalletPosture(state, { policies }).map((finding) => ({
    ...finding,
    status: "open"
  }));
  const summary = walletPostureSummary(state);
  assert.ok(summary.accounts >= 5);
  assert.ok(summary.activeAllowances >= 2);
  assert.equal(summary.unlimitedAllowances, 1);
  assert.ok(summary.openIncidents >= 8);
  assert.equal(summary.poisoningCandidates, 1);
});

test("incomplete evidence (invalid amountRaw) never produces an allowance finding", () => {
  const findings = run([account()], [allowanceEvent({ amountRaw: "not-a-number" })]);
  assert.ok(!codes(findings).includes("BLK-WALLET-001"));
});

test("wallet findings keep stable identities across evaluations", () => {
  const events = [allowanceEvent({ amountRaw: MAX_UINT256.toString() })];
  const first = run([account()], events);
  const second = run([account()], events);
  assert.deepEqual(first.map((entry) => entry.id), second.map((entry) => entry.id));
});
