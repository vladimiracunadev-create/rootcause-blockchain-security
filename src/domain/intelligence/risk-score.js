// Puntaje de riesgo explicable.
//
// Un número sin explicación es lo peor que puede producir una herramienta de
// este tipo: nadie puede discutirlo, corregirlo ni auditarlo, y acaba usándose
// como si fuera un veredicto. Aquí el puntaje NUNCA se devuelve solo: cada
// punto tiene un factor con nombre, peso, evidencia y nivel epistémico, y el
// resultado siempre declara su confianza, sus limitaciones y que requiere
// revisión humana.
//
// El puntaje mide EXPOSICIÓN A SEÑALES INVESTIGABLES, no culpabilidad.
const CONFIDENCE_MULTIPLIER = Object.freeze({ high: 1, medium: 0.85, low: 0.7 });
const DAY_MS = 86400000;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function bandFor(score, bands) {
  return (
    bands.find((band) => score >= band.min && score <= band.max) || bands[bands.length - 1]
  );
}

/**
 * Decaimiento por antigüedad: una señal de hace un año no pesa lo mismo que una
 * de ayer. Nunca decae del todo — un hecho antiguo sigue siendo un hecho.
 */
function ageFactor(detectedAt, now, config) {
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(detectedAt)) / DAY_MS);
  if (!Number.isFinite(ageDays) || !config.halfLifeDays) return { factor: 1, ageDays: 0 };
  const decayed = 0.5 ** (ageDays / config.halfLifeDays);
  const floor = 1 - config.maximumDecayPercent / 100;
  return { factor: clamp(decayed, floor, 1), ageDays: Math.round(ageDays) };
}

/**
 * Evalúa el riesgo de un sujeto (dirección o contrato) y devuelve SIEMPRE la
 * explicación completa junto al puntaje.
 *
 * @param {object} input
 * @param {string} input.subject      clave canónica `red:dirección`
 * @param {Array}  input.indicators   indicadores cuyo `subject` es este sujeto
 * @param {object} input.proximity    resultado de distanceToFlagged
 * @param {object} input.context      señales atenuantes observadas
 * @param {object} input.policies     configuración de scoring
 * @param {string} input.now          instante de evaluación (ISO)
 */
