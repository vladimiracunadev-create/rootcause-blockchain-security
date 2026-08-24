// Wallet Security Posture: reglas deterministas sobre cuentas públicas
// vigiladas y eventos on-chain normalizados.
//
// Este módulo nunca toca claves, firmas ni transacciones: evalúa hechos
// públicos (allowances, operadores, permits usados, transferencias, cambios de
// smart account, delegaciones EIP-7702 y actividad) contra la política local.
// La respuesta siempre es un incidente con causa raíz y runbook, nunca una
// acción on-chain.
import crypto from "node:crypto";

export const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;

export const WALLET_EVENT_TYPES = Object.freeze([
  "wallet.allowance.changed",
  "wallet.operator.changed",
  "wallet.permit.used",
  "wallet.transfer.observed",
  "wallet.smart-account.changed",
  "wallet.delegation.changed",
  "wallet.activity.observed"
]);

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

function severityForAccount(account, high = "high", lower = "medium") {
  return ["critical", "high"].includes(account.criticality) ? high : lower;
}

function lower(value) {
  return String(value || "").toLowerCase();
}

function toBigInt(value) {
  try {
    const text = String(value ?? "").trim();
    if (!/^\d{1,78}$/.test(text)) return null;
    return BigInt(text);
  } catch {
    return null;
  }
}

function daysBetween(later, earlier) {
  const a = Date.parse(later || "");
  const b = Date.parse(earlier || "");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return (a - b) / 86400000;
}

function sortChain(events) {
  return [...events].sort(
    (a, b) =>
      Number(a.blockNumber || 0) - Number(b.blockNumber || 0) ||
      Number(a.logIndex || 0) - Number(b.logIndex || 0)
  );
}

function walletPolicies(policies) {
  return policies.wallet || {};
}

function assetPolicyFor(account, wallet, chainId, tokenContract) {
  const token = lower(tokenContract);
  const own = (account.approvalPolicies || []).find(
    (entry) => lower(entry.tokenContract) === token
  );
  if (own) return own;
  return (wallet.assetPolicies || []).find(
    (entry) => lower(entry.tokenContract) === token && String(entry.chainId) === String(chainId)
  );
}

function authorizedSpenders(account, wallet) {
  return new Set(
    [
      ...(account.allowedSpenders || []),
      ...(account.knownCounterparties || []),
      ...(wallet.authorizedSpenders || [])
    ].map(lower)
  );
}

function authorizedOperators(account, wallet) {
  return new Set(
    [...(account.allowedSpenders || []), ...(wallet.authorizedOperators || [])].map(lower)
  );
}

function knownCounterparties(account, wallet) {
  return new Set(
    [
      ...(account.knownCounterparties || []),
      ...(account.allowedSpenders || []),
      ...(account.allowedTokenContracts || []),
      ...(wallet.knownCounterparties || [])
    ].map(lower)
  );
}

function allowedChainIds(account, wallet) {
  const chains = account.smartAccountPolicy?.allowedChainIds?.length
    ? account.smartAccountPolicy.allowedChainIds
    : wallet.allowedChainIds || [];
  return new Set(chains.map(String));
}

function baseEvidence(event) {
  return {
    chainId: event.chainId,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash || null,
    transactionHash: event.transactionHash || null,
    logIndex: event.logIndex,
    walletAddress: event.walletAddress,
    contractAddress: event.contractAddress || null,
    eventType: event.type,
    source: event.source,
    observedAt: event.observedAt
  };
}

// Proyección: para cada (cadena, wallet, token, spender), el último cambio de
// allowance gana. Una revocación (valor cero) apaga la autorización anterior.
export function latestAllowances(events) {
  const map = new Map();
  for (const event of sortChain(events)) {
    if (event.type !== "wallet.allowance.changed") continue;
    const key = [event.chainId, lower(event.walletAddress), lower(event.contractAddress), lower(event.spender)].join("|");
    map.set(key, event);
  }
  return map;
}

export function latestOperators(events) {
  const map = new Map();
  for (const event of sortChain(events)) {
    if (event.type !== "wallet.operator.changed") continue;
    const key = [event.chainId, lower(event.walletAddress), lower(event.contractAddress), lower(event.operator)].join("|");
    map.set(key, event);
  }
  return map;
}

