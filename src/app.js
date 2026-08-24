import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createApiRouter, jsonResponse } from "./api/router.js";

const STATIC_FILES = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
  "/icon.svg": ["icon.svg", "image/svg+xml"]
});

function applySecurityHeaders(response) {
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("cross-origin-resource-policy", "same-origin");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
}

function createRateLimiter(limitPerMinute) {
  const clients = new Map();
  return function allow(request) {
    const now = Date.now();
    const key = request.socket.remoteAddress || "unknown";
    const record = clients.get(key);
    if (!record || now - record.startedAt >= 60000) {
      clients.set(key, { startedAt: now, count: 1 });
      return true;
    }
    record.count += 1;
    return record.count <= limitPerMinute;
  };
}

function validateMutationRequest(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")) return;
  if (request.headers["x-rootcause-request"] !== "1") {
    const error = new Error("Missing local mutation header.");
    error.statusCode = 403;
    error.code = "MUTATION_HEADER_REQUIRED";
    throw error;
  }
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    const error = new Error("Cross-site mutation rejected.");
    error.statusCode = 403;
    error.code = "CROSS_SITE_REQUEST_REJECTED";
    throw error;
  }
}

export function createApplication({ service, config, staticRoot, intelligenceRouter = null }) {
  const allowRequest = createRateLimiter(config.rateLimitPerMinute);

  async function readJson(request) {
    const contentType = String(request.headers["content-type"] || "");
    if (!contentType.toLowerCase().startsWith("application/json")) {
      const error = new Error("Content-Type application/json is required.");
      error.statusCode = 415;
      throw error;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > config.bodyLimitBytes) {
        const error = new Error("Request body exceeds the configured limit.");
        error.statusCode = 413;
        throw error;
      }
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      const error = new Error("Malformed JSON body.");
      error.statusCode = 400;
      throw error;
    }
  }

  const apiRouter = createApiRouter({ service, readJson, intelligenceRouter });

  return async function application(request, response) {
    applySecurityHeaders(response);
    response.setHeader("x-request-id", crypto.randomUUID());
    try {
      if (!allowRequest(request)) {
        return jsonResponse(
          response,
          429,
          { error: { code: "RATE_LIMITED", message: "Too many requests." } },
          { "retry-after": "60" }
        );
      }
      const host = request.headers.host || "127.0.0.1";
      const url = new URL(request.url || "/", "http://" + host);
      if (url.pathname.startsWith("/api/")) {
        validateMutationRequest(request);
        return await apiRouter(request, response, url);
      }
      if (!["GET", "HEAD"].includes(request.method || "GET")) {
        return jsonResponse(response, 405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }
        });
      }
      const staticDefinition = STATIC_FILES[url.pathname];
      if (!staticDefinition) {
        return jsonResponse(response, 404, {
          error: { code: "NOT_FOUND", message: "Resource not found." }
        });
      }
      const [fileName, contentType] = staticDefinition;
      const content = await fs.readFile(path.join(staticRoot, fileName));
      response.writeHead(200, {
        "content-type": contentType,
        "content-length": content.length,
        "cache-control":
          fileName === "sw.js" || fileName === "index.html"
            ? "no-cache"
            : "public, max-age=300"
      });
      if (request.method === "HEAD") return response.end();
      return response.end(content);
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "request_failed",
            message: error.message,
            occurredAt: new Date().toISOString()
          })
        );
      }
      return jsonResponse(response, status, {
        error: {
          code: error.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED"),
          message: status >= 500 ? "The request could not be completed." : error.message
        }
      });
    }
  };
}
