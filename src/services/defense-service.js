import crypto from "node:crypto";
import { appendAuditEntry, verifyAuditChain } from "../infrastructure/audit-log.js";
import { assertNoSecretMaterial } from "../domain/secret-guard.js";
import { evaluateState } from "../domain/rule-engine.js";
import { WALLET_EVENT_TYPES, walletPostureSummary } from "../domain/wallet-rules.js";
import { countBySeverity, riskLevel, riskScore } from "../domain/risk.js";

const FAMILIES = new Set(["evm", "solana", "cosmos", "substrate", "other"]);
const ENVIRONMENTS = new Set(["production", "staging", "development", "test"]);
const CRITICALITIES = new Set(["low", "medium", "high", "critical"]);
const PROJECT_STATUSES = new Set(["active", "paused", "migration-required", "retired"]);
const ADMIN_TYPES = new Set(["eoa", "multisig", "timelock", "governance", "program-derived", "none", "unknown"]);
const GOVERNANCE_MODELS = new Set(["multisig", "token", "council", "offchain", "none", "unknown"]);
const EVENT_TYPES = new Set(["privileged_role_change", "value_outflow"]);
const WALLET_EVENTS = new Set(WALLET_EVENT_TYPES);
const ACCOUNT_TYPES = new Set(["eoa", "multisig", "smart-account", "contract-account", "watch-only"]);
const SMART_ACCOUNT_CHANGE_KINDS = new Set([
  "owner-added",
  "owner-removed",
  "guardian-changed",
  "module-enabled",
  "module-disabled",
  "threshold-changed",
  "implementation-upgraded",
  "recovery-changed",
  "unknown"
]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function text(value, name, maximum = 120) {
  const result = String(value || "").trim();
  if (!result || result.length > maximum || /[\u0000-\u001f]/.test(result)) {
    throw badRequest(name + " is required and must contain safe text up to " + maximum + " characters.");
  }
  return result;
}

function optionalText(value, name, maximum = 160) {
  if (value === undefined || value === null || value === "") return "";
  return text(value, name, maximum);
}

function enumValue(value, name, allowed) {
  if (!allowed.has(value)) throw badRequest(name + " has an unsupported value.");
  return value;
}

function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw badRequest(name + " must be an integer between " + minimum + " and " + maximum + ".");
  }
  return result;
}

function finiteNumber(value, name, minimum = 0, maximum = 1e15) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw badRequest(name + " must be a finite number between " + minimum + " and " + maximum + ".");
  }
  return result;
}

function boolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw badRequest("Boolean fields must use true or false.");
  return value;
}

function isoDate(value, name, fallback = null) {
  if (!value && fallback !== null) return fallback;
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw badRequest(name + " must be an ISO timestamp.");
  return parsed.toISOString();
}

function publicIdentifier(value, family, name = "address") {
  const result = text(value, name, 128);
  if (family === "evm" && !/^0x[0-9a-f]{40}$/i.test(result)) {
    throw badRequest(name + " must be a 20-byte EVM address.");
  }
  if (family !== "evm" && !/^[a-z0-9:._-]{3,128}$/i.test(result)) {
    throw badRequest(name + " contains unsupported characters.");
  }
  return family === "evm" ? result.toLowerCase() : result;
}

function optionalTransactionHash(value) {
  if (!value) return "";
  const result = String(value).trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(result)) throw badRequest("transactionHash must be 32 bytes.");
  return result;
}

function optionalApprovalHash(value) {
  if (!value) return "";
  const result = String(value).trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(result)) throw badRequest("approvalHash must be a SHA-256 hash.");
  return result;
}