function sharedPrefix(a, b) {
  const left = lower(a).replace(/^0x/, "");
  const right = lower(b).replace(/^0x/, "");
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1;
  return count;
}

function sharedSuffix(a, b) {
  const left = lower(a).replace(/^0x/, "");
  const right = lower(b).replace(/^0x/, "");
  let count = 0;
  while (
    count < left.length &&
    count < right.length &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  )
    count += 1;
  return count;
}

function checkAllowanceRules(account, wallet, allowancesByWallet, findings, now) {
  const spendersOk = authorizedSpenders(account, wallet);
  for (const event of allowancesByWallet) {
    const amount = toBigInt(event.amountRaw);
    if (amount === null || amount === 0n) continue; // revocación o dato inválido: no hay exposición activa
    const asset = assetPolicyFor(account, wallet, event.chainId, event.contractAddress);
    const maximumRaw = asset ? toBigInt(asset.maximumAllowanceRaw) : null;
    const maximumAgeDays = Number(asset?.maximumAgeDays || wallet.maximumAllowanceAgeDays || 0);
    const ageDays = daysBetween(new Date(now).toISOString(), event.observedAt);

    const unlimited = amount === MAX_UINT256;
    const overLimit = maximumRaw !== null && amount > maximumRaw;
    const aged = maximumAgeDays > 0 && ageDays > maximumAgeDays;

    if (unlimited || overLimit || aged) {
      const causes = [];
      if (unlimited) causes.push("allowance igual al máximo del tipo entero (uint256)");
      if (overLimit) causes.push("allowance superior al límite configurado para el activo");
      if (aged) causes.push("allowance activo tras " + Math.floor(ageDays) + " días, sobre el máximo de " + maximumAgeDays);
      findings.push(
        makeFinding({
          code: "BLK-WALLET-001",
          entityType: "wallet-account",
          entityId: account.address,
          discriminator: [event.chainId, event.contractAddress, event.spender].join("|"),
          severity: unlimited || overLimit ? severityForAccount(account, "critical", "high") : severityForAccount(account),
          confidence: "observed",
          title: "Allowance ilimitado o superior a política",
          explanation:
            "La cuenta vigilada mantiene una autorización de gasto activa fuera de política: " +
            causes.join("; ") + ".",
          rootCause:
            "Una autorización de gasto vigente excede el uso declarado y amplía la superficie de pérdida sin límite temporal.",
          policyViolated: asset
            ? "Límite por activo (" + (asset.symbol || event.contractAddress) + ") en la política local"
            : "wallet.maximumAllowanceAgeDays / máximo uint256",
          impact:
            "El spender puede mover el saldo autorizado del token sin ninguna interacción adicional de la cuenta.",
          evidence: {
            ...baseEvidence(event),
            spender: event.spender,
            amountRaw: event.amountRaw,
            decimals: event.decimals ?? null,
            policyMaximumRaw: asset?.maximumAllowanceRaw || null,
            policyMaximumAgeDays: maximumAgeDays || null,
            observedAgeDays: Math.floor(ageDays)
          },
          remediation: [
            "Validar el allowance en dos fuentes independientes (nodo propio y explorador).",
            "Ejecutar la revocación desde un entorno de firma independiente, siguiendo el runbook de exposición de allowance.",
            "Reemplazar aprobaciones ilimitadas por montos acotados y con vencimiento."
          ],
          limitations: [
            "RootCause observa el allowance; no puede revocarlo ni firmar nada.",
            "El monto se evalúa en unidades enteras del token con sus decimales declarados, nunca en un valor fiat inventado."
          ]
        })
      );
    }

    if (!spendersOk.has(lower(event.spender))) {
      findings.push(
        makeFinding({
          code: "BLK-WALLET-002",
          entityType: "wallet-account",
          entityId: account.address,
          discriminator: ["spender", event.chainId, event.contractAddress, event.spender].join("|"),
          severity: severityForAccount(account, "critical", "high"),
          confidence: "observed",
          title: "Spender no reconocido por la política local",
          explanation:
            "Se observó una aprobación hacia un spender que no pertenece a la allowlist local, a los contratos registrados ni a las contrapartes conocidas.",
          rootCause:
            "La cuenta autorizó gasto a una dirección fuera del inventario de contrapartes aprobadas por política.",
          policyViolated: "allowedSpenders / wallet.authorizedSpenders",
          impact:
            "Si la aprobación fue inducida (dApp falsa, drainer), el spender puede vaciar el saldo autorizado.",
          evidence: {
            ...baseEvidence(event),
            spender: event.spender,
            amountRaw: event.amountRaw,
            decimals: event.decimals ?? null
          },
          remediation: [
            "Confirmar en una segunda fuente qué contrato es el spender y quién lo desplegó.",
            "Si no se reconoce, revocar la aprobación desde un entorno independiente según el runbook de spender desconocido.",
            "Si es legítimo, registrarlo en la allowlist local con su propósito documentado."
          ],
          limitations: [
            "«No reconocido por la política local» no significa «malicioso»: RootCause no consulta listas remotas de reputación y no afirma malicia sin evidencia."
          ]
        })
      );
    }
  }
}

