function actorFrom(request) {
  const value = String(request.headers["x-rootcause-actor"] || "local-user");
  return /^[a-z0-9._@-]{1,80}$/i.test(value) ? value : "local-user";
}

export function jsonResponse(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(payload);
}

export function createApiRouter({ service, readJson, intelligenceRouter = null }) {
  return async function routeApi(request, response, url) {
    const method = request.method || "GET";
    const path = url.pathname;
    const actor = actorFrom(request);

    // La API de inteligencia está versionada bajo /api/v1 y se resuelve antes
    // que las rutas heredadas: si no reconoce la ruta devuelve null y el
    // control vuelve aquí.
    if (intelligenceRouter && path.startsWith("/api/v1/")) {
      const handled = await intelligenceRouter(request, response, url, { actor, readJson });
      if (handled !== null) return handled;
    }

    if (method === "GET" && path === "/api/health") {
      return jsonResponse(response, 200, {
        status: "ok",
        service: "rootcause-blockchain-security",
        version: "0.3.0",
        time: new Date().toISOString()
      });
    }

    if (method === "GET" && path === "/api/summary") {
      return jsonResponse(response, 200, await service.summary());
    }

    if (method === "GET" && path === "/api/projects") {
      return jsonResponse(response, 200, { projects: await service.projects() });
    }

    if (method === "POST" && path === "/api/projects") {
      const project = await service.addProject(await readJson(request), actor);
      return jsonResponse(response, 201, { project });
    }

    if (method === "GET" && path === "/api/accounts") {
      return jsonResponse(response, 200, { accounts: await service.accounts() });
    }

    if (method === "POST" && path === "/api/accounts") {
      const account = await service.addWatchedAccount(await readJson(request), actor);
      return jsonResponse(response, 201, { account });
    }

    if (method === "POST" && path === "/api/scan") {
      return jsonResponse(response, 200, await service.scan(actor));
    }

    if (method === "GET" && path === "/api/incidents") {
      return jsonResponse(response, 200, { incidents: await service.incidents() });
    }

    const incidentMatch = path.match(/^\/api\/incidents\/([a-f0-9]{20})$/);
    if (method === "PATCH" && incidentMatch) {
      const body = await readJson(request);
      const incident = await service.updateIncident(incidentMatch[1], body.status, actor);
      return jsonResponse(response, 200, { incident });
    }

    if (method === "GET" && path === "/api/policies") {
      return jsonResponse(response, 200, await service.policiesDocument());
    }

    if (method === "GET" && path === "/api/controls") {
      return jsonResponse(response, 200, await service.controlsCatalog());
    }

    if (method === "GET" && path === "/api/audit") {
      return jsonResponse(response, 200, await service.audit());
    }

    if (method === "POST" && path === "/api/approvals") {
      const approval = await service.approvePolicyHash(await readJson(request), actor);
      return jsonResponse(response, 201, { approval });
    }

    if (method === "POST" && path === "/api/observe/event") {
      const event = await service.observeEvent(await readJson(request), actor);
      return jsonResponse(response, 201, { event });
    }

    if (method === "POST" && path === "/api/node/refresh") {
      return jsonResponse(response, 200, { node: await service.refreshNode(actor) });
    }

    return jsonResponse(response, 404, {
      error: { code: "NOT_FOUND", message: "API route not found." }
    });
  };
}
