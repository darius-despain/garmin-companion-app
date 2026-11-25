import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createGarminCorsProxy, isAllowedPath } from "../scripts/garmin-cors-proxy.mjs";

describe("garmin-cors-proxy", () => {
  const servers: Array<ReturnType<typeof createGarminCorsProxy>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()!;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("allowlists only Garmin Personal API paths and methods", () => {
    expect(isAllowedPath("POST", "/personalapitoken-service/personal-api/personal-api-key/token")).toBe(true);
    expect(isAllowedPath("GET", "/personalapitoken-service/personal-api/personal-api-key/token")).toBe(false);
    expect(isAllowedPath("GET", "/activitylist-service/activities/search/activities")).toBe(true);
    expect(isAllowedPath("GET", "/sleep-service/sleep/dailySleepSummariesByDate")).toBe(true);
    expect(isAllowedPath("POST", "/activitylist-service/activities/search/activities")).toBe(false);
    expect(isAllowedPath("GET", "/../etc/passwd")).toBe(false);
    expect(isAllowedPath("GET", "/activitylist-service/%2e%2e/secret")).toBe(false);
    expect(isAllowedPath("GET", "/activitylist-service/%2e%2e%2fpersonalapitoken-service/token")).toBe(false);
    expect(isAllowedPath("GET", "/activitylist-service/..\\secret")).toBe(false);
    expect(isAllowedPath("GET", "/activitylist-service//double")).toBe(false);
    expect(isAllowedPath("GET", "/unknown-service/data")).toBe(false);
  });

  it("handles OPTIONS preflight, forwards allowlisted requests, and never logs credentials", async () => {
    const logs: string[] = [];
    let capturedAuth: string | undefined;

    const server = createGarminCorsProxy({
      upstreamOrigin: "https://example.test",
      logger: (line: string) => {
        logs.push(line);
      },
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined;
        capturedAuth = headers?.Authorization;
        return new Response(JSON.stringify([{ activityId: 123 }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    // Preflight
    const preflight = await fetch(`${base}/activitylist-service/activities/search/activities`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8081" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");

    // Forwarded GET with Bearer token
    const secretToken = "SUPER_SECRET_BEARER_TOKEN_12345";
    const okRes = await fetch(`${base}/activitylist-service/activities/search/activities?start=0&limit=5`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8081",
        Authorization: `Bearer ${secretToken}`,
      },
    });
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual([{ activityId: 123 }]);
    expect(capturedAuth).toBe(`Bearer ${secretToken}`);

    // Disallowed path returns 403
    const blocked = await fetch(`${base}/evil-service/steal`, {
      method: "GET",
      headers: { Origin: "http://localhost:8081" },
    });
    expect(blocked.status).toBe(403);

    // Logs must never contain the bearer token
    expect(logs.join("\n")).not.toContain(secretToken);
  });
});