function checkOperatorRules(account, wallet, operatorsByWallet, findings, now) {
  const operatorsOk = authorizedOperators(account, wallet);
  for (const event of operatorsByWallet) {
    if (event.approved !== true) continue; // revocación de operador: sin exposición
    const global = event.approvalScope === "all";
    const maximumAgeDays = Number(wallet.maximumOperatorAgeDays || 0);
    const ageDays = daysBetween(new Date(now).toISOString(), event.observedAt);
    const unauthorized = !operatorsOk.has(lower(event.operator));
    const aged = maximumAgeDays > 0 && ageDays > maximumAgeDays;
    if (!unauthorized && !aged) continue;
    findings.push(
      makeFinding({
        code: "BLK-WALLET-003",
        entityType: "wallet-account",
        entityId: account.address,
        discriminator: [event.chainId, event.contractAddress, event.operator].join("|"),
        severity: global
          ? severityForAccount(account, "critical", "high")
          : severityForAccount(account),
        confidence: "observed",
        title: global
          ? "Operador NFT global fuera de política"
          : "Operador NFT fuera de política",
        explanation: global
          ? "Un operador tiene ApprovalForAll sobre TODOS los activos de la colección (" +
            (event.tokenStandard || "ERC-721/1155") +
            ")" +
            (unauthorized ? " y no está autorizado por la política local." : " y sigue activo pasado el plazo previsto.")
          : "Un operador tiene aprobación sobre un token individual fuera de la política local.",
        rootCause: unauthorized
          ? "La colección quedó delegada a un operador que la política local no reconoce."
          : "Un permiso de operador siguió activo después del plazo previsto por política.",
        policyViolated: unauthorized
          ? "wallet.authorizedOperators / allowedSpenders"
          : "wallet.maximumOperatorAgeDays",
        impact: global
          ? "El operador puede transferir cualquier NFT de la colección sin nuevas firmas de la cuenta."
          : "El operador puede transferir el token aprobado.",
        evidence: {
          ...baseEvidence(event),
          operator: event.operator,
          approvalScope: event.approvalScope || "all",
          tokenStandard: event.tokenStandard || null,
          policyMaximumAgeDays: maximumAgeDays || null,
          observedAgeDays: Math.floor(ageDays)
        },
        remediation: [
          "Verificar el operador y el contrato de la colección en dos fuentes independientes.",
          "Revocar el ApprovalForAll desde un entorno de firma independiente según el runbook de operador NFT.",
          "Registrar los operadores legítimos en la política local con vigencia definida."
        ],
        limitations: [
          "La aprobación de un token individual y la autorización global son riesgos distintos: esta regla los reporta por separado."
        ]
      })
    );
  }
}

