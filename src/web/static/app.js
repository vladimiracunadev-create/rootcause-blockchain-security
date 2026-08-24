const model = {
  summary: null,
  controls: [],
  intelligence: null,
  filter: "active",
  selectedIncidentId: null
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const severityNames = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
  info: "Info"
};
const riskCopy = {
  critical: ["Exposición crítica", "Existe al menos una ruta causal que requiere contención y verificación inmediata."],
  high: ["Riesgo alto", "Los controles detectaron condiciones capaces de producir impacto significativo."],
  medium: ["Riesgo moderado", "Hay brechas de control que deben corregirse antes de ampliar exposición."],
  low: ["Riesgo bajo", "Las señales actuales son acotadas; conserva monitorización y evidencia."],
  clear: ["Sin hallazgos activos", "La exploración actual no encontró condiciones fuera de política."]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function humanNumber(value) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function shortIdentifier(value, visible = 11) {
  const text = String(value || "—");
  return text.length > visible * 2 ? text.slice(0, visible) + "…" + text.slice(-6) : text;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["content-type"] = "application/json";
  if (options.method && options.method !== "GET") headers["x-rootcause-request"] = "1";
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "No fue posible completar la solicitud.");
  return payload;
}

let toastTimer;
function toast(message, error = false) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 3200);
}

function activeIncidents() {
  return (model.summary?.incidents || [])
    .filter((incident) => ["open", "acknowledged"].includes(incident.status))
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
}

function incidentTemplate(incident) {
  return `
    <article class="incident-row" data-incident-id="${escapeHtml(incident.id)}" data-severity="${escapeHtml(incident.severity)}" role="button" tabindex="0">
      <span class="severity-bar" aria-hidden="true"></span>
      <div class="incident-main">
        <span>${escapeHtml(incident.code)} · ${escapeHtml(incident.entityType)}</span>
        <h4>${escapeHtml(incident.title)}</h4>
        <p>${escapeHtml(incident.explanation)}</p>
      </div>
      <div class="incident-meta">
        <span class="severity-label">${escapeHtml(severityNames[incident.severity] || incident.severity)}</span>
        <time>${escapeHtml(shortDate(incident.lastSeenAt || incident.detectedAt))}</time>
      </div>
    </article>`;
}

function renderRisk() {
  const { risk, totals, mode } = model.summary;
  document.querySelector("#risk-score").textContent = risk.score;
  document.querySelector("#risk-visual").dataset.level = risk.level;
  document.querySelector("#risk-heading").textContent = riskCopy[risk.level]?.[0] || "Postura calculada";
  document.querySelector("#risk-description").textContent = riskCopy[risk.level]?.[1] || "Análisis completado.";
  document.querySelector("#count-critical").textContent = risk.counts.critical;
  document.querySelector("#count-high").textContent = risk.counts.high;
  document.querySelector("#count-medium").textContent = risk.counts.medium;
  document.querySelector("#metric-projects").textContent = humanNumber(totals.projects);
  document.querySelector("#metric-contracts").textContent = humanNumber(totals.contracts);
  document.querySelector("#metric-dependencies").textContent = humanNumber(totals.oracles + totals.bridges);
  document.querySelector("#metric-incidents").textContent = humanNumber(totals.activeIncidents);
  document.querySelector("#nav-incident-count").textContent = totals.activeIncidents;
  document.querySelector("#mode-label").textContent = mode === "demo" ? "Demo local" : "Persistencia cifrada";
}

function renderCausalFlow() {
  const incident = activeIncidents()[0];
  const target = document.querySelector("#causal-flow");
  if (!incident) {
    target.innerHTML = '<div class="empty-state skeleton tall">No hay una ruta causal activa.</div>';
    return;
  }
  const evidenceEntries = Object.entries(incident.evidence || {}).slice(0, 2);
  const evidence = evidenceEntries.length
    ? evidenceEntries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")
    : "Evidencia registrada";
  target.innerHTML = `
    <div class="cause-node danger"><span>01 · Causa sistémica</span><strong>${escapeHtml(incident.rootCause)}</strong><p>Condición que hace posible el incidente.</p></div>
    <div class="cause-node"><span>02 · Control afectado</span><strong>${escapeHtml(incident.code)}</strong><p>Regla determinista fuera de política.</p></div>
    <div class="cause-node"><span>03 · Evidencia</span><strong>${escapeHtml(evidence)}</strong><p>Hecho público conservado para verificación.</p></div>
    <div class="cause-node danger"><span>04 · Impacto</span><strong>${escapeHtml(incident.title)}</strong><p>${escapeHtml(incident.explanation)}</p></div>`;
}

