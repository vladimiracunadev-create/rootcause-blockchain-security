// Motor de indicadores investigativos.
//
// Regla epistémica de todo este módulo: un indicador NO afirma culpabilidad, no
// atribuye identidad y no concluye nada. Dice "este patrón reproducible aparece
// en estos hechos observados, con esta confianza, y así es como podría ser un
// falso positivo". La decisión la toma una persona.
//
// Cada detector es determinista: mismas transacciones y mismos umbrales
// producen exactamente el mismo conjunto de indicadores, en el mismo orden.
import { stableId, toBigInt, formatAmount } from "./model.js";

export const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

function time(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part, whole) {
  if (!whole) return 0;
  return Number(((part * 10000n) / whole)) / 100;
}

function shortAddress(key) {
  const address = String(key).split(":").pop() || "";
  return address.length > 18 ? address.slice(0, 10) + "…" + address.slice(-6) : address;
}

/**
 * Confianza del indicador. Parte del valor por defecto del catálogo y se ajusta
 * hacia abajo si la fuente es poco fiable: una señal fuerte sobre un dato
 * dudoso no es una señal fuerte.
 */
function deriveConfidence(defaultConfidence, reliability, strong = false) {
  const order = ["low", "medium", "high"];
  let index = Math.max(0, order.indexOf(defaultConfidence));
  if (strong && index < 2) index += 1;
  if (reliability < 0.5 && index > 0) index -= 1;
  if (reliability < 0.35) index = 0;
  return order[index];
}

function aggregateSource(transactions) {
  const sources = transactions.map((transaction) => transaction.source).filter(Boolean);
  if (!sources.length) return { kind: "unknown", reliability: 0.3, ids: [] };
  const reliability = Math.min(...sources.map((source) => Number(source.reliability) || 0.3));
  return {
    kind: [...new Set(sources.map((source) => source.kind))].sort().join(","),
    reliability,
    ids: [...new Set(sources.map((source) => source.id))].sort().slice(0, 5)
  };
}

function makeIndicator(catalogEntry, input) {
  const source = aggregateSource(input.transactions || []);
  return {
    id: stableId("indicator", catalogEntry.id, input.subject, input.discriminator || ""),
    indicator: catalogEntry.id,
    family: catalogEntry.family,
    title: catalogEntry.title,
    description: catalogEntry.description,
    severity: input.severity || catalogEntry.severity,
    confidence: deriveConfidence(catalogEntry.defaultConfidence, source.reliability, input.strong),
    epistemicLevel: "indicator",
    network: input.network,
    subject: input.subject,
    explanation: input.explanation,
    evidence: input.evidence,
    relatedTransactions: [...new Set((input.transactions || []).map((entry) => entry.txid))].slice(0, 50),
    thresholdsApplied: input.thresholds || {},
    falsePositives: catalogEntry.falsePositives,
    recommendedAction: catalogEntry.recommendedAction,
    source,
    detectedAt: input.detectedAt
  };
}

// ── Índice de actividad por dirección ───────────────────────────────────────

function buildActivityIndex(transactions) {
  const index = new Map();

  function entryFor(network, address) {
    const key = network + ":" + address;
    let entry = index.get(key);
    if (!entry) {
      entry = { key, network, address, incoming: [], outgoing: [], transactions: new Map() };
      index.set(key, entry);
    }
    return entry;
  }

  for (const transaction of transactions) {
    for (const transfer of transaction.transfers || []) {
      const record = {
        txid: transaction.txid,
        transaction,
        transfer,
        at: time(transaction.timestamp),
        amount: toBigInt(transfer.amountRaw) ?? 0n
      };
      if (transfer.from) {
        const entry = entryFor(transaction.network, transfer.from);
        entry.outgoing.push({ ...record, counterparty: transfer.to });
        entry.transactions.set(transaction.txid, transaction);
      }
      if (transfer.to) {
        const entry = entryFor(transaction.network, transfer.to);
        entry.incoming.push({ ...record, counterparty: transfer.from });
        entry.transactions.set(transaction.txid, transaction);
      }
    }
  }

  for (const entry of index.values()) {
    entry.incoming.sort((a, b) => a.at - b.at || a.txid.localeCompare(b.txid));
    entry.outgoing.sort((a, b) => a.at - b.at || a.txid.localeCompare(b.txid));
    entry.all = [...entry.incoming, ...entry.outgoing].sort(
      (a, b) => a.at - b.at || a.txid.localeCompare(b.txid)
    );
  }
  return index;
}

