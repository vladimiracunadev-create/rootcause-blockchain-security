// Motor de reglas de defensa: convierte un estado en hallazgos.
//
// Es una función pura. No lee disco, no llama a la red y no muta el estado que
// recibe: las mismas entradas producen exactamente los mismos hallazgos, en el
// mismo orden. Ese determinismo no es un lujo, es lo que permite que un
// incidente conserve su identidad entre ejecuciones.
//
// La pieza que lo sostiene es `findingId`, que deriva el identificador del
// hallazgo por hash de (código, entidad, discriminador). Cambiar cualquiera de
// esos tres campos en una regla existente ROMPE la continuidad del incidente:
// el anterior se marcará como resuelto y aparecerá uno nuevo con historia
// vacía. Si hay que cambiarlo, conviene anunciarlo con un cambio de versión.
//
// Ante un dato ausente, las reglas eligen la lectura segura: un oráculo del que
// no sabemos si está vivo cuenta como vencido, no como sano.
import crypto from "node:crypto";
import { evaluateWalletPosture } from "./wallet-rules.js";

function findingId(code, entityId, discriminator = "") {
  return crypto
    .createHash("sha256")
    .update([code, entityId, discriminator].join("|"))
    .digest("hex")
    .slice(0, 20);
}

function makeFinding(input) {
  return {
    id: findingId(input.code, input.entityId, input.discriminator),
    detectedAt: input.detectedAt || new Date().toISOString(),
    status: "open",
    ...input
  };
}

function severityFor(project, high = "high", lower = "medium") {
  return ["critical", "high"].includes(project.criticality) ? high : lower;
}

