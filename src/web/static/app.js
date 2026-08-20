const model = {
  summary: null,
  controls: [],
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
  renderProjects();
  renderControls();
}

async function reload() {
  const [summary, controls] = await Promise.all([api("/api/summary"), api("/api/controls")]);
  model.summary = summary;
  model.controls = controls.controls || [];
  render();
}

function switchView(name) {
  const titles = {
    overview: "Postura de seguridad",
    incidents: "Incidentes",
    inventory: "Inventario multi-chain",
    controls: "Controles de defensa"
  };
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === name));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.viewTarget === name));
  document.querySelector("#view-title").textContent = titles[name] || titles.overview;
  document.body.classList.remove("menu-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showIncident(id) {
  const incident = model.summary?.incidents.find((entry) => entry.id === id);
  if (!incident) return;
  model.selectedIncidentId = id;
  document.querySelector("#dialog-code").textContent = `${incident.code} · ${severityNames[incident.severity] || incident.severity}`;
  document.querySelector("#dialog-title").textContent = incident.title;
  const evidence = Object.entries(incident.evidence || {}).map(([key, value]) => `
    <div><span>${escapeHtml(key)}</span><code title="${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}">${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</code></div>`).join("");
  const remediation = (incident.remediation || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  document.querySelector("#dialog-content").innerHTML = `
    <div class="detail-grid">
      <section class="detail-block"><h3>Explicación</h3><p>${escapeHtml(incident.explanation)}</p></section>
      <section class="detail-block"><h3>Causa raíz</h3><p>${escapeHtml(incident.rootCause)}</p></section>
      <section class="detail-block"><h3>Evidencia</h3><div class="evidence-grid">${evidence}</div></section>
      <section class="detail-block"><h3>Remediación segura</h3><ul>${remediation}</ul></section>
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

reload().catch((error) => toast(error.message, true));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