function normalizeContract(input, projectFamily, index) {
  const adminType = enumValue(input.admin?.type || "unknown", "contract.admin.type", ADMIN_TYPES);
  const owners = integer(input.admin?.owners || 0, "contract.admin.owners", 0, 1000);
  const threshold = integer(input.admin?.threshold || 0, "contract.admin.threshold", 0, 1000);
  if (threshold > owners && adminType === "multisig") {
    throw badRequest("contract.admin.threshold cannot exceed owners.");
  }
  return {
    id: crypto.randomUUID(),
    name: text(input.name || "Contract " + (index + 1), "contract.name", 100),
    address: publicIdentifier(input.address, projectFamily, "contract.address"),
    kind: text(input.kind || "unknown", "contract.kind", 60),
    verifiedSource: boolean(input.verifiedSource),
    bytecodeHash: optionalText(input.bytecodeHash, "contract.bytecodeHash", 100) || null,
    upgradeable: boolean(input.upgradeable),
    upgradeDelaySeconds: integer(input.upgradeDelaySeconds || 0, "contract.upgradeDelaySeconds", 0, 315360000),
    admin: { type: adminType, owners, threshold }
  };
}

function normalizeOracle(input, index) {
  return {
    id: crypto.randomUUID(),
    name: text(input.name || "Oracle " + (index + 1), "oracle.name", 100),
    providerCount: integer(input.providerCount || 0, "oracle.providerCount", 0, 10000),
    heartbeatSeconds: integer(input.heartbeatSeconds || 0, "oracle.heartbeatSeconds", 0, 31536000),
    lastUpdateAt: input.lastUpdateAt ? isoDate(input.lastUpdateAt, "oracle.lastUpdateAt") : null,
    fallbackAvailable: boolean(input.fallbackAvailable)
  };
}

function normalizeBridge(input, index) {
  const signerCount = integer(input.signerCount || 0, "bridge.signerCount", 0, 10000);
  const threshold = integer(input.threshold || 0, "bridge.threshold", 0, 10000);
  if (threshold > signerCount) throw badRequest("bridge.threshold cannot exceed signerCount.");
  return {
    id: crypto.randomUUID(),
    name: text(input.name || "Bridge " + (index + 1), "bridge.name", 100),
    validationModel: text(input.validationModel || "unknown", "bridge.validationModel", 50),
    signerCount,
    threshold,
    independentOperators: integer(input.independentOperators || 0, "bridge.independentOperators", 0, 10000),
    pauseAvailable: boolean(input.pauseAvailable)
  };
}

function normalizeDependency(input) {
  return {
    name: text(input.name, "dependency.name", 120),
    version: text(input.version || "unknown", "dependency.version", 80),
    pinned: boolean(input.pinned),
    provenanceVerified: boolean(input.provenanceVerified)
  };
}

function normalizeProject(input) {
  assertNoSecretMaterial(input);
  const family = enumValue(input.chain?.family || "other", "chain.family", FAMILIES);
  const contracts = Array.isArray(input.contracts)
    ? input.contracts.slice(0, 100).map((entry, index) => normalizeContract(entry, family, index))
    : [];
  const addresses = new Set(contracts.map((contract) => contract.address));
  if (addresses.size !== contracts.length) throw badRequest("contract addresses must be unique within a project.");
  return {
    id: crypto.randomUUID(),
    name: text(input.name, "name"),
    chain: {
      family,
      network: text(input.chain?.network || "unknown", "chain.network", 60),
      chainId: text(input.chain?.chainId || "unknown", "chain.chainId", 60)
    },
    environment: enumValue(input.environment || "production", "environment", ENVIRONMENTS),
    criticality: enumValue(input.criticality || "medium", "criticality", CRITICALITIES),
    status: enumValue(input.status || "active", "status", PROJECT_STATUSES),
    contracts,
    oracles: Array.isArray(input.oracles)
      ? input.oracles.slice(0, 100).map(normalizeOracle)
      : [],
    bridges: Array.isArray(input.bridges)
      ? input.bridges.slice(0, 100).map(normalizeBridge)
      : [],
    dependencies: Array.isArray(input.dependencies)
      ? input.dependencies.slice(0, 200).map(normalizeDependency)
      : [],
    governance: {
      model: enumValue(input.governance?.model || "unknown", "governance.model", GOVERNANCE_MODELS),
      timelockSeconds: integer(input.governance?.timelockSeconds || 0, "governance.timelockSeconds", 0, 315360000)
    },
    tags: Array.isArray(input.tags)
      ? input.tags.slice(0, 20).map((tag) => text(tag, "tag", 30))
      : []
  };
}

