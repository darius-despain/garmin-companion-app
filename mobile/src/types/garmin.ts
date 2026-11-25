export type ActivityCategory = "trail_run" | "road_run" | "strength" | "other";

export interface DailyMetricRecord {
  date: string; // Local calendar date YYYY-MM-DD
  sleepDurationHours: number | null;
  sleepScore: number | null;
  hrvValue: number | null;
  hrvBaseline: number | null;
  hrvStatus: string | null;
  restingHr: number | null;
  stress: number | null;
  bodyBattery: number | null;
  updatedAt?: string;
}

export interface ActivityRecord {
  garminId: string;
  date: string; // Local calendar date YYYY-MM-DD
  startTimeLocal: string | null;
  utcOffsetSeconds: number | null;
  activityType: string; // Raw Garmin activityTypeKey
  category: ActivityCategory;
  name: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainM: number | null;
  updatedAt?: string;
}

export interface CheckInRecord {
  id?: number;
  date: string; // YYYY-MM-DD
  rpe: number | null;
  soreness: number | null;
  notes: string | null;
  createdAt: string;
}

export interface SyncCoverage {
  requestedStart: string;
  requestedEnd: string;
  dailyMetricDays: number;
  sleepDays: number;
  hrvDays: number;
  rhrDays: number;
  stressDays: number;
  bodyBatteryDays: number;
  activityCount: number;
  sportCounts: Record<ActivityCategory, number>;
}

export interface SyncMetadata {
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  requestedStart: string | null;
  requestedEnd: string | null;
  coverage: SyncCoverage | null;
  warnings: string[];
}

export interface SleepEntry {
  date: string;
  sleep_duration_hours: number | null;
  sleep_score?: number | null;
}

export interface HrvEntry {
  date: string;
  hrv_value: number | null;
  hrv_baseline: number | null;
  hrv_status?: string | null;
}

export interface RhrEntry {
  date: string;
  resting_hr: number | null;
}

export interface StressEntry {
  date: string;
  stress: number | null;
  body_battery?: number | null;
}

export interface BodyBatteryEntry {
  date: string;
  body_battery: number | null;
}

export interface AnalyticsActivity {
  id: string;
  type: string;
  category?: ActivityCategory;
  name?: string | null;
  date: string;
  distance_km: number | null;
  duration_minutes: number | null;
  avg_hr: number | null;
  max_hr?: number | null;
  elevation_gain?: number | null;
}

/**
 * Dataset structure shared between SQLite storage, sample-data mode,
 * and the TypeScript port of analytics.py.
 */
export interface AnalyticsDataset {
  sleep: Record<string, SleepEntry>;
  hrv: Record<string, HrvEntry>;
  rhr: Record<string, RhrEntry>;
  stress: Record<string, StressEntry>;
  body_battery: Record<string, BodyBatteryEntry>;
  activities: {
    trail: AnalyticsActivity[];
    road: AnalyticsActivity[];
    strength?: AnalyticsActivity[];
    other?: AnalyticsActivity[];
    all?: AnalyticsActivity[];
  };
}