function renderNode() {
  const node = model.summary.node || {};
  const status = document.querySelector("#node-status");
  status.textContent = node.connected ? "Conectado" : "No disponible";
  status.classList.toggle("offline", !node.connected);
  document.querySelector("#node-facts").innerHTML = `
    <div><dt>Chain ID</dt><dd>${escapeHtml(node.chainId || "—")} / esperado ${escapeHtml(node.expectedChainId || "—")}</dd></div>
    <div><dt>Bloque</dt><dd>${escapeHtml(node.blockNumber ? humanNumber(node.blockNumber) : "—")}</dd></div>
    <div><dt>Cliente</dt><dd title="${escapeHtml(node.clientVersion || node.error || "—")}">${escapeHtml(shortIdentifier(node.clientVersion || node.error || "—", 16))}</dd></div>
    <div><dt>Último check</dt><dd>${escapeHtml(shortDate(node.checkedAt))}</dd></div>`;
}

function renderIncidents() {
  const active = activeIncidents();
  const priority = active.slice(0, 4);
  document.querySelector("#priority-incidents").innerHTML = priority.length
    ? priority.map(incidentTemplate).join("")
    : '<div class="empty-state">No hay incidentes activos.</div>';

  let incidents = model.summary.incidents || [];
  if (model.filter === "active") incidents = incidents.filter((entry) => ["open", "acknowledged"].includes(entry.status));
  if (model.filter === "critical") incidents = incidents.filter((entry) => entry.severity === "critical" && ["open", "acknowledged"].includes(entry.status));
  incidents = [...incidents].sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  document.querySelector("#all-incidents").innerHTML = incidents.length
    ? incidents.map(incidentTemplate).join("")
    : '<div class="empty-state">No hay incidentes para este filtro.</div>';
}

function projectTemplate(project) {
  const contracts = (project.contracts || []).map((contract) => `
    <div class="contract-line">
      <div><strong>${escapeHtml(contract.name)}</strong><code title="${escapeHtml(contract.address)}">${escapeHtml(shortIdentifier(contract.address, 12))}</code></div>
      <span class="${contract.verifiedSource ? "" : "unverified"}" title="${contract.verifiedSource ? "Fuente verificada" : "Fuente no verificada"}"></span>
    </div>`).join("");
  return `
    <article class="project-card">
      <div class="project-head">
        <div class="project-title"><span class="chain-avatar">${escapeHtml(project.chain.family === "evm" ? "Ξ" : "⌬")}</span><div><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.chain.family)} · ${escapeHtml(project.chain.network)} · ${escapeHtml(project.chain.chainId)}</p></div></div>
        <span class="criticality">${escapeHtml(project.criticality)}</span>
      </div>
      <div class="project-stats">
        <div><strong>${project.contracts.length}</strong><span>contratos</span></div>
        <div><strong>${project.oracles.length}</strong><span>oráculos</span></div>
        <div><strong>${project.bridges.length}</strong><span>puentes</span></div>
        <div><strong>${project.dependencies.length}</strong><span>deps</span></div>
      </div>
      <div class="contract-list">${contracts || '<div class="empty-state">Sin contratos registrados.</div>'}</div>
    </article>`;
}

const accountTypeNames = {
  eoa: "EOA",
  multisig: "Multisig",
  "smart-account": "Smart account",
  "contract-account": "Cuenta de contrato",
  "watch-only": "Watch-only"
};
const confidenceNames = {
  observed: "Observado on-chain",
  declared: "Declarado por el operador",
  heuristic: "Candidato heurístico"
};

function walletIncidents() {
  return (model.summary?.incidents || [])
    .filter((incident) => String(incident.code || "").startsWith("BLK-WALLET-"))
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
}

