// Puntaje de POSTURA: cuánto riesgo de configuración hay ahora mismo.
//
// No confundir con src/domain/intelligence/risk-score.js, que mide algo
// distinto —exposición a señales investigables sobre movimientos de fondos— y
// devuelve una explicación completa. Este es un agregado breve para el panel.
//
// La fórmula toma el hallazgo más grave y suma solo un 8 % de cada uno de los
// demás. La intención es que la acumulación de ruido no eclipse la gravedad: un
// hallazgo crítico ya satura la escala, y veinte hallazgos bajos no deben
// parecer una crisis.
export const SEVERITY_WEIGHT = Object.freeze({
  critical: 100,
  high: 75,
  medium: 45,
  low: 20,
  info: 5
});

export function riskScore(findings) {
  if (!findings.length) return 0;
  const weights = findings.map((finding) => SEVERITY_WEIGHT[finding.severity] || 0);
  const maximum = Math.max(...weights);
  const additional = weights
    .filter((weight) => weight !== maximum)
    .reduce((sum, weight) => sum + weight * 0.08, 0);
  return Math.min(100, Math.round(maximum + additional));
}

export function riskLevel(score) {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  if (score > 0) return "low";
  return "clear";
}

export function countBySeverity(findings) {
  return findings.reduce(
    (counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );
}
