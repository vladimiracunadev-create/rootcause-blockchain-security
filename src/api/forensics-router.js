import { jsonResponse } from "./router.js";

function integer(url, name, fallback) {
  const value = url.searchParams.get(name);
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) return parsed;
  const error = new Error(name + " must be an integer.");
  error.statusCode = 400;
  error.code = "FORENSIC_REQUEST_REJECTED";
  throw error;
}

export function createForensicsRouter({ forensics }) {
  return async function routeForensics(request, response, url, context) {
    const method = request.method || "GET";
    let match = url.pathname.match(/^\/api\/v1\/forensics\/transactions\/(bitcoin|ethereum|polygon)\/([a-fA-F0-9x]{64,66})$/);
    if (method === "GET" && match) {
      const transaction = await forensics.transaction(match[1], match[2], url.searchParams.get("provider"));
      return jsonResponse(response, transaction ? 200 : 404, transaction ? { transaction } : { error: { code: "TRANSACTION_NOT_FOUND", message: "Transaction not found in the selected evidence source." } });
    }
    match = url.pathname.match(/^\/api\/v1\/forensics\/addresses\/(bitcoin|ethereum|polygon)\/([A-Za-z0-9]{20,128})$/);
    if (method === "GET" && match) return jsonResponse(response, 200, { analysis: await forensics.address(match[1], match[2], url.searchParams.get("provider")) });
    match = url.pathname.match(/^\/api\/v1\/forensics\/graph\/(bitcoin|ethereum|polygon)\/([A-Za-z0-9]{20,128})$/);
    if (method === "GET" && match) return jsonResponse(response, 200, { graph: await forensics.graph({ chain: match[1], address: match[2], providerId: url.searchParams.get("provider"), depth: integer(url, "depth", 2), maxNodes: integer(url, "maxNodes", 100), maxEdges: integer(url, "maxEdges", 200) }) });
    if (method === "GET" && url.pathname === "/api/v1/forensics/providers") return jsonResponse(response, 200, { providers: forensics.providers?.list() || [] });
    if (method === "POST" && url.pathname === "/api/v1/forensics/reconcile") {
      const body = await context.readJson(request);
      return jsonResponse(response, 200, { reconciliation: await forensics.reconcile(Array.isArray(body.ledger) ? body.ledger : [], body.options || {}) });
    }
    if (method === "POST" && url.pathname === "/api/v1/forensics/timeline") {
      const body = await context.readJson(request);
      return jsonResponse(response, 200, { timeline: forensics.timeline(body) });
    }
    if (method === "POST" && url.pathname === "/api/v1/forensics/report") {
      const body = await context.readJson(request);
      return jsonResponse(response, 200, { report: forensics.report(body) });
    }
    return null;
  };
}