/** Máximo de contrapartes distintas dentro de una ventana deslizante. */
function peakUniqueCounterparties(records, windowMs) {
  let best = { count: 0, window: [] };
  for (let start = 0; start < records.length; start += 1) {
    const window = [];
    const unique = new Set();
    for (let end = start; end < records.length; end += 1) {
      if (records[end].at - records[start].at > windowMs) break;
      if (records[end].counterparty) unique.add(records[end].counterparty);
      window.push(records[end]);
    }
    if (unique.size > best.count) best = { count: unique.size, window, sources: [...unique].sort() };
  }
  return best;
}

// ── Detectores ──────────────────────────────────────────────────────────────

function detectFanIn(entry, catalog, thresholds, now) {
  const config = thresholds["INT-FLOW-001"];
  const peak = peakUniqueCounterparties(entry.incoming, config.windowHours * HOUR_MS);
  if (peak.count < config.minimumSources) return null;
  return makeIndicator(catalog["INT-FLOW-001"], {
    subject: entry.key,
    network: entry.network,
    detectedAt: now,
    strong: peak.count >= config.minimumSources * 2,
    explanation:
      "La dirección " + shortAddress(entry.key) + " recibió fondos desde " + peak.count +
      " direcciones distintas en una ventana de " + config.windowHours +
      " horas (umbral: " + config.minimumSources + ").",
    evidence: {
      uniqueSources: peak.count,
      windowHours: config.windowHours,
      transfersInWindow: peak.window.length,
      sampleSources: (peak.sources || []).slice(0, 10)
    },
    thresholds: config,
    transactions: peak.window.map((record) => record.transaction)
  });
}

function detectFanOut(entry, catalog, thresholds, now) {
  const config = thresholds["INT-FLOW-002"];
  const peak = peakUniqueCounterparties(entry.outgoing, config.windowHours * HOUR_MS);
  if (peak.count < config.minimumDestinations) return null;
  return makeIndicator(catalog["INT-FLOW-002"], {
    subject: entry.key,
    network: entry.network,
    detectedAt: now,
    strong: peak.count >= config.minimumDestinations * 2,
    explanation:
      "La dirección " + shortAddress(entry.key) + " distribuyó fondos hacia " + peak.count +
      " destinos distintos en una ventana de " + config.windowHours +
      " horas (umbral: " + config.minimumDestinations + ").",
    evidence: {
      uniqueDestinations: peak.count,
      windowHours: config.windowHours,
      transfersInWindow: peak.window.length,
      sampleDestinations: (peak.sources || []).slice(0, 10)
    },
    thresholds: config,
    transactions: peak.window.map((record) => record.transaction)
  });
}

/** Cadena de saltos rápidos: sigue el valor mientras conserve la mayor parte. */
function detectRapidHops(entry, index, catalog, thresholds, now) {
  const config = thresholds["INT-FLOW-003"];
  const maximumGap = config.maximumMinutesBetweenHops * 60000;
  let best = null;

  for (const first of entry.outgoing) {
    const chain = [first];
    let current = first;
    const visited = new Set([entry.key]);
    while (chain.length < 12) {
      const nextEntry = index.get(current.transaction.network + ":" + current.counterparty);
      if (!nextEntry || visited.has(nextEntry.key)) break;
      visited.add(nextEntry.key);
      const hop = nextEntry.outgoing.find(
        (record) =>
          record.at >= current.at &&
          record.at - current.at <= maximumGap &&
          current.amount > 0n &&
          percent(record.amount, current.amount) >= config.minimumValueRetainedPercent
      );
      if (!hop) break;
      chain.push(hop);
      current = hop;
    }
    if (chain.length >= config.minimumHops && (!best || chain.length > best.length)) best = chain;
  }
  if (!best) return null;

  const elapsedMinutes = Math.round((best[best.length - 1].at - best[0].at) / 60000);
  return makeIndicator(catalog["INT-FLOW-003"], {
    subject: entry.key,
    network: entry.network,
    detectedAt: now,
    strong: best.length >= config.minimumHops + 2,
    explanation:
      "El valor salido de " + shortAddress(entry.key) + " atravesó " + best.length +
      " direcciones encadenadas conservando al menos el " + config.minimumValueRetainedPercent +
      " % en cada salto, con menos de " + config.maximumMinutesBetweenHops + " minutos entre saltos.",
    evidence: {
      hops: best.length,
      elapsedMinutes: Math.max(0, elapsedMinutes),
      path: [entry.key, ...best.map((record) => record.transaction.network + ":" + record.counterparty)],
      amountsRaw: best.map((record) => record.amount.toString())
    },
    thresholds: config,
    transactions: best.map((record) => record.transaction)
  });
}

