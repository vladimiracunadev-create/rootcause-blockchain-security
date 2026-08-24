// API v1 de RootCause Blockchain Intelligence.
//
// Versionada desde el primer día (`/api/v1/...`) porque una wallet o un
// servicio que consulte riesgo necesita un contrato estable.
//
// Lo que esta API NO hace, y no hará: pedir claves privadas, frases semilla o
// autorización para mover fondos; construir, firmar o transmitir
// transacciones; bloquear una operación. El endpoint de análisis previo de una
// transacción es EXPLÍCITAMENTE consultivo: devuelve advertencias, no permisos.
import { jsonResponse } from "./router.js";
import { ingestDataset, listDatasets } from "../services/intelligence-datasets.js";

const API_VERSION = "v1";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "REQUEST_REJECTED";
  return error;
}

function integerParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw badRequest(name + " must be an integer.");
  return parsed;
}

function textParam(url, name, pattern) {
  const raw = url.searchParams.get(name);
  if (raw === null) return null;
  if (pattern && !pattern.test(raw)) throw badRequest(name + " contains unsupported characters.");
  return raw;
}

function filterFrom(url) {
  const filter = {};
  const asset = textParam(url, "asset", /^[A-Za-z0-9._-]{1,40}$/);
  if (asset) filter.asset = asset;
  const minAmount = textParam(url, "minAmountRaw", /^\d{1,78}$/);
  if (minAmount) filter.minAmountRaw = minAmount;
  const since = textParam(url, "since", /^[0-9T:.Z+-]{4,40}$/);
  if (since) filter.since = new Date(since).toISOString();
  const until = textParam(url, "until", /^[0-9T:.Z+-]{4,40}$/);
  if (until) filter.until = new Date(until).toISOString();
  return Object.keys(filter).length ? filter : undefined;
}

const NETWORK = "([a-z]{3,20})";
const ADDRESS = "([A-Za-z0-9]{20,128})";
const IDENTIFIER = "([a-z]+-[a-f0-9]{20})";