function checkPermitRules(account, wallet, events, findings) {
  const spendersOk = authorizedSpenders(account, wallet);
  for (const event of events) {
    if (event.type !== "wallet.permit.used") continue;
    const asset = assetPolicyFor(account, wallet, event.chainId, event.contractAddress);
    const amount = toBigInt(event.amountRaw);
    const maximumRaw = asset ? toBigInt(asset.maximumAllowanceRaw) : null;
    const unauthorized = !spendersOk.has(lower(event.spender));
    const overLimit = amount !== null && maximumRaw !== null && amount > maximumRaw;
    const unlimited = amount === MAX_UINT256;
    if (!unauthorized && !overLimit && !unlimited) continue;
    findings.push(
      makeFinding({
        code: "BLK-WALLET-004",
        entityType: "wallet-account",
        entityId: account.address,
        discriminator: [event.chainId, event.transactionHash, event.logIndex].join("|"),
        severity: severityForAccount(account, "critical", "high"),
        confidence: "observed",
        title: "Permit utilizado fuera de política",
        explanation:
          "Se observó on-chain el uso de una autorización firmada (" +
          (event.permitStandard || "EIP-2612/EIP-712") +
          ") " +
          (unauthorized
            ? "por un contrato no registrado en la política local."
            : "con monto o alcance fuera de la política del activo."),
        rootCause:
          "Una firma de autorización off-chain fue consumida por un contrato o con un monto que la política local no contempla.",
        policyViolated: unauthorized
          ? "allowedSpenders / wallet.authorizedSpenders"
          : "Límite por activo en la política local",
        impact:
          "El permit equivale a un approve: el spender puede mover el monto autorizado sin nueva interacción de la cuenta.",
        evidence: {
          ...baseEvidence(event),
          spender: event.spender,
          amountRaw: event.amountRaw,
          decimals: event.decimals ?? null,
          deadline: event.deadline || null,
          permitStandard: event.permitStandard || null,
          policyMaximumRaw: asset?.maximumAllowanceRaw || null
        },
        remediation: [
          "Confirmar el uso del permit en una segunda fuente y preservar la evidencia.",
          "Revocar el allowance resultante desde un entorno independiente según el runbook de permit sospechoso.",
          "Auditar dónde se firmó el permit: la firma pudo capturarse en un sitio o extensión comprometida (dominio de Web Inspector)."
        ],
        limitations: [
          "Limitación fundamental: una firma permit puede permanecer off-chain e invisible hasta que alguien la utilice. RootCause no se conecta a la wallet, por lo que no puede proteger antes de la firma; solo detecta el uso on-chain."
        ]
      })
    );
  }
}

function checkPoisoningRules(account, wallet, events, findings) {
  const known = knownCounterparties(account, wallet);
  const heuristics = wallet.poisoning || {};
  const minimumPrefix = Number(heuristics.minimumPrefixMatch || 4);
  const minimumSuffix = Number(heuristics.minimumSuffixMatch || 4);
  for (const event of events) {
    if (event.type !== "wallet.transfer.observed") continue;
    const counterparty =
      event.direction === "in" ? event.sourceAddress : event.destination || event.counterparty;
    if (!counterparty || known.has(lower(counterparty))) continue;

    // Señal 1 (obligatoria): similitud visual con una contraparte conocida.
    let lookalike = null;
    let prefixMatch = 0;
    let suffixMatch = 0;
    for (const trusted of known) {
      if (lower(trusted) === lower(counterparty)) continue;
      const prefix = sharedPrefix(trusted, counterparty);
      const suffix = sharedSuffix(trusted, counterparty);
      if (prefix >= minimumPrefix || suffix >= minimumSuffix) {
        if (prefix + suffix > prefixMatch + suffixMatch) {
          lookalike = trusted;
          prefixMatch = prefix;
          suffixMatch = suffix;
        }
      }
    }
    if (!lookalike) continue;

    // Señal 2: monto cero, dust o inusual para el activo.
    const asset = assetPolicyFor(account, wallet, event.chainId, event.contractAddress);
    const dustLimit = toBigInt(asset?.dustThresholdRaw ?? wallet.defaultDustThresholdRaw ?? "0");
    const amount = toBigInt(event.amountRaw);
    const dustOrZero =
      amount !== null && (amount === 0n || (dustLimit !== null && dustLimit > 0n && amount <= dustLimit));
    if (!dustOrZero) continue;

    findings.push(
      makeFinding({
        code: "BLK-WALLET-005",
        entityType: "wallet-account",
        entityId: account.address,
        discriminator: [event.chainId, counterparty].join("|"),
        severity: severityForAccount(account, "high", "medium"),
        confidence: "heuristic",
        title: "Posible address poisoning — candidato heurístico",
        explanation:
          "Una dirección visualmente similar a una contraparte conocida (" +
          prefixMatch + " caracteres de prefijo y " + suffixMatch + " de sufijo compartidos) " +
          "envió una transferencia de monto cero o dust y no tiene relación registrada con la cuenta.",
        rootCause:
          "Coinciden varias señales del patrón de envenenamiento de historial: similitud visual, monto dust y ausencia de relación previa.",
        policyViolated: "wallet.poisoning (prefijos y sufijos mínimos, umbral dust por activo)",
        impact:
          "Si un operador copia esta dirección del historial en un pago futuro, los fondos irían al atacante.",
        evidence: {
          ...baseEvidence(event),
          counterparty,
          resemblesKnownCounterparty: lookalike,
          sharedPrefixChars: prefixMatch,
          sharedSuffixChars: suffixMatch,
          amountRaw: event.amountRaw,
          decimals: event.decimals ?? null,
          dustThresholdRaw: asset?.dustThresholdRaw ?? wallet.defaultDustThresholdRaw ?? null
        },
        remediation: [
          "No copiar nunca direcciones desde el historial: usar la libreta de direcciones verificada.",
          "Marcar la dirección como sospechosa en el registro local y avisar a los operadores de la cuenta.",
          "Verificar en dos fuentes las últimas transferencias salientes por si alguna ya usó la dirección similar."
        ],
        limitations: [
          "Es un CANDIDATO heurístico, no un ataque confirmado: direcciones vanity, contratos de fábrica y exchanges producen similitudes legítimas.",
          "La similitud por sí sola nunca dispara esta regla: se exige además monto cero o dust y ausencia de relación registrada."
        ]
      })
    );
  }
}

