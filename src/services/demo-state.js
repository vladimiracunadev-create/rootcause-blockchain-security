function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function createEmptyState() {
  return {
    schemaVersion: 1,
    projects: [],
    observedEvents: [],
    approvals: [],
    incidents: [],
    audit: [],
    node: {
      id: "evm-primary",
      family: "evm",
      endpoint: "http://127.0.0.1:8545/",
      connected: false,
      expectedChainId: "1",
      error: "El observador todavía no se ha consultado.",
      checkedAt: null
    },
    updatedAt: new Date().toISOString()
  };
}

export function createDemoState() {
  return {
    schemaVersion: 1,
    projects: [
      {
        id: "project-atlas-treasury",
        name: "Atlas Treasury",
        chain: { family: "evm", network: "mainnet", chainId: "1" },
        environment: "production",
        criticality: "critical",
        status: "active",
        contracts: [
          {
            id: "contract-atlas-vault",
            name: "AtlasVault",
            address: "0x1111111111111111111111111111111111111111",
            kind: "vault",
            verifiedSource: true,
            bytecodeHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            upgradeable: true,
            upgradeDelaySeconds: 172800,
            admin: { type: "multisig", owners: 5, threshold: 3 }
          },
          {
            id: "contract-atlas-emergency",
            name: "EmergencyModule",
            address: "0x2222222222222222222222222222222222222222",
            kind: "controller",
            verifiedSource: false,
            bytecodeHash: null,
            upgradeable: true,
            upgradeDelaySeconds: 0,
            admin: { type: "eoa", owners: 1, threshold: 1 }
          }
        ],
        oracles: [
          {
            id: "oracle-atlas-usd",
            name: "ATLAS/USD",
            providerCount: 1,
            heartbeatSeconds: 3600,
            lastUpdateAt: hoursAgo(6),
            fallbackAvailable: false
          }
        ],
        bridges: [
          {
            id: "bridge-meridian",
            name: "Meridian Router",
            validationModel: "multisig",
            signerCount: 5,
            threshold: 3,
            independentOperators: 2,
            pauseAvailable: true
          }
        ],
        dependencies: [
          {
            name: "openzeppelin-contracts",
            version: "5.1.0",
            pinned: true,
            provenanceVerified: true
          },
          {
            name: "deployment-plugin",
            version: "*",
            pinned: false,
            provenanceVerified: false
          }
        ],
        governance: { model: "token", timelockSeconds: 3600 },
        tags: ["treasury", "demo"]
      },
      {
        id: "project-northstar",
        name: "Northstar Payments",
        chain: { family: "evm", network: "testnet", chainId: "11155111" },
        environment: "staging",
        criticality: "medium",
        status: "active",
        contracts: [
          {
            id: "contract-northstar-router",
            name: "PaymentRouter",
            address: "0x3333333333333333333333333333333333333333",
            kind: "router",
            verifiedSource: true,
            bytecodeHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            upgradeable: false,
            upgradeDelaySeconds: 0,
            admin: { type: "none", owners: 0, threshold: 0 }
          }
        ],
        oracles: [],
        bridges: [],
        dependencies: [
          {
            name: "solady",
            version: "0.1.10",
            pinned: true,
            provenanceVerified: true
          }
        ],
        governance: { model: "none", timelockSeconds: 0 },
        tags: ["payments", "demo"]
      }
    ],
    observedEvents: [
      {
        id: "event-unapproved-admin-change",
        type: "privileged_role_change",
        projectId: "project-atlas-treasury",
        contractAddress: "0x2222222222222222222222222222222222222222",
        actor: "0x9999999999999999999999999999999999999999",
        approvalHash: "",
        blockNumber: 21000005,
        transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        approved: false,
        source: "evm-log",
        observedAt: hoursAgo(1)
      },
      {
        id: "event-abnormal-outflow",
        type: "value_outflow",
        projectId: "project-atlas-treasury",
        contractAddress: "0x1111111111111111111111111111111111111111",
        actor: "0x8888888888888888888888888888888888888888",
        approvalHash: "",
        amountUsd: 750000,
        baselineUsd: 45000,
        blockNumber: 21000006,
        transactionHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        approved: false,
        source: "indexer",
        observedAt: hoursAgo(0.5)
      }
    ],
    approvals: [],
    incidents: [],
    audit: [],
    node: {
      id: "evm-primary",
      family: "evm",
      endpoint: "http://127.0.0.1:8545/",
      connected: true,
      expectedChainId: "1",
      chainId: "1",
      blockNumber: 21000000,
      latestObservedBlockNumber: 21000014,
      blockTimestamp: hoursAgo(0.1),
      clientVersion: "RootCause demo observer",
      checkedAt: hoursAgo(0.1)
    },
    updatedAt: new Date().toISOString()
  };
}
