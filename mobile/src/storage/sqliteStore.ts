/**
 * On-device SQLite store backed by expo-sqlite (with an injectable adapter
 * so Node unit tests can run against real SQLite via node:sqlite).
 *
 * - Idempotent upserts for daily_metrics (by date) and activities (by garmin_id).
 * - Transactional writes so partial sync failures preserve last good data.
 * - Includes check_ins table for future manual check-ins.
 */

import type {
  ActivityCategory,
  ActivityRecord,
  AnalyticsActivity,
  AnalyticsDataset,
  CheckInRecord,
  DailyMetricRecord,
  SyncCoverage,
  SyncMetadata,
} from "../types/garmin";

export type SqlBindValue = string | number | null;

export interface SqliteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlBindValue[]): Promise<{ changes?: number; lastInsertRowId?: number }>;
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daily_metrics (
  date TEXT PRIMARY KEY,
  sleep_duration_hours REAL,
  sleep_score REAL,
  hrv_value REAL,
  hrv_baseline REAL,
  hrv_status TEXT,
  resting_hr REAL,
  stress REAL,
  body_battery REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  garmin_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_time_local TEXT,
  utc_offset_seconds INTEGER,
  activity_type TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT,
  distance_km REAL,
  duration_minutes REAL,
  avg_hr REAL,
  max_hr REAL,
  elevation_gain_m REAL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS check_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  rpe INTEGER,
  soreness INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins(date);
`;

interface DailyMetricRow {
  date: string;
  sleep_duration_hours: number | null;
  sleep_score: number | null;
  hrv_value: number | null;
  hrv_baseline: number | null;
  hrv_status: string | null;
  resting_hr: number | null;
  stress: number | null;
  body_battery: number | null;
  updated_at: string;
}

interface ActivityRow {
  garmin_id: string;
  date: string;
  start_time_local: string | null;
  utc_offset_seconds: number | null;
  activity_type: string;
  category: ActivityCategory;
  name: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  updated_at: string;
}

interface CheckInRow {
  id: number;
  date: string;
  rpe: number | null;
  soreness: number | null;
  notes: string | null;
  created_at: string;
}

interface MetaRow {
  key: string;
  value: string;
}

export async function openExpoSqliteStore(dbName = "garmin_companion.db"): Promise<GarminSqliteStore> {
  const SQLite = await import("expo-sqlite");
  const db = await SQLite.openDatabaseAsync(dbName);
  const store = new GarminSqliteStore(db as unknown as SqliteDatabaseLike);
  await store.init();
  return store;
}

export class GarminSqliteStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly db: SqliteDatabaseLike) {}

  private runSerializedTransaction<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(async () => {
      let result!: T;
      await this.db.withTransactionAsync(async () => {
        result = await task();
      });
      return result;
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async init(): Promise<void> {
    await this.db.execAsync(SCHEMA_SQL);
  }

  /**
   * Upsert daily metrics. Uses COALESCE on non-null incoming fields so a partial
   * sync (e.g. sleep succeeded while HRV failed) preserves previously synced values.
   */
  async upsertDailyMetrics(records: DailyMetricRecord[], nowIso = new Date().toISOString()): Promise<number> {
    if (records.length === 0) return 0;

    return this.runSerializedTransaction(async () => {
      for (const rec of records) {
        await this.db.runAsync(
          `INSERT INTO daily_metrics (
            date, sleep_duration_hours, sleep_score, hrv_value, hrv_baseline,
            hrv_status, resting_hr, stress, body_battery, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            sleep_duration_hours = COALESCE(excluded.sleep_duration_hours, daily_metrics.sleep_duration_hours),
            sleep_score = COALESCE(excluded.sleep_score, daily_metrics.sleep_score),
            hrv_value = COALESCE(excluded.hrv_value, daily_metrics.hrv_value),
            hrv_baseline = COALESCE(excluded.hrv_baseline, daily_metrics.hrv_baseline),
            hrv_status = COALESCE(excluded.hrv_status, daily_metrics.hrv_status),
            resting_hr = COALESCE(excluded.resting_hr, daily_metrics.resting_hr),
            stress = COALESCE(excluded.stress, daily_metrics.stress),
            body_battery = COALESCE(excluded.body_battery, daily_metrics.body_battery),
            updated_at = excluded.updated_at`,
          rec.date,
          rec.sleepDurationHours,
          rec.sleepScore,
          rec.hrvValue,
          rec.hrvBaseline,
          rec.hrvStatus,
          rec.restingHr,
          rec.stress,
          rec.bodyBattery,
          nowIso
        );
      }
      return records.length;
    });
  }

  async upsertActivities(activities: ActivityRecord[], nowIso = new Date().toISOString()): Promise<number> {
    if (activities.length === 0) return 0;

    return this.runSerializedTransaction(async () => {
      for (const act of activities) {
        await this.db.runAsync(
          `INSERT INTO activities (
            garmin_id, date, start_time_local, utc_offset_seconds, activity_type,
            category, name, distance_km, duration_minutes, avg_hr, max_hr,
            elevation_gain_m, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(garmin_id) DO UPDATE SET
            date = excluded.date,
            start_time_local = excluded.start_time_local,
            utc_offset_seconds = excluded.utc_offset_seconds,
            activity_type = excluded.activity_type,
            category = excluded.category,
            name = excluded.name,
            distance_km = excluded.distance_km,
            duration_minutes = excluded.duration_minutes,
            avg_hr = excluded.avg_hr,
            max_hr = excluded.max_hr,
            elevation_gain_m = excluded.elevation_gain_m,
            updated_at = excluded.updated_at`,
          act.garminId,
          act.date,
          act.startTimeLocal,
          act.utcOffsetSeconds,
          act.activityType,
          act.category,
          act.name,
          act.distanceKm,
          act.durationMinutes,
          act.avgHr,
          act.maxHr,
          act.elevationGainM,
          nowIso
        );
      }
      return activities.length;
    });
  }

  async getDailyMetrics(startDate?: string, endDate?: string): Promise<DailyMetricRecord[]> {
    const clauses: string[] = [];
    const params: SqlBindValue[] = [];
    if (startDate) {
      clauses.push("date >= ?");
      params.push(startDate);
    }
    if (endDate) {
      clauses.push("date <= ?");
      params.push(endDate);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.db.getAllAsync<DailyMetricRow>(
      `SELECT * FROM daily_metrics ${where} ORDER BY date ASC`,
      ...params
    );

    return rows.map((row) => ({
      date: row.date,
      sleepDurationHours: row.sleep_duration_hours,
      sleepScore: row.sleep_score,
      hrvValue: row.hrv_value,
      hrvBaseline: row.hrv_baseline,
      hrvStatus: row.hrv_status,
      restingHr: row.resting_hr,
      stress: row.stress,
      bodyBattery: row.body_battery,
      updatedAt: row.updated_at,
    }));
  }

  async getActivities(options: {
    startDate?: string;
    endDate?: string;
    category?: ActivityCategory;
  } = {}): Promise<ActivityRecord[]> {
    const clauses: string[] = [];
    const params: SqlBindValue[] = [];
    if (options.startDate) {
      clauses.push("date >= ?");
      params.push(options.startDate);
    }
    if (options.endDate) {
      clauses.push("date <= ?");
      params.push(options.endDate);
    }
    if (options.category) {
      clauses.push("category = ?");
      params.push(options.category);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.db.getAllAsync<ActivityRow>(
      `SELECT * FROM activities ${where} ORDER BY date DESC, garmin_id DESC`,
      ...params
    );

    return rows.map((row) => ({
      garminId: row.garmin_id,
      date: row.date,
      startTimeLocal: row.start_time_local,
      utcOffsetSeconds: row.utc_offset_seconds,
      activityType: row.activity_type,
      category: row.category,
      name: row.name,
      distanceKm: row.distance_km,
      durationMinutes: row.duration_minutes,
      avgHr: row.avg_hr,
      maxHr: row.max_hr,
      elevationGainM: row.elevation_gain_m,
      updatedAt: row.updated_at,
    }));
  }

  async saveCheckIn(checkIn: Omit<CheckInRecord, "id">): Promise<number> {
    const result = await this.db.runAsync(
      `INSERT INTO check_ins (date, rpe, soreness, notes, created_at) VALUES (?, ?, ?, ?, ?)`,
      checkIn.date,
      checkIn.rpe,
      checkIn.soreness,
      checkIn.notes,
      checkIn.createdAt
    );
    return result.lastInsertRowId ?? 0;
  }

  async getCheckIns(startDate?: string, endDate?: string): Promise<CheckInRecord[]> {
    const clauses: string[] = [];
    const params: SqlBindValue[] = [];
    if (startDate) {
      clauses.push("date >= ?");
      params.push(startDate);
    }
    if (endDate) {
      clauses.push("date <= ?");
      params.push(endDate);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.db.getAllAsync<CheckInRow>(
      `SELECT * FROM check_ins ${where} ORDER BY date DESC, id DESC`,
      ...params
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      rpe: r.rpe,
      soreness: r.soreness,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  async setMeta(key: string, value: string, nowIso = new Date().toISOString()): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      nowIso
    );
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<MetaRow>(`SELECT key, value FROM sync_meta WHERE key = ?`, key);
    return row ? row.value : null;
  }

  async saveSyncMetadata(meta: SyncMetadata, nowIso = new Date().toISOString()): Promise<void> {
    await this.setMeta("sync_metadata", JSON.stringify(meta), nowIso);
  }

  async getSyncMetadata(): Promise<SyncMetadata> {
    const raw = await this.getMeta("sync_metadata");
    if (!raw) {
      return {
        lastSyncAt: null,
        lastSuccessfulSyncAt: null,
        requestedStart: null,
        requestedEnd: null,
        coverage: null,
        warnings: [],
      };
    }
    try {
      return JSON.parse(raw) as SyncMetadata;
    } catch {
      return {
        lastSyncAt: null,
        lastSuccessfulSyncAt: null,
        requestedStart: null,
        requestedEnd: null,
        coverage: null,
        warnings: [],
      };
    }
  }

  async computeCoverage(requestedStart: string, requestedEnd: string): Promise<SyncCoverage> {
    const daily = await this.getDailyMetrics(requestedStart, requestedEnd);
    const activities = await this.getActivities({ startDate: requestedStart, endDate: requestedEnd });

    const sportCounts: Record<ActivityCategory, number> = {
      trail_run: 0,
      road_run: 0,
      strength: 0,
      other: 0,
    };
    for (const act of activities) {
      sportCounts[act.category] = (sportCounts[act.category] ?? 0) + 1;
    }

    return {
      requestedStart,
      requestedEnd,
      dailyMetricDays: daily.length,
      sleepDays: daily.filter((d) => d.sleepDurationHours !== null).length,
      hrvDays: daily.filter((d) => d.hrvValue !== null).length,
      rhrDays: daily.filter((d) => d.restingHr !== null).length,
      stressDays: daily.filter((d) => d.stress !== null).length,
      bodyBatteryDays: daily.filter((d) => d.bodyBattery !== null).length,
      activityCount: activities.length,
      sportCounts,
    };
  }

  async toAnalyticsDataset(startDate?: string, endDate?: string): Promise<AnalyticsDataset> {
    const daily = await this.getDailyMetrics(startDate, endDate);
    const activities = await this.getActivities({ startDate, endDate });

    const dataset: AnalyticsDataset = {
      sleep: {},
      hrv: {},
      rhr: {},
      stress: {},
      body_battery: {},
      activities: {
        trail: [],
        road: [],
        strength: [],
        other: [],
        all: [],
      },
    };

    for (const d of daily) {
      if (d.sleepDurationHours !== null || d.sleepScore !== null) {
        dataset.sleep[d.date] = {
          date: d.date,
          sleep_duration_hours: d.sleepDurationHours,
          sleep_score: d.sleepScore,
        };
      }
      if (d.hrvValue !== null || d.hrvBaseline !== null) {
        dataset.hrv[d.date] = {
          date: d.date,
          hrv_value: d.hrvValue,
          hrv_baseline: d.hrvBaseline,
          hrv_status: d.hrvStatus,
        };
      }
      if (d.restingHr !== null) {
        dataset.rhr[d.date] = {
          date: d.date,
          resting_hr: d.restingHr,
        };
      }
      if (d.stress !== null) {
        dataset.stress[d.date] = {
          date: d.date,
          stress: d.stress,
          body_battery: d.bodyBattery,
        };
      }
      if (d.bodyBattery !== null) {
        dataset.body_battery[d.date] = {
          date: d.date,
          body_battery: d.bodyBattery,
        };
      }
    }

    for (const act of activities) {
      const mapped: AnalyticsActivity = {
        id: act.garminId,
        type: act.activityType,
        category: act.category,
        name: act.name,
        date: act.date,
        distance_km: act.distanceKm,
        duration_minutes: act.durationMinutes,
        avg_hr: act.avgHr,
        max_hr: act.maxHr,
        elevation_gain: act.elevationGainM,
      };
      dataset.activities.all!.push(mapped);
      if (act.category === "trail_run") {
        dataset.activities.trail.push(mapped);
      } else if (act.category === "road_run") {
        dataset.activities.road.push(mapped);
      } else if (act.category === "strength") {
        dataset.activities.strength!.push(mapped);
      } else {
        dataset.activities.other!.push(mapped);
      }
    }

    return dataset;
  }
}