function accountTemplate(account) {
  const openForAccount = walletIncidents().filter(
    (incident) =>
      ["open", "acknowledged"].includes(incident.status) &&
      String(incident.entityId).toLowerCase() === String(account.address).toLowerCase()
  ).length;
  return `
    <article class="project-card">
      <div class="project-head">
        <div class="project-title"><span class="chain-avatar">▣</span><div><h3>${escapeHtml(account.purpose || accountTypeNames[account.accountType] || account.accountType)}</h3><p>${escapeHtml(accountTypeNames[account.accountType] || account.accountType)} · chain ${escapeHtml(account.chainId)}</p></div></div>
        <span class="criticality">${escapeHtml(account.criticality)}</span>
      </div>
      <div class="contract-list">
        <div class="contract-line">
          <div><strong>Dirección pública</strong><code title="${escapeHtml(account.address)}">${escapeHtml(shortIdentifier(account.address, 12))}</code></div>
          <span class="${openForAccount ? "unverified" : ""}" title="${openForAccount ? openForAccount + " incidentes activos" : "Sin incidentes activos"}"></span>
        </div>
      </div>
      <div class="project-stats">
        <div><strong>${(account.allowedSpenders || []).length}</strong><span>spenders ok</span></div>
        <div><strong>${(account.knownCounterparties || []).length}</strong><span>contrapartes</span></div>
        <div><strong>${(account.approvalPolicies || []).length}</strong><span>políticas</span></div>
        <div><strong>${openForAccount}</strong><span>incidentes</span></div>
      </div>
    </article>`;
}