export function evaluateProject(project, context) {
  const findings = [];
  const policies = context.policies;
  const now = new Date(context.now || Date.now()).getTime();

  for (const contract of project.contracts || []) {
    if (!contract.verifiedSource) {
      findings.push(
        makeFinding({
          code: "BLK-CONTRACT-001",
          entityType: "contract",
          entityId: contract.address,
          discriminator: project.id,
          severity: severityFor(project),
          title: "Contrato desplegado sin procedencia verificada",
          explanation:
            contract.name + " no está relacionado con fuente y artefactos de compilación verificables.",
          rootCause: "La entrega no conserva evidencia suficiente para reproducir el bytecode desplegado.",
          evidence: {
            projectId: project.id,
            chainId: project.chain.chainId,
            address: contract.address,
            verifiedSource: contract.verifiedSource,
            bytecodeHash: contract.bytecodeHash || null
          },
          remediation: [
            "Publicar o registrar fuente, configuración de compilador y hash del artefacto.",
            "Comparar bytecode de runtime antes de aceptar una nueva versión."
          ]
        })
      );
    }

    if (contract.admin?.type === "eoa") {
      findings.push(
        makeFinding({
          code: "BLK-ACCESS-001",
          entityType: "contract",
          entityId: contract.address,
          discriminator: project.id,
          severity: severityFor(project, "critical", "high"),
          title: "Control administrativo concentrado en una EOA",
          explanation: "Una sola clave puede administrar " + contract.name + ".",
          rootCause: "El plano de control carece de quorum y separación de funciones.",
          evidence: {
            projectId: project.id,
            address: contract.address,
            adminType: contract.admin.type
          },
          remediation: [
            "Migrar el rol a multisig o gobernanza con firmantes independientes.",
            "Agregar timelock, alertas y un procedimiento probado de emergencia."
          ]
        })
      );
    }

    if (
      contract.admin?.type === "multisig" &&
      (Number(contract.admin.owners || 0) < 2 ||
        Number(contract.admin.threshold || 0) < 2 ||
        Number(contract.admin.threshold || 0) > Number(contract.admin.owners || 0))
    ) {
      findings.push(
        makeFinding({
          code: "BLK-ACCESS-002",
          entityType: "contract",
          entityId: contract.address,
          discriminator: project.id,
          severity: severityFor(project),
          title: "Umbral administrativo insuficiente",
          explanation: "El multisig de " + contract.name + " no exige al menos dos aprobaciones válidas.",
          rootCause: "El quorum nominal no contiene el compromiso de un único operador.",
          evidence: {
            projectId: project.id,
            address: contract.address,
            owners: contract.admin.owners,
            threshold: contract.admin.threshold
          },
          remediation: [
            "Definir un umbral mayor que uno y menor o igual al número de owners.",
            "Separar firmantes por persona, proveedor, dispositivo y ubicación."
          ]
        })
      );
    }

    if (
      contract.upgradeable &&
      Number(contract.upgradeDelaySeconds || 0) < Number(policies.minimumUpgradeDelaySeconds)
    ) {
      findings.push(
        makeFinding({
          code: "BLK-UPGRADE-001",
          entityType: "contract",
          entityId: contract.address,
          discriminator: project.id,
          severity: severityFor(project),
          title: "Upgrade sin demora mínima",
          explanation:
            contract.name + " puede actualizarse antes del mínimo definido por política.",
          rootCause: "La ruta de upgrade no deja una ventana suficiente de detección y respuesta.",
          evidence: {
            projectId: project.id,
            address: contract.address,
            upgradeDelaySeconds: contract.upgradeDelaySeconds,
            policyMinimumSeconds: policies.minimumUpgradeDelaySeconds
          },
          remediation: [
            "Aplicar un timelock on-chain a los upgrades.",
            "Monitorizar anuncio, cola, ejecución y cambio de implementación."
          ]
        })
      );
    }
  }

  for (const oracle of project.oracles || []) {
    if (
      Number(oracle.providerCount || 0) < Number(policies.minimumOracleProviders) &&
      !oracle.fallbackAvailable
    ) {
      findings.push(
        makeFinding({
          code: "BLK-ORACLE-001",
          entityType: "oracle",
          entityId: oracle.id,
          discriminator: project.id,
          severity: severityFor(project, "critical", "high"),
          title: "Oráculo concentrado sin fallback",
          explanation: oracle.name + " depende de menos proveedores que la política y no tiene fallback.",
          rootCause: "Una sola fuente o ruta de publicación controla una entrada económica crítica.",
          evidence: {
            projectId: project.id,
            oracleId: oracle.id,
            providerCount: oracle.providerCount,
            fallbackAvailable: oracle.fallbackAvailable
          },
          remediation: [
            "Agregar fuentes independientes y agregación robusta.",
            "Definir circuit breaker para datos ausentes, extremos o inconsistentes."
          ]
        })
      );
    }

    const updatedAt = Date.parse(oracle.lastUpdateAt || "");
    const allowedAgeMs = Number(oracle.heartbeatSeconds || 0) * 2 * 1000;
    if (!Number.isFinite(updatedAt) || allowedAgeMs <= 0 || now - updatedAt > allowedAgeMs) {
      findings.push(
        makeFinding({
          code: "BLK-ORACLE-002",
          entityType: "oracle",
          entityId: oracle.id,
          discriminator: project.id,
          severity: severityFor(project),
          title: "Feed de oráculo vencido",
          explanation: oracle.name + " excede dos veces su heartbeat documentado.",
          rootCause: "La aplicación puede consumir un dato económico que ya no representa el mercado.",
          evidence: {
            projectId: project.id,
            oracleId: oracle.id,
            lastUpdateAt: oracle.lastUpdateAt || null,
            heartbeatSeconds: oracle.heartbeatSeconds
          },
          remediation: [
            "Detener operaciones que dependan de datos vencidos según el runbook.",
            "Verificar publicadores, gas, condiciones de mercado y segunda fuente."
          ]
        })
      );
    }
  }

  for (const bridge of project.bridges || []) {
    const signerCount = Number(bridge.signerCount || 0);
    const threshold = Number(bridge.threshold || 0);
    const ratio = signerCount > 0 ? threshold / signerCount : 0;
    if (
      ratio < Number(policies.minimumBridgeThresholdRatio) ||
      Number(bridge.independentOperators || 0) < Number(policies.minimumBridgeIndependentOperators)
    ) {
      findings.push(
        makeFinding({
          code: "BLK-BRIDGE-001",
          entityType: "bridge",
          entityId: bridge.id,
          discriminator: project.id,
          severity: severityFor(project, "critical", "high"),
          title: "Puente con quorum insuficiente",
          explanation: bridge.name + " no cumple el umbral o independencia mínima de operadores.",
          rootCause: "La seguridad cross-chain depende de un conjunto de validación demasiado concentrado.",
          evidence: {
            projectId: project.id,
            bridgeId: bridge.id,
            signerCount,
            threshold,
            thresholdRatio: Number(ratio.toFixed(4)),
            independentOperators: bridge.independentOperators
          },
          remediation: [
            "Aumentar umbral e independencia operacional antes de elevar límites.",
            "Separar pause guardians del quorum normal y ensayar contención."
          ]
        })
      );
    }
  }

  if (
    project.governance?.model !== "none" &&
    Number(project.governance?.timelockSeconds || 0) <
      Number(policies.minimumGovernanceTimelockSeconds)
  ) {
    findings.push(
      makeFinding({
        code: "BLK-GOV-001",
        entityType: "project",
        entityId: project.id,
        severity: severityFor(project),
        title: "Timelock de gobernanza inferior a política",
        explanation: project.name + " puede ejecutar decisiones antes de la ventana mínima.",
        rootCause: "Gobernanza y respuesta a incidentes compiten sin un retardo preventivo suficiente.",
        evidence: {
          model: project.governance?.model || "unknown",
          timelockSeconds: project.governance?.timelockSeconds || 0,
          policyMinimumSeconds: policies.minimumGovernanceTimelockSeconds
        },
        remediation: [
          "Elevar el timelock y documentar excepciones de emergencia.",
          "Alertar al crear, cancelar y ejecutar cada propuesta."
        ]
      })
    );
  }

  for (const dependency of project.dependencies || []) {
    if (!dependency.pinned || !dependency.provenanceVerified) {
      findings.push(
        makeFinding({
          code: "BLK-SUPPLY-001",
          entityType: "dependency",
          entityId: project.id + ":" + dependency.name,
          severity: severityFor(project, "high", "medium"),
          title: "Dependencia sin fijación o procedencia",
          explanation: dependency.name + " no está completamente fijada y verificada.",
          rootCause: "El build puede incorporar código distinto del revisado sin una señal confiable.",
          evidence: {
            projectId: project.id,
            dependency: dependency.name,
            version: dependency.version,
            pinned: dependency.pinned,
            provenanceVerified: dependency.provenanceVerified
          },
          remediation: [
            "Fijar versión y hash de integridad.",
            "Conservar SBOM, lockfile, attestations y artefactos de build."
          ]
        })
      );
    }
  }

  return findings;
}