/** Peeling chain: en cada eslabón se desprende poco y el resto sigue viaje. */
function detectPeelingChain(entry, index, catalog, thresholds, now) {
  const config = thresholds["INT-FLOW-004"];
  let bestChain = null;

  for (const start of entry.outgoing) {
    const links = [];
    let currentKey = entry.key;
    let guard = 0;
    while (guard++ < 12) {
      const current = index.get(currentKey);
      if (!current) break;
      const spend = current.transactions;
      let link = null;
      for (const transaction of spend.values()) {
        if (time(transaction.timestamp) < start.at) continue;
        const outgoing = (transaction.transfers || []).filter(
          (transfer) => transfer.from === currentKey.split(":").slice(1).join(":")
        );
        if (outgoing.length < 2) continue;
        const sorted = [...outgoing].sort((a, b) => {
          const left = toBigInt(a.amountRaw) ?? 0n;
          const right = toBigInt(b.amountRaw) ?? 0n;
          return left < right ? 1 : left > right ? -1 : 0;
        });
        const remainder = toBigInt(sorted[0].amountRaw) ?? 0n;
        const peel = toBigInt(sorted[1].amountRaw) ?? 0n;
        const total = outgoing.reduce((sum, transfer) => sum + (toBigInt(transfer.amountRaw) ?? 0n), 0n);
        if (total === 0n) continue;
        if (
          percent(remainder, total) >= config.minimumRemainderPercent &&
          percent(peel, total) <= config.maximumPeelPercent &&
          sorted[0].to
        ) {
          link = { transaction, remainder: sorted[0], peel: sorted[1], total };
          break;
        }
      }
      if (!link) break;
      links.push(link);
      currentKey = link.transaction.network + ":" + link.remainder.to;
    }
    if (links.length >= config.minimumLinks && (!bestChain || links.length > bestChain.length)) {
      bestChain = links;
    }
  }
  if (!bestChain) return null;

  return makeIndicator(catalog["INT-FLOW-004"], {
    subject: entry.key,
    network: entry.network,
    detectedAt: now,
    strong: bestChain.length >= config.minimumLinks + 2,
    explanation:
      "Se observó una cadena de " + bestChain.length +
      " eslabones en la que cada transacción desprende como máximo el " + config.maximumPeelPercent +
      " % del valor y traslada el resto a una dirección nueva.",
    evidence: {
      links: bestChain.length,
      peelAmountsRaw: bestChain.map((link) => link.peel.amountRaw),
      remainderAmountsRaw: bestChain.map((link) => link.remainder.amountRaw),
      remainderPath: bestChain.map((link) => link.remainder.to)
    },
    thresholds: config,
    transactions: bestChain.map((link) => link.transaction)
  });
}

