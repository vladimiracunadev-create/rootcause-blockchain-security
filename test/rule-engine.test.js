import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEvent, evaluateNode, evaluateState } from "../src/domain/rule-engine.js";
import { createDemoState } from "../src/services/demo-state.js";

const policies = {
  minimumUpgradeDelaySeconds: 86400,
  minimumGovernanceTimelockSeconds: 172800,
  maximumObserverLagBlocks: 8,
  abnormalOutflowUsd: 250000,
  minimumOracleProviders: 2,
  minimumBridgeIndependentOperators: 3,
  minimumBridgeThresholdRatio: 0.6667
};

test("finds contract, oracle, bridge, governance and supply-chain root causes", () => {
  const findings = evaluateState(createDemoState(), { policies });
  const codes = new Set(findings.map((finding) => finding.code));
  for (const code of [
    "BLK-CONTRACT-001",
    "BLK-ACCESS-001",
    "BLK-UPGRADE-001",
    "BLK-ORACLE-001",
    "BLK-ORACLE-002",
    "BLK-BRIDGE-001",
    "BLK-GOV-001",
    "BLK-SUPPLY-001",
    "BLK-EVENT-001",
    "BLK-FUNDS-001",
    "BLK-NODE-003"
  ]) {
    assert.equal(codes.has(code), true, "expected " + code);
  }
});

test("does not flag a privileged change with a registered approval hash", () => {
  const hash = "a".repeat(64);
  const event = {
    id: "event-1",
    type: "privileged_role_change",
    projectId: "project-1",
    approvalHash: hash
  };
  assert.deepEqual(evaluateEvent(event, [{ hash }], policies), []);
});

test("flags wrong chain and observer lag independently", () => {
  const findings = evaluateNode(
    {
      id: "rpc-1",
      connected: true,
      chainId: "10",
      expectedChainId: "1",
      blockNumber: 100,
      latestObservedBlockNumber: 120,
      endpoint: "http://127.0.0.1:8545"
    },
    policies
  );
  assert.deepEqual(
    new Set(findings.map((finding) => finding.code)),
    new Set(["BLK-NODE-002", "BLK-NODE-003"])
  );
});

test("flags an unavailable observer", () => {
  const findings = evaluateNode({ id: "rpc-1", connected: false, error: "offline" }, policies);
  assert.equal(findings[0].code, "BLK-NODE-001");
});
