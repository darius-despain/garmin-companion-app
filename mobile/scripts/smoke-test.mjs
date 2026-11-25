#!/usr/bin/env node
/**
 * Safe live smoke test for Garmin Personal API (GAR-002).
 *
 * Usage:
 *   GARMIN_PERSONAL_API_KEY="<your-key>" node scripts/smoke-test.mjs
 *
 * Never prints, logs, or persists the API key or bearer token.
 */

const BASE_URL = process.env.GARMIN_API_BASE_URL || "https://personal.connectapi.garmin.com";
const apiKey = (process.env.GARMIN_PERSONAL_API_KEY || "").trim();

if (!apiKey) {
  console.error("Missing GARMIN_PERSONAL_API_KEY environment variable.");
  process.exit(1);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

async function exchangeToken(key) {
  const res = await fetch(
    `${BASE_URL}/personalapitoken-service/personal-api/personal-api-key/token`,
    {
      method: "POST",
      headers: { Authorization: `ApiKey ${key}`, Accept: "application/json" },
    }
  );
  if (!res.ok) {
    throw new Error(`Token exchange failed with HTTP ${res.status}`);
  }
  const text = (await res.text()).trim();
  if (text.startsWith("{")) {
    const parsed = JSON.parse(text);
    const token = parsed.access_token || parsed.token || parsed.jwt;
    if (!token) throw new Error("Token JSON missing access_token/token field");
    return String(token);
  }
  return text.replace(/^"|"$/g, "");
}

async function apiGet(token, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return { status: res.status, ok: res.ok, body: res.ok ? await res.json() : null };
}

async function main() {
  const token = await exchangeToken(apiKey);
  console.log("Token exchange: OK");

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);

  const startStr = formatDate(start);
  const endStr = formatDate(end);
  console.log(`Requested range: ${startStr} to ${endStr}`);

  const checks = [
    ["activities", `/activitylist-service/activities/search/activities?start=0&limit=10`],
    ["sleep", `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${startStr}&endDate=${endStr}`],
    ["hrv", `/hrv-service/hrv/daily/${startStr}/${endStr}`],
    ["stress", `/usersummary-service/stats/stress/daily/${startStr}/${endStr}`],
    ["bodyBattery", `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${startStr}&endDate=${endStr}`],
    ["dailySummaries", `/usersummary-service/v2/dailysummaries?startDate=${startStr}&endDate=${endStr}`],
  ];

  for (const [label, path] of checks) {
    const result = await apiGet(token, path);
    const count = Array.isArray(result.body)
      ? result.body.length
      : result.body && typeof result.body === "object"
        ? Object.keys(result.body).length
        : 0;
    console.log(`- ${label}: HTTP ${result.status} (items/keys: ${count})`);
  }
}

main().catch((err) => {
  console.error(`Smoke test failed: ${err.message}`);
  process.exit(1);
});