function detectSuddenActivity(entry, catalog, thresholds, now) {
  const config = thresholds["INT-BEHAV-001"];
  const records = entry.all;
  if (records.length < config.burstTransfers + 1) return null;
  for (let index = 1; index < records.length; index += 1) {
    const gapDays = (records[index].at - records[index - 1].at) / DAY_MS;
    if (gapDays < config.dormantDays) continue;
    const burst = records.filter(
      (record) =>
        record.at >= records[index].at && record.at - records[index].at <= config.burstWindowHours * HOUR_MS
    );
    if (burst.length < config.burstTransfers) continue;
    return makeIndicator(catalog["INT-BEHAV-001"], {
      subject: entry.key,
      network: entry.network,
      detectedAt: now,
      discriminator: String(records[index].at),
      explanation:
        "La dirección " + shortAddress(entry.key) + " estuvo inactiva " + Math.floor(gapDays) +
        " días y luego concentró " + burst.length + " operaciones en " + config.burstWindowHours + " horas.",
      evidence: {
        dormantDays: Math.floor(gapDays),
        lastActivityBefore: new Date(records[index - 1].at).toISOString(),
        reactivatedAt: new Date(records[index].at).toISOString(),
        burstTransfers: burst.length
      },
      thresholds: config,
      transactions: burst.map((record) => record.transaction)
    });
  }
  return null;
}

function detectStructuring(entry, catalog, thresholds, now) {
  const config = thresholds["INT-BEHAV-002"];
  const windowMs = config.windowHours * HOUR_MS;
  for (const anchor of entry.outgoing) {
    if (anchor.amount === 0n) continue;
    const tolerance = (anchor.amount * BigInt(Math.round(config.amountTolerancePercent * 100))) / 10000n;
    const similar = entry.outgoing.filter(
      (record) =>
        Math.abs(record.at - anchor.at) <= windowMs &&
        record.amount >= anchor.amount - tolerance &&
        record.amount <= anchor.amount + tolerance
    );
    if (similar.length < config.minimumRepeats) continue;
    return makeIndicator(catalog["INT-BEHAV-002"], {
      subject: entry.key,
      network: entry.network,
      detectedAt: now,
      discriminator: anchor.amount.toString(),
      explanation:
        "La dirección " + shortAddress(entry.key) + " realizó " + similar.length +
        " transferencias de importe casi idéntico (±" + config.amountTolerancePercent +
        " %) dentro de " + config.windowHours + " horas.",
      evidence: {
        repeats: similar.length,
        referenceAmountRaw: anchor.amount.toString(),
        referenceAmount: formatAmount(anchor.amount.toString(), anchor.transfer.decimals),
        asset: anchor.transfer.asset,
        tolerancePercent: config.amountTolerancePercent,
        destinations: [...new Set(similar.map((record) => record.counterparty))].filter(Boolean).slice(0, 10)
      },
      thresholds: config,
      transactions: similar.map((record) => record.transaction)
    });
  }
  return null;
}