function renderWallet() {
  const posture = model.summary.walletPosture || {};
  const metrics = [
    ["Cuentas vigiladas", posture.accounts, "Direcciones públicas"],
    ["Allowances activos", posture.activeAllowances, "Proyección por spender"],
    ["Approvals ilimitados", posture.unlimitedAllowances, "Máximo uint256"],
    ["Spenders no reconocidos", posture.unrecognizedSpenders, "Fuera de política local"],
    ["Operadores NFT", posture.activeOperators, "ApprovalForAll activos"],
    ["Smart accounts", posture.smartAccounts, "Cambios: " + (posture.smartAccountChanges ?? 0) + " incidentes"],
    ["Delegaciones EIP-7702", posture.delegations, "Observadas on-chain"],
    ["Poisoning candidatos", posture.poisoningCandidates, "Heurística, no confirmación"]
  ];
  document.querySelector("#wallet-metrics").innerHTML = metrics
    .map(([label, value, hint]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${humanNumber(value || 0)}</strong><small>${escapeHtml(hint)}</small></article>`)
    .join("");
  const accounts = model.summary.watchedAccounts || [];
  document.querySelector("#wallet-account-grid").innerHTML = accounts.length
    ? accounts.map(accountTemplate).join("")
    : '<div class="empty-state">No hay cuentas vigiladas registradas.</div>';
  const incidents = walletIncidents().filter((entry) => ["open", "acknowledged"].includes(entry.status));
  document.querySelector("#wallet-incidents").innerHTML = incidents.length
    ? incidents.map(incidentTemplate).join("")
    : '<div class="empty-state">Sin incidentes de wallet activos.</div>';
  document.querySelector("#nav-wallet-count").textContent = posture.openIncidents ?? 0;
}

// ── Blockchain Intelligence ────────────────────────────────────────────────

const bandNames = { low: "Bajo", moderate: "Moderado", high: "Alto", critical: "Crítico" };
const epistemicNames = {
  "observed-fact": "Hecho observado",
  indicator: "Indicador",
  inference: "Inferencia",
  hypothesis: "Hipótesis"
};

function alertTemplate(alert) {
  return `
    <article class="incident-row" data-alert-id="${escapeHtml(alert.id)}" data-severity="${escapeHtml(alert.severity)}" role="button" tabindex="0">
      <span class="severity-bar" aria-hidden="true"></span>
      <div class="incident-main">
        <span>${escapeHtml(alert.indicator)} · ${escapeHtml(alert.status)}</span>
        <h4>${escapeHtml(alert.title)}</h4>
        <p>${escapeHtml(alert.explanation)}</p>
      </div>
      <div class="incident-meta">
        <span class="severity-label">${escapeHtml(severityNames[alert.severity] || alert.severity)}</span>
        <time>${escapeHtml(shortDate(alert.createdAt))}</time>
      </div>
    </article>`;
}

function factorTemplate(factor) {
  const sign = factor.points >= 0 ? "+" : "";
  return `
    <div class="factor-row" data-direction="${factor.points >= 0 ? "up" : "down"}">
      <b>${sign}${factor.points}</b>
      <div>
        <strong>${escapeHtml(factor.label)}</strong>
        <p>${escapeHtml(factor.detail || "")}</p>
        ${factor.caveat ? `<em>${escapeHtml(factor.caveat)}</em>` : ""}
      </div>
      <span>${escapeHtml(epistemicNames[factor.epistemicLevel] || factor.epistemicLevel || "")}</span>
    </div>`;
}

function renderAssessment(assessment) {
  const target = document.querySelector("#intel-assessment");
  const increasing = (assessment.factorsIncreasing || []).map(factorTemplate).join("");
  const decreasing = (assessment.factorsDecreasing || []).map(factorTemplate).join("");
  const limitations = (assessment.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const indicators = (assessment.indicators || [])
    .map(
      (indicator) => `
      <div class="intel-indicator">
        <span>${escapeHtml(indicator.indicator)} · ${escapeHtml(severityNames[indicator.severity] || indicator.severity)} · confianza ${escapeHtml(indicator.confidence)}</span>
        <strong>${escapeHtml(indicator.title)}</strong>
        <p>${escapeHtml(indicator.explanation)}</p>
        <details>
          <summary>Falsos positivos posibles y acción recomendada</summary>
          <ul>${(indicator.falsePositives || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          <p><strong>Acción:</strong> ${escapeHtml(indicator.recommendedAction || "")}</p>
        </details>
      </div>`
    )
    .join("");

  target.innerHTML = `
    <div class="intel-score" data-band="${escapeHtml(assessment.band)}">
      <div class="intel-score-visual"><strong>${assessment.score}</strong><small>/ 100</small></div>
      <div>
        <p class="eyebrow">${escapeHtml(assessment.subject)}</p>
        <h3>${escapeHtml(bandNames[assessment.band] || assessment.band)} · confianza ${escapeHtml(assessment.confidence)}</h3>
        <p>${escapeHtml(assessment.summary)}</p>
        <p class="intel-model">Modelo ${escapeHtml(assessment.modelVersion || "—")} · ${assessment.dataScope?.transactionsAnalyzed ?? 0} transacciones analizadas</p>
      </div>
    </div>
    <div class="detail-grid">
      <section class="detail-block"><h3>Factores que aumentan el puntaje</h3>${increasing || '<p class="empty-state">Ninguno.</p>'}</section>
      <section class="detail-block"><h3>Factores que lo reducen</h3>${decreasing || '<p class="empty-state">Ninguno.</p>'}</section>
      <section class="detail-block"><h3>Indicadores</h3>${indicators || '<p class="empty-state">Sin indicadores activos sobre los datos analizados.</p>'}</section>
      <section class="detail-block"><h3>Limitaciones</h3><ul>${limitations}</ul></section>
      <section class="detail-block"><h3>Recomendación</h3><p>${escapeHtml(assessment.recommendation)}</p><p><strong>Requiere revisión humana:</strong> siempre.</p></section>
    </div>`;
}

// Grafo en SVG generado a mano: los nodos se colocan por número de saltos
// (columnas) y el resultado es determinista. Sin librerías, sin CDN.
function renderGraph(graph) {
  const status = document.querySelector("#intel-graph-status");
  const target = document.querySelector("#intel-graph");
  if (!graph?.found || !graph.nodes.length) {
    status.textContent = "Sin datos";
    target.innerHTML = '<div class="empty-state">La dirección no aparece en el grafo de transferencias observadas.</div>';
    return;
  }
  const columns = new Map();
  for (const node of graph.nodes.slice(0, 40)) {
    if (!columns.has(node.hops)) columns.set(node.hops, []);
    columns.get(node.hops).push(node);
  }
  const columnKeys = [...columns.keys()].sort((a, b) => a - b);
  const width = Math.max(420, columnKeys.length * 190);
  const tallest = Math.max(...columnKeys.map((key) => columns.get(key).length));
  const height = Math.max(160, tallest * 46 + 30);
  const position = new Map();
  columnKeys.forEach((key, columnIndex) => {
    const nodes = columns.get(key);
    nodes.forEach((node, rowIndex) => {
      position.set(node.key, {
        x: 60 + columnIndex * 180,
        y: 30 + rowIndex * 46 + (tallest - nodes.length) * 23
      });
    });
  });
  const flagged = new Set(graph.flaggedNodes || []);
  const edges = graph.edges
    .filter((edge) => position.has(edge.from) && position.has(edge.to))
    .slice(0, 120)
    .map((edge) => {
      const from = position.get(edge.from);
      const to = position.get(edge.to);
      return `<line x1="${from.x + 46}" y1="${from.y}" x2="${to.x - 46}" y2="${to.y}" class="graph-edge" />`;
    })
    .join("");
  const nodes = [...position.entries()]
    .map(([key, point]) => {
      const address = key.split(":").slice(1).join(":");
      const label = address.length > 12 ? address.slice(0, 6) + "…" + address.slice(-4) : address;
      const isStart = key === graph.start;
      const isFlagged = flagged.has(key);
      return `<g class="graph-node${isStart ? " start" : ""}${isFlagged ? " flagged" : ""}">
        <rect x="${point.x - 46}" y="${point.y - 14}" width="92" height="28" rx="8" />
        <text x="${point.x}" y="${point.y + 4}" text-anchor="middle">${escapeHtml(label)}</text>
        <title>${escapeHtml(key)}</title>
      </g>`;
    })
    .join("");

  status.textContent = graph.truncated ? "Truncado: " + graph.truncationReasons.join(", ") : "Completo";
  status.classList.toggle("offline", Boolean(graph.truncated));
  target.innerHTML = `
    <div class="graph-canvas"><svg viewBox="0 0 ${width} ${height}" role="img"
      aria-label="Grafo de transferencias observadas desde la dirección consultada">${edges}${nodes}</svg></div>
    <p class="graph-note">${graph.nodes.length} nodos · ${graph.edges.length} aristas · profundidad ${graph.depth}. ${escapeHtml(graph.caveat)}</p>`;
}

function renderIntelligence() {
  const intel = model.intelligence;
  if (!intel) return;
  const summary = intel.summary || {};
  const metrics = [
    ["Transacciones analizadas", summary.transactions, "Redes: " + (summary.networks || []).join(", ")],
    ["Indicadores activos", summary.indicators, "Señales investigables"],
    ["Alertas abiertas", summary.alerts?.open, (summary.alerts?.falsePositives ?? 0) + " falsos positivos registrados"],
    ["Casos", summary.cases?.total, (summary.cases?.open ?? 0) + " abiertos"],
    ["Grafo", summary.graph?.nodes, (summary.graph?.edges ?? 0) + " aristas"],
    ["Direcciones marcadas", (summary.registries?.drainers ?? 0) + (summary.registries?.contracts ?? 0), "Registro local del operador"],
    ["Reorganizaciones", summary.reorgs, (summary.orphanedTransactions ?? 0) + " transacciones huérfanas"],
    ["Evidencia", summary.evidence, "Hasheada e inmutable"]
  ];
  document.querySelector("#intel-metrics").innerHTML = metrics
    .map(([label, value, hint]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${humanNumber(value || 0)}</strong><small>${escapeHtml(hint)}</small></article>`)
    .join("");
  document.querySelector("#nav-intel-count").textContent = summary.alerts?.open ?? 0;

  const alerts = intel.alerts || [];
  document.querySelector("#intel-alerts").innerHTML = alerts.length
    ? alerts.map(alertTemplate).join("")
    : '<div class="empty-state">Sin alertas abiertas.</div>';

  const cases = intel.cases || [];
  document.querySelector("#intel-cases").innerHTML = cases.length
    ? cases
        .map(
          (entry) => `
      <div class="contract-line">
        <div><strong>${escapeHtml(entry.title)}</strong><code>${escapeHtml(entry.status)} · ${entry.alertIds.length} alertas · ${entry.evidenceIds.length} evidencias</code></div>
        <span class="${entry.status === "closed" ? "" : "unverified"}"></span>
      </div>`
        )
        .join("")
    : '<div class="empty-state">No hay casos de investigación abiertos.</div>';
}

async function evaluateAddress(network, address) {
  const [risk, graph] = await Promise.all([
    api(`/api/v1/risk/addresses/${encodeURIComponent(network)}/${encodeURIComponent(address)}`),
    api(`/api/v1/intelligence/graph/${encodeURIComponent(network)}/${encodeURIComponent(address)}?direction=both&depth=3`)
  ]);
  renderAssessment(risk.assessment);
  renderGraph(graph);
}

function renderProjects() {
  const projects = model.summary.projects || [];
  document.querySelector("#project-grid").innerHTML = projects.length
    ? projects.map(projectTemplate).join("")
    : '<div class="empty-state">No hay proyectos registrados.</div>';
}

function renderControls() {
  document.querySelector("#control-grid").innerHTML = model.controls.length
    ? model.controls.map((control, index) => `
      <article class="control-card"><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(control.title)}</h3><p>${escapeHtml(control.objective)}</p><code>${escapeHtml(control.id)}</code></article>`).join("")
    : '<div class="empty-state">No fue posible cargar el catálogo.</div>';
}

function render() {
  if (!model.summary) return;
  renderRisk();
  renderCausalFlow();
  renderNode();
  renderIncidents();
  renderWallet();
  renderIntelligence();
  renderProjects();
  renderControls();
}

async function reload() {
  const [summary, controls] = await Promise.all([api("/api/summary"), api("/api/controls")]);
  model.summary = summary;
  model.controls = controls.controls || [];
  // La consola de inteligencia es opcional: si su API no responde, el resto del
  // panel sigue funcionando en vez de quedarse en blanco.
  try {
    const [intelSummary, alerts, cases] = await Promise.all([
      api("/api/v1/intelligence/summary"),
      api("/api/v1/intelligence/alerts"),
      api("/api/v1/intelligence/cases")
    ]);
    model.intelligence = {
      summary: intelSummary.summary,
      alerts: (alerts.alerts || []).filter((alert) => !["closed", "false-positive"].includes(alert.status)),
      cases: cases.cases || []
    };
  } catch {
    model.intelligence = null;
  }
  render();
}

const VIEW_TITLES = {
  overview: "Postura de seguridad",
  incidents: "Incidentes",
  wallet: "Wallet Posture",
  intelligence: "Blockchain Intelligence",
  inventory: "Inventario multi-chain",
  controls: "Controles de defensa"
};

// La vista viaja en el hash para que el panel sea marcable: un operador puede
// dejar abierta la pestaña de incidentes y recargar sin volver al resumen, y
// una captura de documentacion apunta siempre a la misma pantalla.
function viewFromHash(hash) {
  const name = String(hash || "").replace(/^#/, "");
  return Object.hasOwn(VIEW_TITLES, name) ? name : "overview";
}

function switchView(name, updateHash = true) {
  const view = Object.hasOwn(VIEW_TITLES, name) ? name : "overview";
  document.querySelectorAll(".view").forEach((entry) => entry.classList.toggle("active", entry.dataset.view === view));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.viewTarget === view));
  document.querySelector("#view-title").textContent = VIEW_TITLES[view];
  document.body.classList.remove("menu-open");
  if (updateHash && viewFromHash(window.location.hash) !== view) {
    window.location.hash = view === "overview" ? "" : view;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("hashchange", () => switchView(viewFromHash(window.location.hash), false));

function showIncident(id) {
  const incident = model.summary?.incidents.find((entry) => entry.id === id);
  if (!incident) return;
  model.selectedIncidentId = id;
  document.querySelector("#dialog-code").textContent = `${incident.code} · ${severityNames[incident.severity] || incident.severity}`;
  document.querySelector("#dialog-title").textContent = incident.title;
  const evidence = Object.entries(incident.evidence || {}).map(([key, value]) => `
    <div><span>${escapeHtml(key)}</span><code title="${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}">${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</code></div>`).join("");
  const remediation = (incident.remediation || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const limitations = (incident.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const extra = [
    incident.confidence
      ? `<section class="detail-block"><h3>Grado de certeza</h3><p>${escapeHtml(confidenceNames[incident.confidence] || incident.confidence)}</p></section>`
      : "",
    incident.policyViolated
      ? `<section class="detail-block"><h3>Política incumplida</h3><p>${escapeHtml(incident.policyViolated)}</p></section>`
      : "",
    incident.impact
      ? `<section class="detail-block"><h3>Impacto posible</h3><p>${escapeHtml(incident.impact)}</p></section>`
      : "",
    limitations
      ? `<section class="detail-block"><h3>Limitaciones</h3><ul>${limitations}</ul></section>`
      : ""
  ].join("");
  document.querySelector("#dialog-content").innerHTML = `
    <div class="detail-grid">
      <section class="detail-block"><h3>Explicación</h3><p>${escapeHtml(incident.explanation)}</p></section>
      <section class="detail-block"><h3>Causa raíz</h3><p>${escapeHtml(incident.rootCause)}</p></section>
      ${extra}
      <section class="detail-block"><h3>Evidencia</h3><div class="evidence-grid">${evidence}</div></section>
      <section class="detail-block"><h3>Remediación segura (runbook humano)</h3><ul>${remediation}</ul></section>
    </div>`;
  const acknowledge = document.querySelector("#acknowledge-button");
  acknowledge.hidden = incident.status !== "open";
  document.querySelector("#incident-dialog").showModal();
}

async function runAction(button, action, successMessage) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Procesando…";
  try {
    await action();
    await reload();
    toast(successMessage);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewTarget));
});

document.querySelector("#menu-button").addEventListener("click", () => {
  document.body.classList.toggle("menu-open");
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    model.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((entry) => entry.classList.toggle("active", entry === button));
    renderIncidents();
  });
});

document.addEventListener("click", (event) => {
  const row = event.target.closest("[data-incident-id]");
  if (row) showIncident(row.dataset.incidentId);
});

document.addEventListener("keydown", (event) => {
  const row = event.target.closest?.("[data-incident-id]");
  if (row && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    showIncident(row.dataset.incidentId);
  }
});

document.querySelector("#scan-button").addEventListener("click", (event) =>
  runAction(event.currentTarget, () => api("/api/scan", { method: "POST", body: "{}" }), "Análisis causal completado.")
);

document.querySelector("#refresh-node-button").addEventListener("click", (event) =>
  runAction(event.currentTarget, () => api("/api/node/refresh", { method: "POST", body: "{}" }), "Observador RPC actualizado.")
);

document.querySelector("#acknowledge-button").addEventListener("click", async (event) => {
  const id = model.selectedIncidentId;
  if (!id) return;
  await runAction(
    event.currentTarget,
    () => api(`/api/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ status: "acknowledged" }) }),
    "Incidente reconocido."
  );
  document.querySelector("#incident-dialog").close();
});

document.querySelector("#intel-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const network = document.querySelector("#intel-network").value;
  const address = document.querySelector("#intel-address").value.trim();
  if (!address) return;
  const button = event.currentTarget.querySelector("button");
  await runAction(button, () => evaluateAddress(network, address), "Evaluación completada.");
});

document.querySelector("#intel-analyze-button").addEventListener("click", (event) =>
  runAction(
    event.currentTarget,
    () => api("/api/v1/intelligence/analyze", { method: "POST", body: "{}" }),
    "Análisis de inteligencia completado."
  )
);

// Una evaluación es marcable: `?network=…&address=…#intelligence` abre el panel
// con esa dirección ya evaluada. Sirve para volver a una investigación sin
// repetir la búsqueda y para que una captura apunte siempre al mismo estado.
function evaluateFromQuery() {
  const parameters = new URLSearchParams(window.location.search);
  const address = parameters.get("address");
  const network = parameters.get("network") || "ethereum";
  if (!address) return;
  document.querySelector("#intel-network").value = network;
  document.querySelector("#intel-address").value = address;
  evaluateAddress(network, address).catch((error) => toast(error.message, true));
}

switchView(viewFromHash(window.location.hash), false);
reload()
  .then(evaluateFromQuery)
  .catch((error) => toast(error.message, true));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