function checkSmartAccountRules(account, wallet, events, approvals, findings) {
  const policy = account.smartAccountPolicy || {};
  const expectedOwners = new Set((policy.expectedOwners || []).map(lower));
  const expectedGuardians = new Set((policy.expectedGuardians || []).map(lower));
  const expectedModules = new Set((policy.expectedModules || []).map(lower));
  for (const event of events) {
    if (event.type !== "wallet.smart-account.changed") continue;
    const approved = Boolean(
      event.approvalHash && approvals.some((entry) => entry.hash === event.approvalHash)
    );
    if (approved) continue;
    const kind = event.changeKind || "unknown";
    const subject = lower(event.subject || "");
    const expectedByPolicy =
      (kind === "owner-added" && expectedOwners.has(subject)) ||
      (kind === "guardian-changed" && expectedGuardians.has(subject)) ||
      ((kind === "module-enabled" || kind === "module-disabled") && expectedModules.has(subject)) ||
      (kind === "threshold-changed" &&
        Number(event.newThreshold || 0) === Number(policy.expectedThreshold || -1)) ||
      (kind === "implementation-upgraded" && subject === lower(policy.expectedImplementation || ""));
    if (expectedByPolicy) continue;
    findings.push(
      makeFinding({
        code: "BLK-WALLET-006",
        entityType: "wallet-account",
        entityId: account.address,
        discriminator: [event.chainId, event.transactionHash, event.logIndex].join("|"),
        severity: "critical",
        confidence: "observed",
        title: "Cambio inesperado en smart account",
        explanation:
          "Se observó un cambio de configuración de la smart account (" +
          kind +
          ") sin aprobación registrada y fuera de la configuración esperada.",
        rootCause:
          "El plano de control de la cuenta cambió fuera del flujo de autorización que la política local conoce.",
        policyViolated: "smartAccountPolicy (propietarios, guardianes, módulos, umbral e implementación esperados)",
        impact:
          "Un propietario, módulo o implementación no previstos pueden controlar los fondos y la lógica de la cuenta.",
        evidence: {
          ...baseEvidence(event),
          changeKind: kind,
          subject: event.subject || null,
          newThreshold: event.newThreshold ?? null,
          approvalHash: event.approvalHash || null,
          correlatedRule: "BLK-EVENT-001 cubre el mismo patrón sobre contratos del proyecto; este hallazgo aplica a la cuenta vigilada y no se duplica."
        },
        remediation: [
          "Confirmar el cambio en dos fuentes independientes y preservar la evidencia.",
          "Activar el runbook de cambio de propietario o guardián: contención desde un entorno no comprometido.",
          "Si el cambio era legítimo, registrar su aprobación con hash para que el patrón quede documentado."
        ],
        limitations: [
          "RootCause solo ve eventos públicos: un cambio aprobado fuera de banda aparecerá aquí hasta que su aprobación se registre localmente."
        ]
      })
    );
  }
}