export function assessRisk({ subject, network, indicators = [], proximity = null, context = {}, policies, now }) {
  const config = policies.scoring;
  const evaluatedAt = now || new Date().toISOString();
  const increasing = [];
  const decreasing = [];

  // ── 1. Indicadores activos ────────────────────────────────────────────────
  const byIndicator = new Map();
  for (const indicator of indicators) {
    if (!byIndicator.has(indicator.indicator)) byIndicator.set(indicator.indicator, []);
    byIndicator.get(indicator.indicator).push(indicator);
  }

  let lowestReliability = 1;
  for (const [indicatorId, hits] of [...byIndicator.entries()].sort()) {
    const primary = hits[0];
    const base = config.severityWeights[primary.severity] ?? 0;
    const { factor, ageDays } = ageFactor(primary.detectedAt, evaluatedAt, config.evidenceAge);
    const confidenceMultiplier = CONFIDENCE_MULTIPLIER[primary.confidence] ?? 0.7;
    const repetition = Math.min(
      (hits.length - 1) * config.repetitionBonusPerExtraHit,
      config.maximumRepetitionBonus
    );
    const points = Math.round((base + repetition) * factor * confidenceMultiplier);
    lowestReliability = Math.min(lowestReliability, Number(primary.source?.reliability ?? 0.3));
    increasing.push({
      id: indicatorId,
      label: primary.title,
      points,
      weight: {
        severityBase: base,
        repetitionBonus: repetition,
        ageFactor: Number(factor.toFixed(3)),
        confidenceMultiplier
      },
      detail:
        hits.length > 1
          ? hits.length + " ocurrencias del mismo patrón (evidencia de " + ageDays + " días)"
          : "una ocurrencia (evidencia de " + ageDays + " días)",
      occurrences: hits.length,
      severity: primary.severity,
      confidence: primary.confidence,
      epistemicLevel: "indicator",
      evidenceIds: hits.map((hit) => hit.id).slice(0, 10)
    });
  }

  // ── 2. Cercanía en el grafo a una dirección marcada localmente ────────────
  if (proximity && Number.isInteger(proximity.distance)) {
    const points = config.proximity.pointsByDistance[String(proximity.distance)] ?? 0;
    if (points > 0) {
      increasing.push({
        id: "graph-proximity",
        label: "Cercanía en el grafo a una dirección marcada localmente",
        points,
        weight: { distance: proximity.distance, maximumDistance: config.proximity.maximumDistance },
        detail:
          proximity.distance === 0
            ? "El propio sujeto está marcado en el registro local."
            : "A " + proximity.distance + " salto(s) de " + proximity.via + " por transferencias observadas.",
        epistemicLevel: "inference",
        caveat:
          "La proximidad en el grafo no implica relación ni participación: una dirección puede recibir fondos sin conocer su origen."
      });
    }
  }

  // ── 3. Penalización por fiabilidad de la fuente ───────────────────────────
  if (increasing.length && lowestReliability < 1) {
    const penalty = Math.round((1 - lowestReliability) * config.sourceReliabilityPenalty.maximumPenalty);
    if (penalty > 0) {
      decreasing.push({
        id: "source-reliability",
        label: "Fiabilidad limitada de la fuente de datos",
        points: -penalty,
        weight: { lowestReliability: Number(lowestReliability.toFixed(2)) },
        detail: "Los indicadores se apoyan en fuentes cuya fiabilidad declarada es " + lowestReliability + ".",
        epistemicLevel: "inference"
      });
    }
  }

  // ── 4. Factores atenuantes ────────────────────────────────────────────────
  const mitigations = config.mitigatingFactors;
  if (context.locallyLabelled) {
    decreasing.push({
      id: "labelled-counterparty",
      label: "Contraparte identificada en el registro local",
      points: mitigations.labelledCounterpartyPoints,
      weight: {},
      detail: "El operador registró esta dirección como " + (context.label || "contraparte conocida") + ".",
      epistemicLevel: "observed-fact"
    });
  }
  if (context.firstSeen) {
    const historyDays = Math.round((Date.parse(evaluatedAt) - Date.parse(context.firstSeen)) / DAY_MS);
    if (historyDays >= mitigations.longConsistentHistoryMinimumDays && !context.behaviourChanged) {
      decreasing.push({
        id: "long-consistent-history",
        label: "Historial largo y sin cambios de patrón",
        points: mitigations.longConsistentHistoryPoints,
        weight: { historyDays },
        detail: historyDays + " días de actividad observada sin desviaciones detectadas.",
        epistemicLevel: "observed-fact"
      });
    }
  }
  if (context.approvalsRevoked) {
    decreasing.push({
      id: "revoked-approval",
      label: "Aprobación de gasto revocada posteriormente",
      points: mitigations.revokedApprovalPoints,
      weight: {},
      detail: "Se observó una revocación posterior que cierra la exposición detectada.",
      epistemicLevel: "observed-fact"
    });
  }
  if (increasing.length === 1 && increasing[0].confidence === "low") {
    decreasing.push({
      id: "single-low-confidence-indicator",
      label: "Un único indicador, de baja confianza",
      points: mitigations.singleLowConfidenceIndicatorPoints,
      weight: {},
      detail: "Una sola señal débil no sostiene por sí sola una calificación alta.",
      epistemicLevel: "inference"
    });
  }

  // ── 5. Puntaje y banda ────────────────────────────────────────────────────
  const rawScore =
    increasing.reduce((sum, factor) => sum + factor.points, 0) +
    decreasing.reduce((sum, factor) => sum + factor.points, 0);
  const score = clamp(Math.round(rawScore), 0, 100);
  const band = bandFor(score, config.bands);

  // ── 6. Confianza del análisis (independiente del puntaje) ─────────────────
  const distinctIndicators = byIndicator.size;
  let analysisConfidence = "low";
  if (
    distinctIndicators >= config.confidence.minimumIndicatorsForHigh &&
    lowestReliability >= config.confidence.minimumReliabilityForHigh
  ) {
    analysisConfidence = "high";
  } else if (distinctIndicators >= 1 && lowestReliability >= config.confidence.minimumReliabilityForMedium) {
    analysisConfidence = "medium";
  }

  const limitations = [
    "El puntaje mide exposición a señales investigables sobre los datos ingeridos; no es una prueba, ni una acusación, ni una atribución de identidad.",
    "Solo se evaluaron los hechos presentes en el conjunto analizado: la ausencia de indicadores no demuestra ausencia de riesgo.",
    "Ninguna dirección se relaciona con una persona o entidad: este sistema no produce identidades verificadas."
  ];
  if (!indicators.length) {
    limitations.push("No se activó ningún indicador: el resultado refleja falta de señales, no una verificación positiva.");
  }
  if (proximity?.truncated) {
    limitations.push("La búsqueda de proximidad se truncó por límites del grafo; la distancia real podría ser menor.");
  }
  if (lowestReliability < config.confidence.minimumReliabilityForMedium) {
    limitations.push("La fuente de datos tiene fiabilidad baja: verifica los hechos en una segunda fuente independiente.");
  }

  return {
    subject,
    network,
    score,
    band: band.id,
    bandLabel: band.label,
    confidence: analysisConfidence,
    modelVersion: policies.modelVersion,
    evaluatedAt,
    epistemicLevel: "inference",
    summary:
      "Puntaje " + score + "/100 (" + band.label.toLowerCase() + ") a partir de " +
      distinctIndicators + " indicador(es) distintos y " + decreasing.length + " factor(es) atenuante(s).",
    factorsIncreasing: increasing.sort((a, b) => b.points - a.points),
    factorsDecreasing: decreasing.sort((a, b) => a.points - b.points),
    indicatorCount: indicators.length,
    distinctIndicators,
    sourceReliability: Number(lowestReliability.toFixed(2)),
    limitations,
    requiresHumanReview: true,
    recommendation:
      score >= 75
        ? "Revisión humana prioritaria: preserva la evidencia y abre un caso antes de tomar cualquier decisión operativa."
        : score >= 50
          ? "Revisión humana: contrasta los indicadores con una segunda fuente antes de escalar."
          : score >= 25
            ? "Revisión cuando haya capacidad: registra el resultado y vigila si aparecen nuevas señales."
            : "Sin señales relevantes en los datos analizados. Conserva el resultado como línea base."
  };
}

/** Devuelve la banda de un puntaje sin recalcularlo. Nunca sin su etiqueta. */
export function describeBand(score, policies) {
  const band = bandFor(clamp(Number(score) || 0, 0, 100), policies.scoring.bands);
  return { id: band.id, label: band.label, min: band.min, max: band.max };
}