export function evaluateEvent(event, approvals, policies) {
  if (event.type === "privileged_role_change") {
    const approved = Boolean(
      event.approvalHash && approvals.some((entry) => entry.hash === event.approvalHash)
    );
    if (!approved) {
      return [
        makeFinding({
          code: "BLK-EVENT-001",
          entityType: "chain-event",
          entityId: event.id,
          severity: "critical",
          title: "Cambio privilegiado sin aprobación conocida",
          explanation: "Se observó un cambio de control que no coincide con una aprobación registrada.",
          rootCause: "El estado on-chain cambió fuera del flujo de autorización observado por RootCause.",
          evidence: {
            projectId: event.projectId,
            contractAddress: event.contractAddress,
            actor: event.actor,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash || null,
            source: event.source
          },
          remediation: [
            "Confirmar el evento en una segunda fuente y preservar evidencia.",
            "Activar el runbook de compromiso administrativo."
          ]
        })
      ];
    }
  }

  if (
    event.type === "value_outflow" &&
    !event.approved &&
    Number(event.amountUsd || 0) >= Number(policies.abnormalOutflowUsd) &&
    Number(event.amountUsd || 0) >= Math.max(Number(event.baselineUsd || 0) * 5, 1)
  ) {
    return [
      makeFinding({
        code: "BLK-FUNDS-001",
        entityType: "chain-event",
        entityId: event.id,
        severity: "critical",
        title: "Salida de valor anómala no aprobada",
        explanation: "El valor observado supera la política y al menos quintuplica la línea base.",
        rootCause: "Un movimiento económico significativo ocurrió fuera del patrón y autorización conocidos.",
        evidence: {
          projectId: event.projectId,
          contractAddress: event.contractAddress,
          amountUsd: event.amountUsd,
          baselineUsd: event.baselineUsd,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash || null
        },
        remediation: [
          "Validar balances y transacción en observadores independientes.",
          "Aplicar el procedimiento humano de contención si el protocolo lo permite."
        ]
      })
    ];
  }

  return [];
}