function detectCoordination(index, catalog, thresholds, now) {
  const config = thresholds["INT-BEHAV-003"];
  const windowMs = config.windowMinutes * 60000;
  const results = [];
  for (const entry of [...index.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    if (entry.incoming.length < config.minimumAddresses) continue;
    for (let start = 0; start < entry.incoming.length; start += 1) {
      const window = entry.incoming.filter(
        (record) =>
          record.at >= entry.incoming[start].at && record.at - entry.incoming[start].at <= windowMs
      );
      const senders = [...new Set(window.map((record) => record.counterparty))].filter(Boolean);
      if (senders.length < config.minimumAddresses) continue;
      results.push(
        makeIndicator(catalog["INT-BEHAV-003"], {
          subject: entry.key,
          network: entry.network,
          detectedAt: now,
          discriminator: String(entry.incoming[start].at),
          explanation:
            senders.length + " direcciones distintas enviaron fondos a " + shortAddress(entry.key) +
            " dentro de una ventana de " + config.windowMinutes +
            " minutos, patrón compatible con control común (hipótesis, no confirmación).",
          evidence: {
            coordinatedSenders: senders.length,
            windowMinutes: config.windowMinutes,
            senders: senders.slice(0, 10),
            firstAt: new Date(entry.incoming[start].at).toISOString()
          },
          thresholds: config,
          transactions: window.map((record) => record.transaction)
        })
      );
      break;
    }
  }
  return results;
}

function detectBehaviourChange(entry, catalog, thresholds, now) {
  const config = thresholds["INT-BEHAV-004"];
  const records = entry.outgoing;
  if (records.length <= config.baselineMinimumTransactions) return null;
  const cutoff = time(now) - DAY_MS;
  const baseline = records.filter((record) => record.at < cutoff);
  const recent = records.filter((record) => record.at >= cutoff);
  if (baseline.length < config.baselineMinimumTransactions || !recent.length) return null;

  const baselineSpanDays = Math.max(
    1,
    (baseline[baseline.length - 1].at - baseline[0].at) / DAY_MS
  );
  const baselineTotal = baseline.reduce((sum, record) => sum + record.amount, 0n);
  const baselineDaily = baselineTotal / BigInt(Math.ceil(baselineSpanDays));
  const recentTotal = recent.reduce((sum, record) => sum + record.amount, 0n);
  const baselineDestinations = new Set(baseline.map((record) => record.counterparty).filter(Boolean));
  const recentDestinations = [...new Set(recent.map((record) => record.counterparty).filter(Boolean))];
  const newDestinations = recentDestinations.filter((address) => !baselineDestinations.has(address));
  const newRatio = recentDestinations.length ? newDestinations.length / recentDestinations.length : 0;

  const volumeSpike =
    baselineDaily > 0n && recentTotal >= baselineDaily * BigInt(config.volumeMultiplier);
  const destinationShift = newRatio >= config.newDestinationRatio;
  if (!volumeSpike && !destinationShift) return null;

  const reasons = [];
  if (volumeSpike) reasons.push("el volumen de las últimas 24 h multiplica por " + config.volumeMultiplier + " la media diaria de su línea base");
  if (destinationShift) reasons.push("el " + Math.round(newRatio * 100) + " % de sus destinos recientes no aparece en su historial");

  return makeIndicator(catalog["INT-BEHAV-004"], {
    subject: entry.key,
    network: entry.network,
    detectedAt: now,
    strong: volumeSpike && destinationShift,
    explanation:
      "El comportamiento reciente de " + shortAddress(entry.key) + " se aparta de su línea base: " +
      reasons.join(" y ") + ".",
    evidence: {
      baselineTransactions: baseline.length,
      baselineSpanDays: Math.round(baselineSpanDays),
      baselineDailyVolumeRaw: baselineDaily.toString(),
      recentTransactions: recent.length,
      recentVolumeRaw: recentTotal.toString(),
      newDestinationRatio: Number(newRatio.toFixed(2)),
      newDestinations: newDestinations.slice(0, 10)
    },
    thresholds: config,
    transactions: recent.map((record) => record.transaction)
  });
}

function detectFlaggedExposure(entry, catalog, thresholds, registries, now) {
  const results = [];
  const flagged = registries.flaggedContracts || new Map();
  const drainers = registries.drainers || new Map();

  const touched = new Map();
  for (const record of entry.all) {
    const candidates = [record.counterparty, record.transaction.contractAddress].filter(Boolean);
    for (const candidate of candidates) {
      const key = entry.network + ":" + candidate;
      if (!touched.has(key)) touched.set(key, []);
      touched.get(key).push(record);
    }
  }

  for (const [key, records] of [...touched.entries()].sort()) {
    const drainer = drainers.get(key);
    if (drainer) {
      results.push(
        makeIndicator(catalog["INT-EXPO-004"], {
          subject: entry.key,
          network: entry.network,
          detectedAt: now,
          discriminator: key,
          explanation:
            "La dirección interactuó con " + shortAddress(key) +
            ", incluida en el conjunto local de drainers con la etiqueta «" + (drainer.label || "sin etiqueta") + "».",
          evidence: {
            counterparty: key,
            localLabel: drainer.label || null,
            localFlagReason: drainer.flagReason || null,
            interactions: records.length,
            registryProvenance: drainer.source || null,
            caveat: "La marca proviene del registro LOCAL del operador, no de un servicio remoto de reputación."
          },
          thresholds: thresholds["INT-EXPO-004"],
          transactions: records.map((record) => record.transaction)
        })
      );
      continue;
    }
    const contract = flagged.get(key);
    if (contract?.flagged) {
      results.push(
        makeIndicator(catalog["INT-EXPO-001"], {
          subject: entry.key,
          network: entry.network,
          detectedAt: now,
          discriminator: key,
          explanation:
            "La dirección interactuó " + records.length + " vez/veces con el contrato " + shortAddress(key) +
            ", marcado localmente como «" + (contract.flagReason || contract.label || "marcado") + "».",
          evidence: {
            contract: key,
            localLabel: contract.label || null,
            localFlagReason: contract.flagReason || null,
            interactions: records.length,
            registryProvenance: contract.source || null
          },
          thresholds: thresholds["INT-EXPO-001"],
          transactions: records.map((record) => record.transaction)
        })
      );
    }
  }
  return results;
}

function sharedAffix(left, right, fromEnd) {
  const a = String(left).replace(/^0x/, "").toLowerCase();
  const b = String(right).replace(/^0x/, "").toLowerCase();
  let count = 0;
  while (count < a.length && count < b.length) {
    const characterA = fromEnd ? a[a.length - 1 - count] : a[count];
    const characterB = fromEnd ? b[b.length - 1 - count] : b[count];
    if (characterA !== characterB) break;
    count += 1;
  }
  return count;
}

function detectAddressPoisoning(entry, catalog, thresholds, now) {
  const config = thresholds["INT-EXPO-002"];
  const dust = toBigInt(config.dustThresholdRaw) ?? 0n;
  // Contrapartes "reales": aquellas con las que la dirección movió valor.
  const genuine = new Set(
    entry.all
      .filter((record) => record.amount > dust && record.counterparty)
      .map((record) => record.counterparty)
  );
  const results = [];
  for (const record of entry.incoming) {
    const candidate = record.counterparty;
    if (!candidate || genuine.has(candidate)) continue;
    if (record.amount > dust) continue; // señal obligatoria: cero o dust
    let lookalike = null;
    let prefix = 0;
    let suffix = 0;
    for (const known of [...genuine].sort()) {
      const prefixMatch = sharedAffix(known, candidate, false);
      const suffixMatch = sharedAffix(known, candidate, true);
      if (prefixMatch >= config.minimumPrefixMatch || suffixMatch >= config.minimumSuffixMatch) {
        if (prefixMatch + suffixMatch > prefix + suffix) {
          lookalike = known;
          prefix = prefixMatch;
          suffix = suffixMatch;
        }
      }
    }
    if (!lookalike) continue;
    results.push(
      makeIndicator(catalog["INT-EXPO-002"], {
        subject: entry.key,
        network: entry.network,
        detectedAt: now,
        discriminator: candidate,
        explanation:
          "Una dirección sin relación previa envió " + (record.amount === 0n ? "un importe cero" : "dust") +
          " y comparte " + prefix + " caracteres de prefijo y " + suffix +
          " de sufijo con una contraparte real de esta dirección.",
        evidence: {
          suspiciousAddress: candidate,
          resemblesGenuineCounterparty: lookalike,
          sharedPrefixCharacters: prefix,
          sharedSuffixCharacters: suffix,
          amountRaw: record.amount.toString(),
          dustThresholdRaw: config.dustThresholdRaw,
          caveat: "Candidato heurístico. La similitud por sí sola nunca activa este indicador."
        },
        thresholds: config,
        transactions: [record.transaction]
      })
    );
  }
  return results;
}

function detectUnlimitedApproval(entry, catalog, thresholds, now) {
  const results = [];
  for (const record of entry.outgoing) {
    if (!/approv/i.test(record.transfer.kind || "")) continue;
    if (record.amount !== MAX_UINT256) continue;
    results.push(
      makeIndicator(catalog["INT-EXPO-003"], {
        subject: entry.key,
        network: entry.network,
        detectedAt: now,
        discriminator: [record.transfer.assetContract, record.counterparty].join("|"),
        explanation:
          "Se observó una aprobación de gasto igual al máximo de uint256 sobre " +
          (record.transfer.asset || "un token") + " a favor de " + shortAddress(record.counterparty || "") + ".",
        evidence: {
          spender: record.counterparty,
          tokenContract: record.transfer.assetContract,
          asset: record.transfer.asset,
          amountRaw: record.amount.toString(),
          isMaxUint256: true,
          correlatedControl:
            "BLK-WALLET-001 cubre este patrón sobre cuentas vigiladas por política; aquí es un indicador de investigación sobre datos ingeridos."
        },
        thresholds: thresholds["INT-EXPO-003"],
        transactions: [record.transaction]
      })
    );
  }
  return results;
}

function detectAssetConcentration(index, catalog, thresholds, transactions, now) {
  const config = thresholds["INT-ASSET-001"];
  const byAsset = new Map();
  for (const transaction of transactions) {
    for (const transfer of transaction.transfers || []) {
      if (!transfer.to) continue;
      // Una aprobación autoriza gasto futuro; no mueve valor. Contarla como
      // flujo inflaría la concentración de forma absurda.
      if (/approv/i.test(transfer.kind || "")) continue;
      const asset = transfer.assetContract || transfer.asset;
      if (!byAsset.has(asset)) byAsset.set(asset, { total: 0n, byAddress: new Map(), transfers: 0, network: transaction.network });
      const bucket = byAsset.get(asset);
      const amount = toBigInt(transfer.amountRaw) ?? 0n;
      bucket.total += amount;
      bucket.transfers += 1;
      const key = transaction.network + ":" + transfer.to;
      bucket.byAddress.set(key, (bucket.byAddress.get(key) || 0n) + amount);
    }
  }
  const results = [];
  for (const [asset, bucket] of [...byAsset.entries()].sort()) {
    if (bucket.transfers < config.minimumTransfers || bucket.total === 0n) continue;
    for (const [key, amount] of [...bucket.byAddress.entries()].sort()) {
      const share = percent(amount, bucket.total);
      if (share < config.minimumFlowSharePercent) continue;
      const entry = index.get(key);
      results.push(
        makeIndicator(catalog["INT-ASSET-001"], {
          subject: key,
          network: bucket.network,
          detectedAt: now,
          discriminator: String(asset),
          explanation:
            "La dirección " + shortAddress(key) + " concentra el " + share.toFixed(1) +
            " % del flujo observado de " + asset + " en el conjunto analizado (umbral: " +
            config.minimumFlowSharePercent + " %).",
          evidence: {
            asset,
            sharePercent: Number(share.toFixed(2)),
            receivedRaw: amount.toString(),
            observedTotalRaw: bucket.total.toString(),
            observedTransfers: bucket.transfers,
            caveat: "El porcentaje es sobre el flujo OBSERVADO en el dataset, no sobre el suministro real del activo."
          },
          thresholds: config,
          transactions: entry ? [...entry.transactions.values()].slice(0, 20) : []
        })
      );
    }
  }
  return results;
}

function detectBridgeChaining(entry, catalog, thresholds, registries, now) {
  const config = thresholds["INT-BRIDGE-001"];
  const bridges = registries.bridges || new Map();
  const hits = entry.all
    .map((record) => ({ record, bridge: bridges.get(entry.network + ":" + record.counterparty) }))
    .filter((item) => item.bridge);
  if (!hits.length) return null;
  const windowMs = config.windowHours * HOUR_MS;
  for (let start = 0; start < hits.length; start += 1) {
    const window = hits.filter(
      (item) => item.record.at >= hits[start].record.at && item.record.at - hits[start].record.at <= windowMs
    );
    const distinct = [...new Set(window.map((item) => item.bridge.label || item.bridge.key))];
    if (distinct.length < config.minimumBridges) continue;
    return makeIndicator(catalog["INT-BRIDGE-001"], {
      subject: entry.key,
      network: entry.network,
      detectedAt: now,
      discriminator: distinct.sort().join("|"),
      explanation:
        "La dirección usó " + distinct.length + " puentes distintos en " + config.windowHours +
        " horas, lo que reduce la trazabilidad del recorrido entre redes.",
      evidence: {
        bridges: distinct,
        interactions: window.length,
        windowHours: config.windowHours,
        caveat: "La correlación de los fondos en la red de destino no está verificada por este producto."
      },
      thresholds: config,
      transactions: window.map((item) => item.record.transaction)
    });
  }
  return null;
}

function detectPostExploitMovement(entry, catalog, thresholds, registries, now) {
  const config = thresholds["INT-EXPLOIT-001"];
  const exploits = registries.exploits || [];
  const results = [];
  for (const exploit of exploits) {
    const exploitAt = time(exploit.occurredAt);
    if (!exploitAt) continue;
    const exploitKey = exploit.network + ":" + exploit.address;
    const related =
      entry.key === exploitKey ||
      entry.all.some((record) => entry.network + ":" + record.counterparty === exploitKey);
    if (!related) continue;
    const movements = entry.outgoing.filter(
      (record) => record.at >= exploitAt && record.at - exploitAt <= config.windowHours * HOUR_MS
    );
    if (!movements.length) continue;
    results.push(
      makeIndicator(catalog["INT-EXPLOIT-001"], {
        subject: entry.key,
        network: entry.network,
        detectedAt: now,
        discriminator: exploit.id,
        explanation:
          "La dirección movió fondos " + movements.length + " vez/veces dentro de las " + config.windowHours +
          " horas siguientes al incidente registrado «" + (exploit.label || exploit.id) + "».",
        evidence: {
          exploitId: exploit.id,
          exploitLabel: exploit.label || null,
          exploitAddress: exploitKey,
          exploitOccurredAt: exploit.occurredAt,
          movementsAfterExploit: movements.length,
          registryProvenance: exploit.source || null,
          caveat: "Coincidencia temporal y de relación. No distingue por sí sola al atacante de una acción de contención."
        },
        thresholds: config,
        transactions: movements.map((record) => record.transaction)
      })
    );
  }
  return results;
}

// ── Punto de entrada ────────────────────────────────────────────────────────

/**
 * Evalúa todos los indicadores sobre un conjunto de transacciones normalizadas.
 *
 * @param {object} input
 * @param {Array}  input.transactions transacciones normalizadas
 * @param {object} input.catalog      catálogo de indicadores (config)
 * @param {object} input.policies     umbrales (config)
 * @param {object} input.registries   registros locales: contratos marcados,
 *                                    drainers, puentes, exploits
 * @param {string} input.now          instante de evaluación (ISO)
 */
export function evaluateIndicators({ transactions = [], catalog, policies, registries = {}, now }) {
  const detectedAt = now || new Date().toISOString();
  const thresholds = policies.thresholds;
  const byId = Object.fromEntries((catalog.indicators || []).map((entry) => [entry.id, entry]));
  const index = buildActivityIndex(transactions);
  const results = [];

  for (const entry of [...index.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const single = [
      detectFanIn(entry, byId, thresholds, detectedAt),
      detectFanOut(entry, byId, thresholds, detectedAt),
      detectRapidHops(entry, index, byId, thresholds, detectedAt),
      detectPeelingChain(entry, index, byId, thresholds, detectedAt),
      detectSuddenActivity(entry, byId, thresholds, detectedAt),
      detectStructuring(entry, byId, thresholds, detectedAt),
      detectBehaviourChange(entry, byId, thresholds, detectedAt),
      detectBridgeChaining(entry, byId, thresholds, registries, detectedAt)
    ].filter(Boolean);
    results.push(
      ...single,
      ...detectFlaggedExposure(entry, byId, thresholds, registries, detectedAt),
      ...detectAddressPoisoning(entry, byId, thresholds, detectedAt),
      ...detectUnlimitedApproval(entry, byId, thresholds, detectedAt),
      ...detectPostExploitMovement(entry, byId, thresholds, registries, detectedAt)
    );
  }

  results.push(...detectCoordination(index, byId, thresholds, detectedAt));
  results.push(...detectAssetConcentration(index, byId, thresholds, transactions, detectedAt));

  // Orden estable y sin duplicados por identidad.
  const unique = new Map(results.map((entry) => [entry.id, entry]));
  return [...unique.values()].sort(
    (a, b) => a.subject.localeCompare(b.subject) || a.indicator.localeCompare(b.indicator)
  );
}

export { buildActivityIndex };
