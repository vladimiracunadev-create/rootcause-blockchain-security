// Estado de demostración: escenarios reproducibles, todos ficticios.
//
// No es material de relleno. Cada escenario está construido para activar
// exactamente una regla, y hay además una cuenta sana que no debe activar
// ninguna. Esa combinación es lo que permite que una prueba compruebe a la vez
// que el motor detecta lo que debe y que se mantiene callado donde no debe: una
// regla que grita siempre acaba ignorándose, y entonces deja de proteger.
//
// Todas las direcciones y hashes se generan por patrón. Aquí no hay ninguna
// dirección real, ni siquiera de ejemplos públicos.
//
// `createEmptyState` sí se usa en producción: es el estado inicial del modo
// persistente.
function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const MAX_UINT256_TEXT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function demoHash(seed) {
  return "0x" + seed.repeat(64).slice(0, 64);
}

export function createEmptyState() {
  return {
    schemaVersion: 2,
    projects: [],
    watchedAccounts: [],
    walletEvents: [],
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

// Escenarios wallet reproducibles del modo demo. Todas las direcciones y
// transacciones son ficticias y están documentadas como fixtures:
//   1. allowance ilimitado          → BLK-WALLET-001 (cuenta operativa)
//   2. spender desconocido          → BLK-WALLET-002 (cuenta operativa)
//   3. operador NFT global          → BLK-WALLET-003 (cuenta operativa)
//   4. permit usado fuera de política → BLK-WALLET-004 (cuenta operativa)
//   5. address poisoning candidato  → BLK-WALLET-005 (cuenta operativa)
//   6. cambio de propietario Safe   → BLK-WALLET-006 (smart account)
//   7. delegación EIP-7702          → BLK-WALLET-007 (EOA fría)
//   8. wallet crítica reactivada    → BLK-WALLET-008 (tesorería dormida)
//   9. escenario sano               → sin incidentes (cuenta watch-only)
const DEMO_ADDRESSES = Object.freeze({
  opsWallet: "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
  safeWallet: "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
  coldEoa: "0xe3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3",
  dormantTreasury: "0xf4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4",
  healthyWatch: "0x9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a",
  demoToken: "0x00000000000000000000000000000000000a11ce",
  demoCollection: "0x00000000000000000000000000000000000c0111",
  allowedRouter: "0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
  knownCounterparty: "0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c001",
  poisonLookalike: "0xc0c0c0ffee00000000000000000000000000c001",
  unknownSpender: "0xbad0bad0bad0bad0bad0bad0bad0bad0bad0bad0",
  unknownOperator: "0x0be10be10be10be10be10be10be10be10be10be1",
  permitConsumer: "0x9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e",
  unexpectedOwner: "0x6666666666666666666666666666666666666666",
  delegateImplementation: "0x7702770277027702770277027702770277027702"
});

function createDemoWatchedAccounts() {
  const a = DEMO_ADDRESSES;
  const timestamp = daysAgo(120);
  const base = { createdAt: timestamp, updatedAt: timestamp };
  return [
    {
      id: "account-atlas-ops",
      projectId: "project-atlas-treasury",
      chainId: "1",
      address: a.opsWallet,
      accountType: "eoa",
      purpose: "Wallet operativa de pagos de la tesorería",
      criticality: "high",
      expectedActivity: { description: "Pagos semanales a contrapartes conocidas", activeHours: null },
      allowedSpenders: [a.allowedRouter],
      knownCounterparties: [a.knownCounterparty],
      allowedTokenContracts: [a.demoToken],
      approvalPolicies: [
        { tokenContract: a.demoToken, maximumAllowanceRaw: "250000000000", maximumAgeDays: 60 }
      ],
      dormancyPolicy: { dormantAfterDays: 0 },
      smartAccountPolicy: {
        expectedOwners: [], expectedGuardians: [], expectedModules: [],
        expectedThreshold: 0, expectedImplementation: null, expectedDelegate: null,
        allowedChainIds: ["1"]
      },
      tags: ["treasury", "demo"],
      ...base
    },
    {
      id: "account-atlas-safe",
      projectId: "project-atlas-treasury",
      chainId: "1",
      address: a.safeWallet,
      accountType: "smart-account",
      purpose: "Smart account administrativa (quorum 3 de 5)",
      criticality: "critical",
      expectedActivity: { description: "Solo cambios aprobados por quorum", activeHours: null },
      allowedSpenders: [],
      knownCounterparties: [a.knownCounterparty],
      allowedTokenContracts: [],
      approvalPolicies: [],
      dormancyPolicy: { dormantAfterDays: 0 },
      smartAccountPolicy: {
        expectedOwners: [
          "0x1010101010101010101010101010101010101010",
          "0x2020202020202020202020202020202020202020",
          "0x3030303030303030303030303030303030303030"
        ],
        expectedGuardians: [], expectedModules: [], expectedThreshold: 3,
        expectedImplementation: null, expectedDelegate: null, allowedChainIds: ["1"]
      },
      tags: ["admin", "demo"],
      ...base
    },
    {
      id: "account-atlas-cold",
      projectId: "project-atlas-treasury",
      chainId: "1",
      address: a.coldEoa,
      accountType: "eoa",
      purpose: "EOA fría de reserva, sin delegaciones previstas",
      criticality: "critical",
      expectedActivity: { description: "Sin actividad prevista", activeHours: null },
      allowedSpenders: [],
      knownCounterparties: [],
      allowedTokenContracts: [],
      approvalPolicies: [],
      dormancyPolicy: { dormantAfterDays: 0 },
      smartAccountPolicy: {
        expectedOwners: [], expectedGuardians: [], expectedModules: [],
        expectedThreshold: 0, expectedImplementation: null, expectedDelegate: null,
        allowedChainIds: ["1"]
      },
      tags: ["cold", "demo"],
      ...base
    },
    {
      id: "account-atlas-dormant",
      projectId: "project-atlas-treasury",
      chainId: "1",
      address: a.dormantTreasury,
      accountType: "eoa",
      purpose: "Tesorería secundaria declarada inactiva",
      criticality: "critical",
      expectedActivity: { description: "Dormida: cualquier movimiento exige confirmación", activeHours: null },
      allowedSpenders: [],
      knownCounterparties: [a.knownCounterparty],
      allowedTokenContracts: [],
      approvalPolicies: [],
      dormancyPolicy: { dormantAfterDays: 30 },
      smartAccountPolicy: {
        expectedOwners: [], expectedGuardians: [], expectedModules: [],
        expectedThreshold: 0, expectedImplementation: null, expectedDelegate: null,
        allowedChainIds: ["1"]
      },
      tags: ["dormant", "demo"],
      ...base
    },
    {
      id: "account-northstar-watch",
      projectId: "project-northstar",
      chainId: "11155111",
      address: a.healthyWatch,
      accountType: "watch-only",
      purpose: "Cuenta sana de referencia: todo dentro de política",
      criticality: "low",
      expectedActivity: { description: "Actividad de pruebas en Sepolia", activeHours: null },
      allowedSpenders: [a.allowedRouter],
      knownCounterparties: [a.knownCounterparty],
      allowedTokenContracts: [a.demoToken],
      approvalPolicies: [
        { tokenContract: a.demoToken, maximumAllowanceRaw: "250000000000", maximumAgeDays: 60 }
      ],
      dormancyPolicy: { dormantAfterDays: 0 },
      smartAccountPolicy: {
        expectedOwners: [], expectedGuardians: [], expectedModules: [],
        expectedThreshold: 0, expectedImplementation: null, expectedDelegate: null,
        allowedChainIds: ["11155111"]
      },
      tags: ["healthy", "demo"],
      ...base
    }
  ];
}

function createDemoWalletEvents() {
  const a = DEMO_ADDRESSES;
  return [
    {
      id: "wallet-event-unlimited-allowance",
      type: "wallet.allowance.changed",
      chainId: "1", blockNumber: 21000010, blockHash: demoHash("1a"),
      transactionHash: demoHash("e1"), logIndex: 0,
      walletAddress: a.opsWallet, contractAddress: a.demoToken,
      spender: a.allowedRouter, operator: "",
      amountRaw: MAX_UINT256_TEXT, decimals: 6,
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(4)
    },
    {
      id: "wallet-event-unknown-spender",
      type: "wallet.allowance.changed",
      chainId: "1", blockNumber: 21000011, blockHash: demoHash("1b"),
      transactionHash: demoHash("e2"), logIndex: 0,
      walletAddress: a.opsWallet, contractAddress: a.demoToken,
      spender: a.unknownSpender, operator: "",
      amountRaw: "50000000000", decimals: 6,
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(3)
    },
    {
      id: "wallet-event-nft-operator",
      type: "wallet.operator.changed",
      chainId: "1", blockNumber: 21000012, blockHash: demoHash("1c"),
      transactionHash: demoHash("e3"), logIndex: 1,
      walletAddress: a.opsWallet, contractAddress: a.demoCollection,
      spender: "", operator: a.unknownOperator,
      amountRaw: null, decimals: null,
      approved: true, approvalScope: "all", tokenStandard: "erc-721",
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(6)
    },
    {
      id: "wallet-event-permit-used",
      type: "wallet.permit.used",
      chainId: "1", blockNumber: 21000013, blockHash: demoHash("1d"),
      transactionHash: demoHash("e4"), logIndex: 0,
      walletAddress: a.opsWallet, contractAddress: a.demoToken,
      spender: a.permitConsumer, operator: "",
      amountRaw: "120000000000", decimals: 6,
      permitStandard: "eip-2612", deadline: null,
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(2)
    },
    {
      id: "wallet-event-poisoning-dust",
      type: "wallet.transfer.observed",
      chainId: "1", blockNumber: 21000014, blockHash: demoHash("1e"),
      transactionHash: demoHash("e5"), logIndex: 2,
      walletAddress: a.opsWallet, contractAddress: a.demoToken,
      spender: "", operator: "",
      amountRaw: "0", decimals: 6,
      direction: "in", sourceAddress: a.poisonLookalike, destination: a.opsWallet,
      source: "indexer", confidence: "observed",
      observedAt: hoursAgo(1)
    },
    {
      id: "wallet-event-safe-owner-added",
      type: "wallet.smart-account.changed",
      chainId: "1", blockNumber: 21000015, blockHash: demoHash("1f"),
      transactionHash: demoHash("e6"), logIndex: 0,
      walletAddress: a.safeWallet, contractAddress: a.safeWallet,
      spender: "", operator: "", amountRaw: null, decimals: null,
      changeKind: "owner-added", subject: a.unexpectedOwner,
      newThreshold: null, approvalHash: "",
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(1.5)
    },
    {
      id: "wallet-event-7702-delegation",
      type: "wallet.delegation.changed",
      chainId: "1", blockNumber: 21000016, blockHash: demoHash("2a"),
      transactionHash: demoHash("e7"), logIndex: 0,
      walletAddress: a.coldEoa, contractAddress: "",
      spender: "", operator: "", amountRaw: null, decimals: null,
      delegate: a.delegateImplementation, approvalHash: "",
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(2.5)
    },
    {
      id: "wallet-event-dormant-baseline",
      type: "wallet.activity.observed",
      chainId: "1", blockNumber: 20500000, blockHash: demoHash("2b"),
      transactionHash: demoHash("e8"), logIndex: 0,
      walletAddress: a.dormantTreasury, contractAddress: "",
      spender: "", operator: "", amountRaw: null, decimals: null,
      counterparty: a.knownCounterparty, kind: "transfer",
      source: "indexer", destination: "", confidence: "observed",
      observedAt: daysAgo(62)
    },
    {
      id: "wallet-event-dormant-reactivated",
      type: "wallet.activity.observed",
      chainId: "1", blockNumber: 21000017, blockHash: demoHash("2c"),
      transactionHash: demoHash("e9"), logIndex: 0,
      walletAddress: a.dormantTreasury, contractAddress: "",
      spender: "", operator: "", amountRaw: null, decimals: null,
      counterparty: a.knownCounterparty, kind: "transfer",
      source: "indexer", destination: "", confidence: "observed",
      observedAt: hoursAgo(0.75)
    },
    {
      id: "wallet-event-healthy-allowance",
      type: "wallet.allowance.changed",
      chainId: "11155111", blockNumber: 6400000, blockHash: demoHash("2d"),
      transactionHash: demoHash("ea"), logIndex: 0,
      walletAddress: a.healthyWatch, contractAddress: a.demoToken,
      spender: a.allowedRouter, operator: "",
      amountRaw: "1000000000", decimals: 6,
      source: "evm-log", destination: "", confidence: "observed",
      observedAt: hoursAgo(5)
    }
  ];
}

export function createDemoState() {
  return {
    schemaVersion: 2,
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
    watchedAccounts: createDemoWatchedAccounts(),
    walletEvents: createDemoWalletEvents(),
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
