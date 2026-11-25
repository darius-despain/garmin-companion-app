import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildSampleDataset } from "../src/data/sampleData";
import { GarminPersonalApiClient } from "../src/services/garminPersonalApi";
import { GarminSyncService } from "../src/services/syncService";
import { GarminSqliteStore, type SqlBindValue, type SqliteDatabaseLike } from "../src/storage/sqliteStore";

/**
 * Adapter wrapping Node 22's built-in node:sqlite DatabaseSync so tests run
 * against real SQLite with exact expo-sqlite async semantics.
 */
function createNodeSqliteAdapter(): SqliteDatabaseLike {
  const db = new DatabaseSync(":memory:");
  return {
    async execAsync(source: string) {
      db.exec(source);
    },
    async runAsync(source: string, ...params: SqlBindValue[]) {
      const info = db.prepare(source).run(...params);
      return {
        changes: Number(info.changes ?? 0),
        lastInsertRowId: Number(info.lastInsertRowid ?? 0),
      };
    },
    async getAllAsync<T>(source: string, ...params: SqlBindValue[]) {
      return db.prepare(source).all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]) {
      const row = db.prepare(source).get(...params);
      return (row as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

describe("GarminSqliteStore & GarminSyncService", () => {
  it("upserts idempotently without duplicates, preserves last good data on partial failure, and supports check-ins", async () => {
    const store = new GarminSqliteStore(createNodeSqliteAdapter());
    await store.init();

    let failHrvAndSleep = false;
    const requestedUrls: string[] = [];

    const client = new GarminPersonalApiClient({
      apiKeyProvider: async () => "GCDC_TEST_KEY",
      sleepMs: async () => {},
      maxRetries: 0,
      fetchImpl: async (url) => {
        const u = String(url);
        requestedUrls.push(u);
        if (u.endsWith("/token")) {
          return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
        }
        if (u.includes("/activitylist-service/")) {
          return new Response(
            JSON.stringify([
              {
                activityId: 9001,
                activityName: "Trail Tempo",
                activityType: { typeKey: "trail_running" },
                startTimeLocal: "2026-11-23 07:00:00",
                distance: 9500,
                duration: 2850,
                averageHR: 149,
                elevationGain: 320,
              },
              {
                activityId: 9002,
                activityName: "Strength Session",
                activityType: { typeKey: "strength_training" },
                startTimeLocal: "2026-11-22 17:00:00",
                duration: 2400,
                averageHR: 118,
              },
            ]),
            { status: 200 }
          );
        }
        if (u.includes("/sleep-service/")) {
          if (failHrvAndSleep) return new Response("Upstream error", { status: 500 });
          return new Response(
            JSON.stringify([
              { calendarDate: "2026-11-23", sleepTimeSeconds: 28800, sleepScores: { overall: { value: 90 } } },
            ]),
            { status: 200 }
          );
        }
        if (u.includes("/hrv-service/")) {
          if (failHrvAndSleep) return new Response("Upstream error", { status: 500 });
          return new Response(
            JSON.stringify({
              hrvSummaries: [
                {
                  calendarDate: "2026-11-23",
                  lastNightAvg: 57,
                  baseline: { balancedLow: 50, balancedUpper: 58 },
                  status: "BALANCED",
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (u.includes("/stats/stress/")) {
          return new Response(
            JSON.stringify([{ calendarDate: "2026-11-23", values: { overallStressLevel: 26 } }]),
            { status: 200 }
          );
        }
        if (u.includes("/bodyBattery/")) {
          return new Response(
            JSON.stringify([{ date: "2026-11-23", bodyBatteryMostRecentValue: 84 }]),
            { status: 200 }
          );
        }
        if (u.includes("/v2/dailysummaries")) {
          return new Response(
            JSON.stringify([{ calendarDate: "2026-11-23", restingHeartRate: 51 }]),
            { status: 200 }
          );
        }
        return new Response("Not Found", { status: 404 });
      },
    });

    const sync = new GarminSyncService(client, store);

    // 1. First sync requests last 28 completed days (2026-10-27 .. 2026-11-23)
    const first = await sync.syncNow({ todayIso: "2026-11-24" });
    expect(first.ok).toBe(true);
    expect(first.partial).toBe(false);
    expect(first.requestedStart).toBe("2026-10-27");
    expect(first.requestedEnd).toBe("2026-11-23");
    expect(first.activitiesUpserted).toBe(2);

    // 2. Second sync uses 3-day overlap and creates zero duplicates
    const second = await sync.syncNow({ todayIso: "2026-11-24" });
    expect(second.requestedStart).toBe("2026-11-20");
    expect(second.requestedEnd).toBe("2026-11-23");
    expect((await store.getActivities()).length).toBe(2);
    expect((await store.getDailyMetrics()).length).toBe(1);

    // 3. Partial failure preserves previously synced sleep and HRV via COALESCE
    failHrvAndSleep = true;
    const third = await sync.syncNow({ todayIso: "2026-11-24" });
    expect(third.ok).toBe(true);
    expect(third.partial).toBe(true);
    expect(third.warnings.length).toBe(2);

    const daily = await store.getDailyMetrics();
    expect(daily[0].sleepDurationHours).toBe(8);
    expect(daily[0].hrvValue).toBe(57);
    expect(daily[0].restingHr).toBe(51);

    // 4. AnalyticsDataset projection preserves trail, road, strength, and daily metrics
    const dataset = await store.toAnalyticsDataset();
    expect(dataset.activities.trail).toHaveLength(1);
    expect(dataset.activities.strength).toHaveLength(1);
    expect(dataset.sleep["2026-11-23"].sleep_duration_hours).toBe(8);

    // 5. Future check-ins table works
    const checkInId = await store.saveCheckIn({
      date: "2026-11-24",
      rpe: 6,
      soreness: 3,
      notes: "Legs feel snappy",
      createdAt: "2026-11-24T08:00:00Z",
    });
    expect(checkInId).toBeGreaterThan(0);
    const checkIns = await store.getCheckIns("2026-11-24", "2026-11-24");
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].notes).toBe("Legs feel snappy");
  });

  it("builds deterministic 28-day sample data with multiple sports", () => {
    const sample = buildSampleDataset("2026-11-23");
    expect(sample.dailyMetrics).toHaveLength(28);
    expect(sample.dataset.activities.trail.length).toBeGreaterThan(0);
    expect(sample.dataset.activities.road.length).toBeGreaterThan(0);
    expect(sample.dataset.activities.strength?.length).toBeGreaterThan(0);
  });
});