export function createIntelligenceRouter({ intelligence }) {
  const routes = [
    // ── Estado y catálogo ────────────────────────────────────────────────
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/summary$/,
      handler: async () => ({ status: 200, body: { apiVersion: API_VERSION, summary: await intelligence.summary() } })
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/indicators$/,
      handler: async () => ({ status: 200, body: await intelligence.indicatorCatalog() })
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/connectors$/,
      handler: async () => ({ status: 200, body: { connectors: intelligence.connectors.list() } })
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/datasets$/,
      handler: async () => ({ status: 200, body: { datasets: await listDatasets() } })
    },

    // ── Pipeline ─────────────────────────────────────────────────────────
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/ingest$/,
      handler: async ({ body, actor }) => ({
        status: 202,
        body: {
          run: await intelligence.ingest(
            {
              blocks: Array.isArray(body.blocks) ? body.blocks.slice(0, 500) : [],
              transactions: Array.isArray(body.transactions) ? body.transactions.slice(0, 5000) : [],
              source: body.source || { kind: "unknown", id: "api" },
              datasetId: body.datasetId || null
            },
            actor
          )
        }
      })
    },
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/ingest\/dataset$/,
      handler: async ({ body, actor }) => ({
        status: 202,
        body: await ingestDataset(intelligence, body.datasetId, actor)
      })
    },
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/ingest\/connector$/,
      handler: async ({ body, actor }) => ({
        status: 202,
        body: {
          run: await intelligence.ingestFromConnector(String(body.connectorId || ""), body.options || {}, actor)
        }
      })
    },
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/analyze$/,
      handler: async ({ actor }) => ({ status: 200, body: await intelligence.analyze(actor) })
    },

    // ── Riesgo ───────────────────────────────────────────────────────────
    {
      method: "GET",
      pattern: new RegExp("^/api/v1/risk/addresses/" + NETWORK + "/" + ADDRESS + "$"),
      handler: async ({ match }) => ({
        status: 200,
        body: { apiVersion: API_VERSION, assessment: await intelligence.assess(match[1], match[2]) }
      })
    },
    {
      method: "GET",
      pattern: new RegExp("^/api/v1/risk/contracts/" + NETWORK + "/" + ADDRESS + "$"),
      handler: async ({ match }) => ({
        status: 200,
        body: { apiVersion: API_VERSION, assessment: await intelligence.assess(match[1], match[2]) }
      })
    },
    {
      method: "POST",
      pattern: /^\/api\/v1\/risk\/transactions$/,
      handler: async ({ body }) => ({ status: 200, body: await intelligence.assessTransactionIntent(body) })
    },

    // ── Grafo ────────────────────────────────────────────────────────────
    {
      method: "GET",
      pattern: new RegExp("^/api/v1/intelligence/graph/" + NETWORK + "/" + ADDRESS + "$"),
      handler: async ({ match, url }) => ({
        status: 200,
        body: await intelligence.graph(match[1], match[2], {
          direction: textParam(url, "direction", /^(forward|backward|both)$/) || "forward",
          depth: integerParam(url, "depth", undefined),
          maxNodes: integerParam(url, "maxNodes", undefined),
          maxEdges: integerParam(url, "maxEdges", undefined),
          filter: filterFrom(url)
        })
      })
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/paths$/,
      handler: async ({ url }) => {
        const network = textParam(url, "network", /^[a-z]{3,20}$/);
        const from = textParam(url, "from", /^[A-Za-z0-9]{20,128}$/);
        const to = textParam(url, "to", /^[A-Za-z0-9]{20,128}$/);
        if (!network || !from || !to) throw badRequest("network, from and to are required.");
        return {
          status: 200,
          body: await intelligence.paths(network, from, to, {
            maxDepth: integerParam(url, "depth", undefined),
            maxPaths: integerParam(url, "maxPaths", undefined),
            filter: filterFrom(url)
          })
        };
      }
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/cycles$/,
      handler: async ({ url }) => ({
        status: 200,
        body: await intelligence.cycles({
          maxDepth: integerParam(url, "depth", undefined),
          maxCycles: integerParam(url, "maxCycles", undefined)
        })
      })
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/communities$/,
      handler: async ({ url }) => ({
        status: 200,
        body: { communities: await intelligence.communities({ maxCommunities: integerParam(url, "limit", undefined) }) }
      })
    },

    // ── Alertas ──────────────────────────────────────────────────────────
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/alerts$/,
      handler: async ({ url }) => ({
        status: 200,
        body: {
          alerts: await intelligence.alerts({
            status: textParam(url, "status", /^[a-z-]{3,20}$/),
            subject: textParam(url, "subject", /^[a-z]+:[A-Za-z0-9]{20,128}$/)
          })
        }
      })
    },
    {
      method: "PATCH",
      pattern: new RegExp("^/api/v1/intelligence/alerts/" + IDENTIFIER + "$"),
      handler: async ({ match, body, actor }) => ({
        status: 200,
        body: { alert: await intelligence.updateAlert(match[1], body, actor) }
      })
    },

    // ── Casos y evidencia ────────────────────────────────────────────────
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/cases$/,
      handler: async () => ({ status: 200, body: { cases: await intelligence.cases() } })
    },
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/cases$/,
      handler: async ({ body, actor }) => ({
        status: 201,
        body: { case: await intelligence.openCase(body, actor) }
      })
    },
    {
      method: "PATCH",
      pattern: new RegExp("^/api/v1/intelligence/cases/" + IDENTIFIER + "$"),
      handler: async ({ match, body, actor }) => ({
        status: 200,
        body: { case: await intelligence.updateCase(match[1], body, actor) }
      })
    },
    {
      method: "POST",
      pattern: new RegExp("^/api/v1/intelligence/cases/" + IDENTIFIER + "/evidence$"),
      handler: async ({ match, body, actor }) => ({
        status: 201,
        body: { evidence: await intelligence.attachEvidence(match[1], body, actor) }
      })
    },
    {
      method: "GET",
      pattern: new RegExp("^/api/v1/intelligence/cases/" + IDENTIFIER + "/report$"),
      handler: async ({ match }) => ({ status: 200, body: await intelligence.caseReport(match[1]) })
    },
    {
      method: "GET",
      pattern: /^\/api\/v1\/intelligence\/evidence\/verify$/,
      handler: async () => ({ status: 200, body: await intelligence.verifyEvidenceIntegrity() })
    },

    // ── Registros locales ────────────────────────────────────────────────
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/registry\/(contracts|drainers|bridges)$/,
      handler: async ({ match, body, actor }) => ({
        status: 201,
        body: { record: await intelligence.registerLocalRecord(match[1], body, actor) }
      })
    },
    {
      method: "POST",
      pattern: /^\/api\/v1\/intelligence\/exploits$/,
      handler: async ({ body, actor }) => ({
        status: 201,
        body: { exploit: await intelligence.registerExploit(body, actor) }
      })
    }
  ];

  return async function routeIntelligence(request, response, url, context) {
    const method = request.method || "GET";
    for (const route of routes) {
      if (route.method !== method) continue;
      const match = url.pathname.match(route.pattern);
      if (!match) continue;
      const body = ["POST", "PATCH", "PUT"].includes(method) ? await context.readJson(request) : {};
      const result = await route.handler({ match, url, body, actor: context.actor, request });
      return jsonResponse(response, result.status, result.body);
    }
    return null;
  };
}