function checkDelegationRules(account, wallet, events, approvals, findings) {
  const policy = account.smartAccountPolicy || {};
  const expectedDelegate = lower(policy.expectedDelegate || "");
  const chainsOk = allowedChainIds(account, wallet);
  for (const event of events) {
    if (event.type !== "wallet.delegation.changed") continue;
    const delegate = lower(event.delegate || "");
    const approved = Boolean(
      event.approvalHash && approvals.some((entry) => entry.hash === event.approvalHash)
    );
    const chainAllowed = chainsOk.size === 0 || chainsOk.has(String(event.chainId));
    const delegateExpected = delegate !== "" && delegate === expectedDelegate;
    if ((delegateExpected || approved || delegate === "") && chainAllowed) continue;
    findings.push(
      makeFinding({
        code: "BLK-WALLET-007",
        entityType: "wallet-account",
        entityId: account.address,
        discriminator: [event.chainId, event.delegate || "removed"].join("|"),
        severity: severityForAccount(account, "critical", "high"),
        confidence: "observed",
        title: "Delegación EOA (EIP-7702) inesperada",
        explanation: !chainAllowed
          ? "La EOA vigilada adquirió una delegación EIP-7702 en una cadena fuera de la política local."
          : "La EOA vigilada delegó su ejecución a una implementación que no está registrada en la política local.",
        rootCause:
          "El código que se ejecuta en nombre de la EOA cambió fuera de la configuración esperada, sin evidencia de aprobación previa.",
        policyViolated: !chainAllowed
          ? "wallet.allowedChainIds / smartAccountPolicy.allowedChainIds"
          : "smartAccountPolicy.expectedDelegate",
        impact:
          "La implementación delegada ejecuta con la autoridad de la EOA: puede mover fondos y aprobar gasto en su nombre.",
        evidence: {
          ...baseEvidence(event),
          delegate: event.delegate || null,
          expectedDelegate: policy.expectedDelegate || null,
          allowedChainIds: [...chainsOk],
          approvalHash: event.approvalHash || null
        },
        remediation: [
          "Confirmar la delegación (designator 0xef0100 + dirección) en dos fuentes independientes.",
          "Activar el runbook de delegación EIP-7702 inesperada: contención desde un entorno independiente.",
          "Si la delegación es de diseño, registrar la implementación esperada en smartAccountPolicy.expectedDelegate."
        ],
        limitations: [
          "Una EOA con código delegado no está necesariamente comprometida: EIP-7702 es un mecanismo legítimo. Esta regla reporta la desviación respecto de la política, no supone malicia."
        ]
      })
    );
  }
}

