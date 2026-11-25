import { describe, expect, it, vi } from "vitest";
import { ExpoCredentialStore, MemoryCredentialStore } from "../src/services/credentialStore";
import {
  classifyActivityCategory,
  GarminAuthError,
  GarminPersonalApiClient,
  normalizeActivityPayload,
  normalizeBodyBatteryPayload,
  normalizeDailySummariesPayload,
  normalizeHrvPayload,
  normalizeSleepPayload,
  normalizeStressPayload,
  parseTokenResponse,
  splitDateRange,
} from "../src/services/garminPersonalApi";

function makeJwt(expEpochSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "user", exp: expEpochSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("GarminPersonalApiClient", () => {
  it("converts declared units explicitly (800m -> 0.8km, 1800s -> 30min) and preserves all sports", () => {
    const run = normalizeActivityPayload({
      activityId: 1001,
      activityName: "Track 800m",
      activityType: { typeKey: "running" },
      startTimeLocal: "2026-11-20 07:30:00",
      startTimeGMT: "2026-11-20 15:30:00",
      distance: 800,
      duration: 1800,
      averageHR: 148,
      maxHR: 170,
      elevationGain: 12,
    });
    expect(run).toEqual({
      garminId: "1001",
      date: "2026-11-20",
      startTimeLocal: "2026-11-20 07:30:00",
      utcOffsetSeconds: -28800,
      activityType: "running",
      category: "road_run",
      name: "Track 800m",
      distanceKm: 0.8,
      durationMinutes: 30,
      avgHr: 148,
      maxHr: 170,
      elevationGainM: 12,
    });

    const strength = normalizeActivityPayload({
      activityId: 1002,
      activityName: "Kettlebell Strength",
      activityType: { typeKey: "strength_training" },
      startTimeLocal: "2026-11-21 18:00:00",
      duration: 2700,
      averageHR: 115,
    });
    expect(strength?.category).toBe("strength");
    expect(strength?.distanceKm).toBeNull();
    expect(strength?.durationMinutes).toBe(45);

    expect(classifyActivityCategory("trail_running")).toBe("trail_run");
    expect(classifyActivityCategory("cycling")).toBe("other");
  });

  it("normalizes sleep, HRV, stress, Body Battery, and daily summaries with missing values as null", () => {
    const sleep = normalizeSleepPayload([
      {
        calendarDate: "2026-11-20",
        sleepTimeSeconds: 28800,
        sleepScores: { overall: { value: 88 } },
      },
      { calendarDate: "2026-11-21" },
    ]);
    expect(sleep.get("2026-11-20")).toEqual({ sleepDurationHours: 8, sleepScore: 88 });
    expect(sleep.get("2026-11-21")).toEqual({ sleepDurationHours: null, sleepScore: null });

    const hrv = normalizeHrvPayload({
      hrvSummaries: [
        {
          calendarDate: "2026-11-20",
          lastNightAvg: 58,
          baseline: { balancedLow: 48, balancedUpper: 60 },
          status: "BALANCED",
        },
      ],
    });
    expect(hrv.get("2026-11-20")).toEqual({ hrvValue: 58, hrvBaseline: 54, hrvStatus: "BALANCED" });

    const stress = normalizeStressPayload([
      { calendarDate: "2026-11-20", values: { overallStressLevel: 31 } },
      { calendarDate: "2026-11-21", values: { overallStressLevel: -1 } },
    ]);
    expect(stress.get("2026-11-20")).toEqual({ stress: 31 });
    expect(stress.get("2026-11-21")).toEqual({ stress: null });

    const bb = normalizeBodyBatteryPayload([
      { date: "2026-11-20", bodyBatteryMostRecentValue: 82 },
    ]);
    expect(bb.get("2026-11-20")).toEqual({ bodyBattery: 82 });

    const daily = normalizeDailySummariesPayload([
      { calendarDate: "2026-11-20", restingHeartRate: 52, averageStressLevel: 29, bodyBatteryHighestValue: 90 },
    ]);
    expect(daily.get("2026-11-20")).toEqual({ restingHr: 52, stress: 29, bodyBattery: 90 });
  });

  it("parses both bare JWT and JSON token responses and splits long date ranges", () => {
    const now = 1_700_000_000_000;
    const jwt = makeJwt(1_700_086_400);
    expect(parseTokenResponse(jwt, now)).toEqual({ token: jwt, expiresAtMs: 1_700_086_400_000 });
    expect(parseTokenResponse(JSON.stringify({ access_token: "tok", expires_in: 3600 }), now)).toEqual({
      token: "tok",
      expiresAtMs: now + 3_600_000,
    });

    const chunks = splitDateRange("2026-10-01", "2026-11-15", 28);
    expect(chunks).toEqual([
      { start: "2026-10-01", end: "2026-10-28" },
      { start: "2026-10-29", end: "2026-11-15" },
    ]);
  });

  it("reuses bearer token until expiry, retries 401 once after renewal, and never leaks the API key", async () => {
    let clock = 1_700_000_000_000;
    const secretKey = "GCDC_DO_NOT_LEAK_THIS_KEY";
    const calls: string[] = [];
    let tokenCounter = 0;
    let data401Sent = false;

    const client = new GarminPersonalApiClient({
      apiKeyProvider: async () => secretKey,
      nowMs: () => clock,
      sleepMs: async () => {},
      fetchImpl: async (url, init) => {
        const u = String(url);
        calls.push(`${init?.method} ${u}`);
        if (u.endsWith("/token")) {
          tokenCounter += 1;
          const jwt = makeJwt(Math.floor(clock / 1000) + 3600);
          return new Response(jwt, { status: 200 });
        }
        if (!data401Sent) {
          data401Sent = true;
          return new Response("Unauthorized", { status: 401 });
        }
        return new Response(JSON.stringify([{ calendarDate: "2026-11-20", restingHeartRate: 53 }]), {
          status: 200,
        });
      },
    });

    const summaries = await client.fetchDailySummariesRange("2026-11-20", "2026-11-20");
    expect(summaries.get("2026-11-20")?.restingHr).toBe(53);
    expect(tokenCounter).toBe(2); // Initial + 1 renewal after 401

    // Subsequent call within token TTL reuses cached token
    await client.fetchDailySummariesRange("2026-11-20", "2026-11-20");
    expect(tokenCounter).toBe(2);

    // Invalid key surfaces clear key replacement error without leaking secretKey
    const badClient = new GarminPersonalApiClient({
      apiKeyProvider: async () => secretKey,
      fetchImpl: async () => new Response("Forbidden", { status: 401 }),
    });
    await expect(badClient.getJson("/hrv-service/hrv/daily/2026-11-01/2026-11-02")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof GarminAuthError &&
        err.requiresKeyReplacement &&
        !err.message.includes(secretKey)
    );
  });

  it("backs off on 429 honoring Retry-After and retries transient 5xx", async () => {
    const sleeps: number[] = [];
    let attempt = 0;

    const client = new GarminPersonalApiClient({
      apiKeyProvider: async () => "GCDC_KEY",
      sleepMs: async (ms) => {
        sleeps.push(ms);
      },
      initialBackoffMs: 100,
      fetchImpl: async (url) => {
        if (String(url).endsWith("/token")) {
          return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
        }
        attempt += 1;
        if (attempt === 1) {
          return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "2" } });
        }
        if (attempt === 2) {
          return new Response("Bad Gateway", { status: 502 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      },
    });

    const result = await client.fetchActivities("2026-11-01", "2026-11-20");
    expect(result).toEqual([]);
    expect(sleeps).toEqual([2000, 200]); // Retry-After 2s, then exponential 100 * 2^1
  });
});

describe("CredentialStore", () => {
  it("stores API key via expo-secure-store on native and memory fallback on web", async () => {
    const backing = new Map<string, string>();
    const nativeMock = {
      isAvailableAsync: vi.fn(async () => true),
      getItemAsync: vi.fn(async (k: string) => backing.get(k) ?? null),
      setItemAsync: vi.fn(async (k: string, v: string) => {
        backing.set(k, v);
      }),
      deleteItemAsync: vi.fn(async (k: string) => {
        backing.delete(k);
      }),
    };

    const nativeStore = new ExpoCredentialStore(nativeMock);
    await nativeStore.setApiKey("  GCDC_NATIVE_KEY  ");
    expect(await nativeStore.hasApiKey()).toBe(true);
    expect(await nativeStore.getApiKey()).toBe("GCDC_NATIVE_KEY");
    await nativeStore.deleteApiKey();
    expect(await nativeStore.hasApiKey()).toBe(false);

    const webStore = new ExpoCredentialStore(null);
    await webStore.setApiKey("GCDC_WEB_KEY");
    expect(await webStore.getApiKey()).toBe("GCDC_WEB_KEY");

    const mem = new MemoryCredentialStore();
    await expect(mem.setApiKey("   ")).rejects.toThrow();

    // Regression: rejecting isAvailableAsync degrades cleanly to memory fallback
    const rejectingStore = new ExpoCredentialStore({
      isAvailableAsync: vi.fn(async () => {
        throw new Error("Keychain unavailable");
      }),
      getItemAsync: vi.fn(async () => null),
      setItemAsync: vi.fn(async () => {}),
      deleteItemAsync: vi.fn(async () => {}),
    });
    expect(await rejectingStore.hasApiKey()).toBe(false);
    await rejectingStore.setApiKey("GCDC_FALLBACK_KEY");
    expect(await rejectingStore.getApiKey()).toBe("GCDC_FALLBACK_KEY");
  });

  it("ignores negative Body Battery sentinels and charged delta, and handles ISO-Z timestamps", () => {
    const bb = normalizeBodyBatteryPayload([
      { date: "2026-11-23", bodyBatteryMostRecentValue: -1, bodyBatteryHighestValue: 85 },
      { date: "2026-11-22", charged: 45, bodyBatteryValuesArray: [[1700000000000, 82]] },
      { date: "2026-11-21", bodyBatteryMostRecentValue: -2, charged: 30 },
    ]);
    expect(bb.get("2026-11-23")).toEqual({ bodyBattery: 85 });
    expect(bb.get("2026-11-22")).toEqual({ bodyBattery: 82 });
    expect(bb.get("2026-11-21")).toEqual({ bodyBattery: null });

    const isoZ = normalizeActivityPayload({
      activityId: 5001,
      activityType: { typeKey: "running" },
      startTimeLocal: "2026-11-20T07:30:00",
      startTimeGMT: "2026-11-20T15:30:00Z",
      distance: 5000,
      duration: 1500,
    });
    expect(isoZ?.utcOffsetSeconds).toBe(-28800);
  });

  it("deduplicates concurrent token exchanges into a single request and continues activity pagination when page has mixed dates", async () => {
    let tokenCalls = 0;
    let resolveToken!: (res: Response) => void;
    const tokenGate = new Promise<Response>((r) => {
      resolveToken = r;
    });

    const client = new GarminPersonalApiClient({
      apiKeyProvider: async () => "GCDC_SINGLE_FLIGHT",
      sleepMs: async () => {},
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.endsWith("/token")) {
          tokenCalls += 1;
          return tokenGate;
        }
        if (u.includes("start=0&")) {
          // Page 0: 1 item before startDate + 49 in-range items (full page of 50)
          const page0 = [
            {
              activityId: 1,
              activityType: { typeKey: "running" },
              startTimeLocal: "2026-10-26 23:30:00",
              distance: 5000,
              duration: 1500,
            },
            ...Array.from({ length: 49 }, (_, i) => ({
              activityId: i + 2,
              activityType: { typeKey: "running" },
              startTimeLocal: "2026-11-05 07:00:00",
              distance: 5000,
              duration: 1500,
            })),
          ];
          return new Response(JSON.stringify(page0), { status: 200 });
        }
        if (u.includes("start=50&")) {
          return new Response(
            JSON.stringify([
              {
                activityId: 200,
                activityType: { typeKey: "running" },
                startTimeLocal: "2026-11-20 07:00:00",
                distance: 8000,
                duration: 2400,
              },
            ]),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify([]), { status: 200 });
      },
    });

    const parallel = Promise.all([
      client.fetchSleepRange("2026-11-20", "2026-11-20"),
      client.fetchHrvRange("2026-11-20", "2026-11-20"),
      client.fetchStressRange("2026-11-20", "2026-11-20"),
      client.fetchBodyBatteryRange("2026-11-20", "2026-11-20"),
      client.fetchDailySummariesRange("2026-11-20", "2026-11-20"),
      client.fetchActivities("2026-10-27", "2026-11-23"),
    ]);

    resolveToken(new Response(JSON.stringify({ access_token: "single_tok", expires_in: 3600 }), { status: 200 }));
    const results = await parallel;
    expect(tokenCalls).toBe(1);
    const activities = results[5];
    expect(activities.some((a) => a.garminId === "200")).toBe(true);
    expect(activities).toHaveLength(50);
  });
});