export function evaluateNode(node, policies) {
  if (!node?.connected) {
    return [
      makeFinding({
        code: "BLK-NODE-001",
        entityType: "node",
        entityId: node?.id || "evm-primary",
        severity: "high",
        title: "Observador RPC no disponible",
        explanation: node?.error || "No fue posible consultar el RPC configurado.",
        rootCause: "RootCause perdió visibilidad independiente del estado de la cadena.",
        evidence: { endpoint: node?.endpoint || null, checkedAt: node?.checkedAt || null },
        remediation: [
          "Verificar proceso, red y autenticación del RPC.",
          "No tomar decisiones críticas desde una única fuente."
        ]
      })
    ];
  }

  const findings = [];
  if (String(node.chainId) !== String(node.expectedChainId)) {
    findings.push(
      makeFinding({
        code: "BLK-NODE-002",
        entityType: "node",
        entityId: node.id,
        severity: "critical",
        title: "RPC conectado a la red equivocada",
        explanation: "El chain ID observado no coincide con el configurado.",
        rootCause: "La fuente de observación apunta a otra red o fue configurada incorrectamente.",
        evidence: { chainId: node.chainId, expectedChainId: node.expectedChainId, endpoint: node.endpoint },
        remediation: [
          "Detener decisiones basadas en este observador.",
          "Corregir endpoint y verificar genesis, chain ID y bloque en una segunda fuente."
        ]
      })
    );
  }

  const lag = Number(node.latestObservedBlockNumber || 0) - Number(node.blockNumber || 0);
  if (lag > Number(policies.maximumObserverLagBlocks)) {
    findings.push(
      makeFinding({
        code: "BLK-NODE-003",
        entityType: "node",
        entityId: node.id,
        severity: "high",
        title: "Observador RPC atrasado",
        explanation: "El observador está " + lag + " bloques detrás de la referencia registrada.",
        rootCause: "La canalización de observación no está procesando la punta esperada.",
        evidence: {
          blockNumber: node.blockNumber,
          latestObservedBlockNumber: node.latestObservedBlockNumber,
          lagBlocks: lag
        },
        remediation: [
          "Revisar sincronización, capacidad, checkpoints y salud del indexador.",
          "Comparar con dos fuentes antes de resolver el incidente."
        ]
      })
    );
  }
  return findings;
}

export function evaluateState(state, context) {
  return [
    ...(state.projects || []).flatMap((project) => evaluateProject(project, context)),
    ...(state.observedEvents || []).flatMap((event) =>
      evaluateEvent(event, state.approvals || [], context.policies)
    ),
    ...evaluateNode(state.node, context.policies),
    ...evaluateWalletPosture(state, context)
  ];
}