function checkActivityRules(account, wallet, walletEvents, findings) {
  const chainsOk = allowedChainIds(account, wallet);
  const known = knownCounterparties(account, wallet);
  const dormantDays = Number(
    account.dormancyPolicy?.dormantAfterDays || wallet.dormancyDays || 0
  );
  const window = account.expectedActivity?.activeHours || wallet.operatingWindow || null;
  const ordered = [...walletEvents].sort((a, b) =>
    String(a.observedAt).localeCompare(String(b.observedAt))
  );

  let previousAt = null;
  for (const event of ordered) {
    // Reactivación tras inactividad: aplica a cualquier evento observado.
    if (
      dormantDays > 0 &&
      previousAt &&
      daysBetween(event.observedAt, previousAt) > dormantDays &&
      ["critical", "high"].includes(account.criticality)
    ) {
      findings.push(
        makeFinding({
          code: "BLK-WALLET-008",
          entityType: "wallet-account",
          entityId: account.address,
          discriminator: ["reactivation", event.chainId, event.transactionHash, event.logIndex].join("|"),
          severity: severityForAccount(account, "critical", "high"),
          confidence: "observed",
          title: "Actividad inesperada: wallet crítica reactivada",
          explanation:
            "La cuenta vigilada estuvo inactiva " +
            Math.floor(daysBetween(event.observedAt, previousAt)) +
            " días (política: " + dormantDays + ") y volvió a operar.",
          rootCause:
            "Una cuenta declarada de baja actividad se movió fuera de su patrón, lo que puede indicar compromiso o uso no coordinado.",
          policyViolated: "dormancyPolicy.dormantAfterDays",
          impact: "Si la clave fue comprometida, la reactivación suele preceder al vaciado.",
          evidence: {
            ...baseEvidence(event),
            previousActivityAt: previousAt,
            dormantDaysObserved: Math.floor(daysBetween(event.observedAt, previousAt)),
            policyDormantDays: dormantDays
          },
          remediation: [
            "Confirmar con los operadores si la actividad fue intencional.",
            "Si nadie la reconoce, activar el runbook de wallet administrativa posiblemente comprometida.",
            "Las salidas de valor anómalas se correlacionan con BLK-FUNDS-001; no se genera un segundo incidente por el mismo hecho."
          ],
          limitations: [
            "Reactivación no implica compromiso: la regla reporta la desviación del patrón declarado."
          ]
        })
      );
    }
    previousAt = event.observedAt;

    if (event.type !== "wallet.activity.observed") continue;

    // Cadena no autorizada.
    if (chainsOk.size > 0 && !chainsOk.has(String(event.chainId))) {
      findings.push(
        makeFinding({
          code: "BLK-WALLET-008",
          entityType: "wallet-account",
          entityId: account.address,
          discriminator: ["chain", event.chainId, event.transactionHash, event.logIndex].join("|"),
          severity: severityForAccount(account, "critical", "high"),
          confidence: "observed",
          title: "Actividad inesperada: operación en una red no autorizada",
          explanation:
            "La cuenta operó en la cadena " + event.chainId + ", que no está en la lista de cadenas permitidas.",
          rootCause: "La cuenta se usó fuera del perímetro de redes que la política local autoriza.",
          policyViolated: "wallet.allowedChainIds",
          impact: "Las réplicas de la clave en cadenas no vigiladas quedan fuera de todo control y monitoreo.",
          evidence: { ...baseEvidence(event), allowedChainIds: [...chainsOk] },
          remediation: [
            "Confirmar quién operó en esa red y con qué propósito.",
            "Si la red es legítima, añadirla a la política y a la cobertura de observación."
          ],
          limitations: ["La detección requiere que un adaptador entregue el hecho de esa red."]
        })
      );
      continue;
    }

    // Fuera de la ventana operativa declarada.
    if (window && Number.isFinite(Number(window.startHour)) && Number.isFinite(Number(window.endHour))) {
      const hour = new Date(event.observedAt).getUTCHours();
      const inside =
        Number(window.startHour) <= Number(window.endHour)
          ? hour >= Number(window.startHour) && hour < Number(window.endHour)
          : hour >= Number(window.startHour) || hour < Number(window.endHour);
      if (!inside) {
        findings.push(
          makeFinding({
            code: "BLK-WALLET-008",
            entityType: "wallet-account",
            entityId: account.address,
            discriminator: ["window", event.chainId, event.transactionHash, event.logIndex].join("|"),
            severity: severityForAccount(account),
            confidence: "observed",
            title: "Actividad inesperada: operación fuera de la ventana declarada",
            explanation:
              "La cuenta operó a las " + hour + ":00 UTC, fuera de la ventana operativa declarada (" +
              window.startHour + ":00–" + window.endHour + ":00 UTC).",
            rootCause: "La operación no coincide con el patrón horario que los operadores declararon.",
            policyViolated: "expectedActivity.activeHours / wallet.operatingWindow",
            impact: "La actividad fuera de horario es una señal temprana común de uso no autorizado de la clave.",
            evidence: { ...baseEvidence(event), observedHourUtc: hour, window },
            remediation: [
              "Confirmar con los operadores si la operación fue intencional.",
              "Ajustar la ventana declarada si el patrón operativo real cambió."
            ],
            limitations: ["La ventana es una declaración del operador, no un hecho verificado."]
          })
        );
        continue;
      }
    }

    // Contraparte nueva no permitida.
    if (event.counterparty && !known.has(lower(event.counterparty))) {
      findings.push(
        makeFinding({
          code: "BLK-WALLET-008",
          entityType: "wallet-account",
          entityId: account.address,
          discriminator: ["counterparty", event.chainId, event.counterparty].join("|"),
          severity: severityForAccount(account),
          confidence: "observed",
          title: "Actividad inesperada: interacción con una nueva contraparte",
          explanation:
            "La cuenta interactuó con una dirección que no figura entre las contrapartes conocidas de la política local.",
          rootCause: "La cuenta salió del perímetro de contrapartes que la política declara.",
          policyViolated: "knownCounterparties / wallet.knownCounterparties",
          impact: "Una contraparte no revisada puede ser un contrato hostil o una dirección de exfiltración.",
          evidence: { ...baseEvidence(event), counterparty: event.counterparty },
          remediation: [
            "Identificar la contraparte en dos fuentes y documentar la relación.",
            "Si es legítima, registrarla en knownCounterparties; si no, activar el runbook de actividad anómala."
          ],
          limitations: [
            "Nueva no significa hostil: la regla reporta la desviación de la política, no atribuye intención."
          ]
        })
      );
    }
  }
}

