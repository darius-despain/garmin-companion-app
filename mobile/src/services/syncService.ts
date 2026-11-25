/**
 * Sync orchestrator for Garmin Personal API -> local SQLite store (GAR-002).
 *
 * - First sync requests the last 28 completed days.
 * - Subsequent syncs refresh an overlap window (default 3 days) to pick up late uploads/edits.
 * - Partial endpoint failures preserve last good data and surface warnings without wiping cache.
 * - Auth errors (invalid/expired API key) propagate immediately so the UI can prompt key replacement.
 */

import {
  addDaysIso,
  formatIsoDateLocal,
  GarminAuthError,
  GarminPersonalApiClient,
  mergeDailyMetrics,
} from "./garminPersonalApi";
import type { GarminSqliteStore } from "../storage/sqliteStore";
import type { SyncMetadata } from "../types/garmin";

export interface SyncOptions {
  /** Override "today" local calendar date (YYYY-MM-DD) for deterministic testing. */
  todayIso?: string;
  /** Initial history window in completed days (default 28). */
  initialDays?: number;
  /** Overlap window in days for incremental syncs (default 3). */
  overlapDays?: number;
  /** Force a full initialDays sync even if prior sync metadata exists. */
  forceFullRange?: boolean;
}

export interface SyncOutcome {
  ok: boolean;
  partial: boolean;
  requestedStart: string;
  requestedEnd: string;
  activitiesUpserted: number;
  dailyMetricsUpserted: number;
  warnings: string[];
  metadata: SyncMetadata;
}

export class GarminSyncService {
  private inFlightSync: Promise<SyncOutcome> | null = null;

  constructor(
    private readonly client: GarminPersonalApiClient,
    private readonly store: GarminSqliteStore
  ) {}

  async syncNow(options: SyncOptions = {}): Promise<SyncOutcome> {
    if (this.inFlightSync) {
      return this.inFlightSync;
    }

    const run = this.executeSync(options).finally(() => {
      this.inFlightSync = null;
    });
    this.inFlightSync = run;
    return run;
  }

  private async executeSync(options: SyncOptions): Promise<SyncOutcome> {
    const initialDays = options.initialDays ?? 28;
    const overlapDays = options.overlapDays ?? 3;
    const now = new Date();
    const nowIso = now.toISOString();
    const todayIso = options.todayIso ?? formatIsoDateLocal(now);
    const requestedEnd = addDaysIso(todayIso, -1); // Last completed local calendar day

    const priorMeta = await this.store.getSyncMetadata();
    const fullRangeStart = addDaysIso(requestedEnd, -(initialDays - 1));

    // Only narrow to the incremental overlap window after a COMPLETE (warning-free) sync.
    // If a prior sync was partial, re-request from the last complete watermark (or full 28-day window)
    // so missing endpoints are automatically backfilled on retry.
    let requestedStart: string;
    if (!options.forceFullRange && priorMeta.lastCompleteSyncEnd) {
      const overlapStart = addDaysIso(priorMeta.lastCompleteSyncEnd, -Math.max(1, overlapDays));
      requestedStart = overlapStart > requestedEnd ? fullRangeStart : overlapStart;
    } else {
      requestedStart = fullRangeStart;
    }

    const warnings: string[] = [];
    let succeededEndpoints = 0;

    const runEndpoint = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        const result = await fn();
        succeededEndpoints += 1;
        return result;
      } catch (err) {
        if (err instanceof GarminAuthError) {
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`${label}: ${message}`);
        return null;
      }
    };

    const [activities, sleep, hrv, stress, bodyBattery, dailySummaries] = await Promise.all([
      runEndpoint("activities", () => this.client.fetchActivities(requestedStart, requestedEnd)),
      runEndpoint("sleep", () => this.client.fetchSleepRange(requestedStart, requestedEnd)),
      runEndpoint("hrv", () => this.client.fetchHrvRange(requestedStart, requestedEnd)),
      runEndpoint("stress", () => this.client.fetchStressRange(requestedStart, requestedEnd)),
      runEndpoint("bodyBattery", () => this.client.fetchBodyBatteryRange(requestedStart, requestedEnd)),
      runEndpoint("dailySummaries", () =>
        this.client.fetchDailySummariesRange(requestedStart, requestedEnd)
      ),
    ]);

    const allDates = new Set<string>();
    for (const map of [sleep, hrv, stress, bodyBattery, dailySummaries]) {
      if (!map) continue;
      for (const date of map.keys()) {
        allDates.add(date);
      }
    }

    const mergedDaily = mergeDailyMetrics(allDates, {
      sleep: sleep ?? undefined,
      hrv: hrv ?? undefined,
      stress: stress ?? undefined,
      bodyBattery: bodyBattery ?? undefined,
      dailySummaries: dailySummaries ?? undefined,
    });

    const dailyMetricsUpserted =
      mergedDaily.length > 0 ? await this.store.upsertDailyMetrics(mergedDaily, nowIso) : 0;
    const activitiesUpserted =
      activities && activities.length > 0 ? await this.store.upsertActivities(activities, nowIso) : 0;

    const coverage = await this.store.computeCoverage(fullRangeStart, requestedEnd);

    const anySuccess = succeededEndpoints > 0;
    const isComplete = anySuccess && warnings.length === 0;
    const metadata: SyncMetadata = {
      lastSyncAt: nowIso,
      lastSuccessfulSyncAt: anySuccess ? nowIso : priorMeta.lastSuccessfulSyncAt,
      lastCompleteSyncEnd: isComplete ? requestedEnd : (priorMeta.lastCompleteSyncEnd ?? null),
      requestedStart,
      requestedEnd,
      coverage,
      warnings,
    };

    await this.store.saveSyncMetadata(metadata, nowIso);

    return {
      ok: anySuccess,
      partial: anySuccess && warnings.length > 0,
      requestedStart,
      requestedEnd,
      activitiesUpserted,
      dailyMetricsUpserted,
      warnings,
      metadata,
    };
  }
}