function evmAddress(value, name) {
  const result = String(value || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(result)) {
    throw badRequest(name + " must be a 20-byte EVM address.");
  }
  return result;
}

function addressList(value, name, maximum = 100) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(name + " must be an array of public addresses.");
  return value.slice(0, maximum).map((entry, index) => evmAddress(entry, name + "[" + index + "]"));
}

function rawAmount(value, name, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(name + " is required as a base-10 integer string.");
    return null;
  }
  const result = String(value).trim();
  if (!/^\d{1,78}$/.test(result)) {
    throw badRequest(name + " must be an unsigned base-10 integer string (raw token units).");
  }
  return result;
}

function normalizeApprovalPolicy(input, index) {
  return {
    tokenContract: evmAddress(input.tokenContract, "approvalPolicies[" + index + "].tokenContract"),
    maximumAllowanceRaw: rawAmount(input.maximumAllowanceRaw, "approvalPolicies[" + index + "].maximumAllowanceRaw"),
    maximumAgeDays: integer(input.maximumAgeDays || 0, "approvalPolicies[" + index + "].maximumAgeDays", 0, 3650)
  };
}

// Cuenta pública vigilada. Deliberadamente NO admite nombre real, correo,
// teléfono, ubicación, biometría ni material de respaldo: solo la dirección
// pública, su propósito operativo y la política que la gobierna.
function normalizeWatchedAccount(input) {
  assertNoSecretMaterial(input);
  const smart = input.smartAccountPolicy || {};
  const activity = input.expectedActivity || {};
  const dormancy = input.dormancyPolicy || {};
  return {
    id: crypto.randomUUID(),
    projectId: text(input.projectId, "projectId", 80),
    chainId: text(input.chainId || "1", "chainId", 60),
    address: evmAddress(input.address, "address"),
    accountType: enumValue(input.accountType || "eoa", "accountType", ACCOUNT_TYPES),
    purpose: optionalText(input.purpose, "purpose", 160),
    criticality: enumValue(input.criticality || "medium", "criticality", CRITICALITIES),
    expectedActivity: {
      description: optionalText(activity.description, "expectedActivity.description", 200),
      activeHours:
        activity.activeHours &&
        Number.isFinite(Number(activity.activeHours.startHour)) &&
        Number.isFinite(Number(activity.activeHours.endHour))
          ? {
              startHour: integer(activity.activeHours.startHour, "expectedActivity.activeHours.startHour", 0, 23),
              endHour: integer(activity.activeHours.endHour, "expectedActivity.activeHours.endHour", 0, 24)
            }
          : null
    },
    allowedSpenders: addressList(input.allowedSpenders, "allowedSpenders"),
    knownCounterparties: addressList(input.knownCounterparties, "knownCounterparties"),
    allowedTokenContracts: addressList(input.allowedTokenContracts, "allowedTokenContracts"),
    approvalPolicies: Array.isArray(input.approvalPolicies)
      ? input.approvalPolicies.slice(0, 100).map(normalizeApprovalPolicy)
      : [],
    dormancyPolicy: {
      dormantAfterDays: integer(dormancy.dormantAfterDays || 0, "dormancyPolicy.dormantAfterDays", 0, 3650)
    },
    smartAccountPolicy: {
      expectedOwners: addressList(smart.expectedOwners, "smartAccountPolicy.expectedOwners"),
      expectedGuardians: addressList(smart.expectedGuardians, "smartAccountPolicy.expectedGuardians"),
      expectedModules: addressList(smart.expectedModules, "smartAccountPolicy.expectedModules"),
      expectedThreshold: integer(smart.expectedThreshold || 0, "smartAccountPolicy.expectedThreshold", 0, 1000),
      expectedImplementation: smart.expectedImplementation
        ? evmAddress(smart.expectedImplementation, "smartAccountPolicy.expectedImplementation")
        : null,
      expectedDelegate: smart.expectedDelegate
        ? evmAddress(smart.expectedDelegate, "smartAccountPolicy.expectedDelegate")
        : null,
      allowedChainIds: Array.isArray(smart.allowedChainIds)
        ? smart.allowedChainIds.slice(0, 20).map((entry) => text(entry, "smartAccountPolicy.allowedChainIds", 60))
        : []
    },
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 20).map((tag) => text(tag, "tag", 30)) : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// Evento wallet normalizado: siempre con procedencia (bloque, transacción,
// log), idempotente por chainId + transactionHash + logIndex, y con el nivel
// de confianza que separa lo observado de lo declarado.
function normalizeWalletEvent(input, type) {
  const event = {
    id: crypto.randomUUID(),
    type,
    chainId: text(input.chainId, "chainId", 60),
    blockNumber: integer(input.blockNumber, "blockNumber"),
    blockHash: input.blockHash ? optionalTransactionHash(input.blockHash) : "",
    transactionHash: optionalTransactionHash(input.transactionHash),
    logIndex: integer(input.logIndex ?? 0, "logIndex", 0, 1000000),
    walletAddress: evmAddress(input.walletAddress, "walletAddress"),
    contractAddress: input.contractAddress ? evmAddress(input.contractAddress, "contractAddress") : "",
    spender: input.spender ? evmAddress(input.spender, "spender") : "",
    operator: input.operator ? evmAddress(input.operator, "operator") : "",
    amountRaw: rawAmount(input.amountRaw, "amountRaw"),
    decimals: input.decimals === undefined || input.decimals === null ? null : integer(input.decimals, "decimals", 0, 78),
    source: text(input.source || "normalized-collector", "source", 80),
    destination: input.destination ? evmAddress(input.destination, "destination") : "",
    confidence: enumValue(input.confidence || "observed", "confidence", new Set(["observed", "declared", "heuristic"])),
    observedAt: input.observedAt ? isoDate(input.observedAt, "observedAt") : new Date().toISOString()
  };
  if (!event.transactionHash) throw badRequest("transactionHash is required for wallet events.");
  if (type === "wallet.allowance.changed") {
    if (!event.contractAddress || !event.spender) throw badRequest("contractAddress and spender are required.");
    if (event.amountRaw === null) throw badRequest("amountRaw is required for allowance events.");
  }
  if (type === "wallet.operator.changed") {
    if (!event.contractAddress || !event.operator) throw badRequest("contractAddress and operator are required.");
    event.approved = boolean(input.approved);
    event.approvalScope = enumValue(input.approvalScope || "all", "approvalScope", new Set(["all", "single"]));
    event.tokenStandard = optionalText(input.tokenStandard, "tokenStandard", 20);
  }
  if (type === "wallet.permit.used") {
    if (!event.contractAddress || !event.spender) throw badRequest("contractAddress and spender are required.");
    event.permitStandard = enumValue(input.permitStandard || "eip-2612", "permitStandard", new Set(["eip-2612", "eip-712", "permit2"]));
    event.deadline = input.deadline ? isoDate(input.deadline, "deadline") : null;
  }
  if (type === "wallet.transfer.observed") {
    event.direction = enumValue(input.direction || "in", "direction", new Set(["in", "out"]));
    // `source` es la procedencia del colector; la dirección de origen de la
    // transferencia viaja en `sourceAddress` para no mezclarlas.
    event.sourceAddress = input.sourceAddress ? evmAddress(input.sourceAddress, "sourceAddress") : "";
  }
  if (type === "wallet.smart-account.changed") {
    event.changeKind = enumValue(input.changeKind || "unknown", "changeKind", SMART_ACCOUNT_CHANGE_KINDS);
    event.subject = input.subject ? evmAddress(input.subject, "subject") : "";
    event.newThreshold = input.newThreshold === undefined ? null : integer(input.newThreshold, "newThreshold", 0, 1000);
    event.approvalHash = optionalApprovalHash(input.approvalHash);
  }
  if (type === "wallet.delegation.changed") {
    event.delegate = input.delegate ? evmAddress(input.delegate, "delegate") : "";
    event.approvalHash = optionalApprovalHash(input.approvalHash);
  }
  if (type === "wallet.activity.observed") {
    event.counterparty = input.counterparty ? evmAddress(input.counterparty, "counterparty") : "";
    event.kind = optionalText(input.kind, "kind", 60);
  }
  return event;
}

function mergeIncidents(existing, findings, now) {
  const byId = new Map(existing.map((incident) => [incident.id, incident]));
  const activeIds = new Set(findings.map((finding) => finding.id));
  for (const finding of findings) {
    const previous = byId.get(finding.id);
    byId.set(finding.id, {
      ...finding,
      createdAt: previous?.createdAt || now,
      lastSeenAt: now,
      status: previous?.status === "acknowledged" ? "acknowledged" : "open",
      acknowledgedAt: previous?.acknowledgedAt,
      acknowledgedBy: previous?.acknowledgedBy
    });
  }
  for (const [id, incident] of byId) {
    if (!activeIds.has(id) && ["open", "acknowledged"].includes(incident.status)) {
      byId.set(id, { ...incident, status: "resolved", resolvedAt: now });
    }
  }
  return [...byId.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export class DefenseService {
  constructor({ store, config, policies, controls, evmClient = null }) {
    this.store = store;
    this.config = config;
    this.policies = policies;
    this.controls = controls;
    this.evmClient = evmClient;
    this.writeQueue = Promise.resolve();
  }

  evaluate(state) {
    return evaluateState(state, { policies: this.policies });
  }

  async initialize() {
    const state = await this.store.load();
    if (!Array.isArray(state.projects)) state.projects = [];
    if (!Array.isArray(state.observedEvents)) state.observedEvents = [];
    // Migración segura: los inventarios previos a 0.2.0 no tenían postura de
    // wallets; se crean vacíos sin tocar el resto del estado.
    if (!Array.isArray(state.watchedAccounts)) state.watchedAccounts = [];
    if (!Array.isArray(state.walletEvents)) state.walletEvents = [];
    if (!Array.isArray(state.approvals)) state.approvals = [];
    if (!Array.isArray(state.incidents)) state.incidents = [];
    if (!Array.isArray(state.audit)) state.audit = [];
    if (!state.audit.length) {
      state.audit = appendAuditEntry(state.audit, {
        action: "application_initialized",
        metadata: { demoMode: this.config.demoMode }
      });
    }
    state.incidents = mergeIncidents(state.incidents, this.evaluate(state), new Date().toISOString());
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
  }

  async mutate(mutator) {
    const operation = this.writeQueue.then(async () => {
      const state = await this.store.load();
      const result = await mutator(state);
      state.updatedAt = new Date().toISOString();
      await this.store.save(state);
      return result;
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async summary() {
    const state = await this.store.load();
    const active = state.incidents.filter((incident) => ["open", "acknowledged"].includes(incident.status));
    const score = riskScore(active);
    return {
      generatedAt: new Date().toISOString(),
      mode: this.config.demoMode ? "demo" : "persistent",
      risk: { score, level: riskLevel(score), counts: countBySeverity(active) },
      totals: {
        projects: state.projects.length,
        contracts: state.projects.reduce((sum, project) => sum + project.contracts.length, 0),
        oracles: state.projects.reduce((sum, project) => sum + project.oracles.length, 0),
        bridges: state.projects.reduce((sum, project) => sum + project.bridges.length, 0),
        watchedAccounts: (state.watchedAccounts || []).length,
        activeIncidents: active.length
      },
      walletPosture: walletPostureSummary(state),
      watchedAccounts: state.watchedAccounts || [],
      projects: state.projects,
      incidents: state.incidents.slice(0, 30),
      node: state.node,
      audit: verifyAuditChain(state.audit)
    };
  }

  async projects() {
    return (await this.store.load()).projects;
  }

  async addProject(input, actor = "local-user") {
    const project = normalizeProject(input);
    return this.mutate(async (state) => {
      if (
        state.projects.some(
          (entry) =>
            entry.name.toLowerCase() === project.name.toLowerCase() &&
            entry.chain.family === project.chain.family &&
            entry.chain.chainId === project.chain.chainId
        )
      ) {
        const error = new Error("A project with that name and chain already exists.");
        error.statusCode = 409;
        throw error;
      }
      state.projects.push(project);
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "project_registered",
        entityType: "project",
        entityId: project.id,
        metadata: {
          name: project.name,
          family: project.chain.family,
          chainId: project.chain.chainId,
          contractCount: project.contracts.length
        }
      });
      return project;
    });
  }

  async scan(actor = "system") {
    return this.mutate(async (state) => {
      const now = new Date().toISOString();
      const findings = this.evaluate(state);
      state.incidents = mergeIncidents(state.incidents, findings, now);
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "risk_scan_completed",
        metadata: { findings: findings.length, counts: countBySeverity(findings) }
      });
      return { scannedAt: now, findings: findings.length, counts: countBySeverity(findings), incidents: state.incidents };
    });
  }

  async incidents() {
    return (await this.store.load()).incidents;
  }

  async updateIncident(id, status, actor = "local-user") {
    if (!["acknowledged", "resolved"].includes(status)) throw badRequest("Unsupported incident status.");
    return this.mutate(async (state) => {
      const index = state.incidents.findIndex((incident) => incident.id === id);
      if (index < 0) {
        const error = new Error("Incident not found.");
        error.statusCode = 404;
        throw error;
      }
      const timestamp = new Date().toISOString();
      state.incidents[index] = {
        ...state.incidents[index],
        status,
        ...(status === "acknowledged"
          ? { acknowledgedAt: timestamp, acknowledgedBy: actor }
          : { resolvedAt: timestamp, resolvedBy: actor })
      };
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "incident_" + status,
        entityType: "incident",
        entityId: id
      });
      return state.incidents[index];
    });
  }

  async policiesDocument() {
    return { policies: this.policies };
  }

  async controlsCatalog() {
    return this.controls;
  }

  async audit() {
    const state = await this.store.load();
    return { verification: verifyAuditChain(state.audit), entries: state.audit };
  }

  async approvePolicyHash(input, actor = "local-user") {
    assertNoSecretMaterial(input);
    const hash = optionalApprovalHash(input.hash);
    if (!hash) throw badRequest("hash is required.");
    const approval = {
      id: crypto.randomUUID(),
      hash,
      purpose: text(input.purpose, "purpose", 160),
      approvedBy: actor,
      approvedAt: new Date().toISOString()
    };
    return this.mutate(async (state) => {
      if (!state.approvals.some((entry) => entry.hash === hash)) state.approvals.push(approval);
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "policy_hash_approved",
        entityType: "approval",
        entityId: approval.id,
        metadata: { hash, purpose: approval.purpose }
      });
      return approval;
    });
  }

  async accounts() {
    return (await this.store.load()).watchedAccounts || [];
  }

  async addWatchedAccount(input, actor = "local-user") {
    const account = normalizeWatchedAccount(input);
    return this.mutate(async (state) => {
      if (!state.watchedAccounts) state.watchedAccounts = [];
      const project = state.projects.find((entry) => entry.id === account.projectId);
      if (!project) throw badRequest("projectId does not reference a registered project.");
      if (
        state.watchedAccounts.some(
          (entry) => entry.address === account.address && entry.chainId === account.chainId
        )
      ) {
        const error = new Error("That address is already watched on that chain.");
        error.statusCode = 409;
        throw error;
      }
      state.watchedAccounts.push(account);
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "watched_account_registered",
        entityType: "wallet-account",
        entityId: account.id,
        metadata: {
          projectId: account.projectId,
          chainId: account.chainId,
          address: account.address,
          accountType: account.accountType
        }
      });
      return account;
    });
  }

  async observeWalletEvent(input, type, actor) {
    const event = normalizeWalletEvent(input, type);
    return this.mutate(async (state) => {
      if (!state.walletEvents) state.walletEvents = [];
      if (!state.watchedAccounts) state.watchedAccounts = [];
      if (
        !state.watchedAccounts.some(
          (entry) => entry.address === event.walletAddress
        )
      ) {
        throw badRequest("walletAddress does not reference a watched account.");
      }
      // Idempotencia: el mismo log (cadena + transacción + índice) no entra dos veces.
      const duplicate = state.walletEvents.find(
        (entry) =>
          entry.chainId === event.chainId &&
          entry.transactionHash === event.transactionHash &&
          entry.logIndex === event.logIndex
      );
      if (duplicate) return { event: duplicate, duplicate: true };
      state.walletEvents.push(event);
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "wallet_event_observed",
        entityType: "wallet-event",
        entityId: event.id,
        metadata: {
          type: event.type,
          chainId: event.chainId,
          walletAddress: event.walletAddress,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex
        }
      });
      return { event, duplicate: false };
    });
  }

  async observeEvent(input, actor = "collector") {
    assertNoSecretMaterial(input);
    if (WALLET_EVENTS.has(input.type)) {
      return (await this.observeWalletEvent(input, input.type, actor)).event;
    }
    const type = enumValue(input.type, "type", EVENT_TYPES);
    return this.mutate(async (state) => {
      const project = state.projects.find((entry) => entry.id === input.projectId);
      if (!project) throw badRequest("projectId does not reference a registered project.");
      const event = {
        id: crypto.randomUUID(),
        type,
        projectId: project.id,
        contractAddress: publicIdentifier(input.contractAddress, project.chain.family, "contractAddress"),
        actor: optionalText(input.actor, "actor", 128),
        approvalHash: optionalApprovalHash(input.approvalHash),
        amountUsd: type === "value_outflow" ? finiteNumber(input.amountUsd, "amountUsd") : 0,
        baselineUsd: type === "value_outflow" ? finiteNumber(input.baselineUsd || 0, "baselineUsd") : 0,
        blockNumber: integer(input.blockNumber, "blockNumber"),
        transactionHash: optionalTransactionHash(input.transactionHash),
        approved: boolean(input.approved),
        source: text(input.source || "normalized-collector", "source", 80),
        observedAt: input.observedAt
          ? isoDate(input.observedAt, "observedAt")
          : new Date().toISOString()
      };
      state.observedEvents.push(event);
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "chain_event_observed",
        entityType: "chain-event",
        entityId: event.id,
        metadata: {
          type: event.type,
          projectId: event.projectId,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash
        }
      });
      return event;
    });
  }

  async refreshNode(actor = "system") {
    return this.mutate(async (state) => {
      let node;
      try {
        if (!this.evmClient) throw new Error("EVM observer is not configured.");
        node = await this.evmClient.snapshot();
      } catch (error) {
        node = {
          id: "evm-primary",
          family: "evm",
          endpoint: this.config.evm.url.replace(/\?.*$/, ""),
          connected: false,
          expectedChainId: this.config.evm.expectedChainId,
          error: String(error.message || "EVM RPC unavailable").slice(0, 240),
          checkedAt: new Date().toISOString()
        };
      }
      state.node = node;
      state.audit = appendAuditEntry(state.audit, {
        actor,
        action: "node_snapshot_refreshed",
        entityType: "node",
        entityId: node.id,
        metadata: { connected: node.connected, chainId: node.chainId || null, blockNumber: node.blockNumber || null }
      });
      return node;
    });
  }
}