// Punto de entrada del dominio wallet: cuentas vigiladas + eventos normalizados
// + aprobaciones registradas → hallazgos. Sin efectos, sin red, sin firmas.
export function evaluateWalletPosture(state, context) {
  const findings = [];
  const policies = context.policies || {};
  const wallet = walletPolicies(policies);
  const now = new Date(context.now || Date.now()).getTime();
  const accounts = state.watchedAccounts || [];
  const events = state.walletEvents || [];
  const approvals = state.approvals || [];

  const allowances = latestAllowances(events);
  const operators = latestOperators(events);

  for (const account of accounts) {
    const address = lower(account.address);
    const ownEvents = events.filter((event) => lower(event.walletAddress) === address);
    const ownAllowances = [...allowances.values()].filter(
      (event) => lower(event.walletAddress) === address
    );
    const ownOperators = [...operators.values()].filter(
      (event) => lower(event.walletAddress) === address
    );

    checkAllowanceRules(account, wallet, ownAllowances, findings, now);
    checkOperatorRules(account, wallet, ownOperators, findings, now);
    checkPermitRules(account, wallet, ownEvents, findings);
    checkPoisoningRules(account, wallet, ownEvents, findings);
    checkSmartAccountRules(account, wallet, ownEvents, approvals, findings);
    checkDelegationRules(account, wallet, ownEvents, approvals, findings);
    checkActivityRules(account, wallet, ownEvents, findings);
  }
  return findings;
}

// Resumen de postura para el panel: proyecciones y contadores, sin re-evaluar.
export function walletPostureSummary(state) {
  const accounts = state.watchedAccounts || [];
  const events = state.walletEvents || [];
  const incidents = (state.incidents || []).filter(
    (incident) =>
      incident.code?.startsWith("BLK-WALLET-") &&
      ["open", "acknowledged"].includes(incident.status)
  );
  const allowances = [...latestAllowances(events).values()].filter((event) => {
    const amount = toBigInt(event.amountRaw);
    return amount !== null && amount > 0n;
  });
  const operators = [...latestOperators(events).values()].filter(
    (event) => event.approved === true
  );
  const byCode = (code) => incidents.filter((incident) => incident.code === code).length;
  return {
    accounts: accounts.length,
    smartAccounts: accounts.filter((account) =>
      ["smart-account", "multisig", "contract-account"].includes(account.accountType)
    ).length,
    activeAllowances: allowances.length,
    unlimitedAllowances: allowances.filter(
      (event) => toBigInt(event.amountRaw) === MAX_UINT256
    ).length,
    activeOperators: operators.length,
    delegations: events.filter(
      (event) => event.type === "wallet.delegation.changed" && event.delegate
    ).length,
    unrecognizedSpenders: byCode("BLK-WALLET-002"),
    smartAccountChanges: byCode("BLK-WALLET-006") + byCode("BLK-WALLET-007"),
    unexpectedActivity: byCode("BLK-WALLET-008"),
    poisoningCandidates: byCode("BLK-WALLET-005"),
    openIncidents: incidents.length
  };
}
