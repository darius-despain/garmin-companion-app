#!/usr/bin/env node
/**
 * Tiny zero-dependency local dev CORS proxy for Expo Web -> Garmin Personal API.
 *
 * Security invariants:
 * - Binds strictly to 127.0.0.1 (loopback only).
 * - Only forwards allowlisted Garmin Personal API paths and methods (GET, plus POST for token exchange).
 * - Only allows localhost / 127.0.0.1 CORS origins.
 * - Never logs Authorization headers, API keys, bearer tokens, or response bodies.
 */

import http from "node:http";
import { pathToFileURL } from "node:url";

export const GARMIN_UPSTREAM_ORIGIN = "https://personal.connectapi.garmin.com";
export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = "127.0.0.1";

const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

const ALLOWED_GET_PREFIXES = [
  "/activitylist-service/",
  "/activity-service/",
  "/sleep-service/",
  "/hrv-service/",
  "/wellness-service/",
  "/usersummary-service/",
];

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedPath(method, pathname) {
  if (!pathname || typeof pathname !== "string" || !pathname.startsWith("/")) {
    return false;
  }
  if (/[\x00-\x1f\x7f\\]/.test(pathname) || pathname.includes("..") || pathname.includes("//")) {
    return false;
  }
  // Reject encoded path separators or encoded dots so raw upstream forwarding cannot bypass allowlist
  if (/%2e|%2f|%5c/i.test(pathname)) {
    return false;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  if (
    !decoded.startsWith("/") ||
    /[\x00-\x1f\x7f\\]/.test(decoded) ||
    decoded.includes("..") ||
    decoded.includes("//")
  ) {
    return false;
  }

  if (method === "POST") {
    return pathname === TOKEN_PATH && decoded === TOKEN_PATH;
  }
  if (method === "GET") {
    return (
      ALLOWED_GET_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
      ALLOWED_GET_PREFIXES.some((prefix) => decoded.startsWith(prefix))
    );
  }
  return false;
}

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (typeof origin === "string" && LOCAL_ORIGIN_RE.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Accept, Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

export function createGarminCorsProxy({
  upstreamOrigin = GARMIN_UPSTREAM_ORIGIN,
  fetchImpl = globalThis.fetch,
  logger = (_line) => {},
} = {}) {
  return http.createServer(async (req, res) => {
    applyCorsHeaders(req, res);

    const method = (req.method || "GET").toUpperCase();
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid request URL" }));
      return;
    }

    if (parsedUrl.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (!isAllowedPath(method, parsedUrl.pathname)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method or path not allowed by local Garmin proxy" }));
      logger(`${method} ${parsedUrl.pathname} -> 403`);
      return;
    }

    const upstreamUrl = `${upstreamOrigin}${parsedUrl.pathname}${parsedUrl.search}`;
    const forwardHeaders = {};
    if (typeof req.headers.authorization === "string") {
      forwardHeaders.Authorization = req.headers.authorization;
    }
    if (typeof req.headers.accept === "string") {
      forwardHeaders.Accept = req.headers.accept;
    }
    if (typeof req.headers["content-type"] === "string") {
      forwardHeaders["Content-Type"] = req.headers["content-type"];
    }

    try {
      const upstreamResponse = await fetchImpl(upstreamUrl, {
        method,
        headers: forwardHeaders,
      });

      res.statusCode = upstreamResponse.status;
      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      const retryAfter = upstreamResponse.headers.get("retry-after");
      if (retryAfter) {
        res.setHeader("Retry-After", retryAfter);
      }

      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      res.end(body);
      logger(`${method} ${parsedUrl.pathname} -> ${upstreamResponse.status}`);
    } catch {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to reach Garmin Personal API upstream" }));
      logger(`${method} ${parsedUrl.pathname} -> 502`);
    }
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  const server = createGarminCorsProxy({
    logger: (line) => console.log(`[garmin-cors-proxy] ${line}`),
  });
  server.listen(port, host, () => {
    console.log(`[garmin-cors-proxy] Listening on http://${host}:${port} -> ${GARMIN_UPSTREAM_ORIGIN}`);
  });
}
