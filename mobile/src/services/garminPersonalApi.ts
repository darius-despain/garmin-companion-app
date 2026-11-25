/**
 * TypeScript client for Garmin's official Connect Personal API (GAR-002).
 *
 * - Zero-server: runs directly in Expo Go / Android APK against
 *   https://personal.connectapi.garmin.com, or against the local dev CORS proxy on Expo Web.
 * - Never logs or embeds API keys or bearer tokens in errors or outputs.
 */

import type { ActivityCategory, ActivityRecord, DailyMetricRecord } from "../types/garmin";

export const DEFAULT_GARMIN_API_BASE_URL = "https://personal.connectapi.garmin.com";
export const LOCAL_WEB_PROXY_BASE_URL = "http://127.0.0.1:8787";

const TOKEN_EXCHANGE_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Renew 5 minutes before expiry

export const GARMIN_RANGE_LIMITS = {
  stressDays: 28,
  sleepDays: 31,
  bodyBatteryDays: 31,
  hrvDays: 365,
  dailySummaryDays: 365,
  activityPageLimit: 50,
} as const;

const TRAIL_RUN_TYPES = new Set(["trail_run", "trail_running", "trailrun"]);
const ROAD_RUN_TYPES = new Set([
  "run",
  "running",
  "road_run",
  "roadrunning",
  "street_running",
  "treadmill_running",
  "track_running",
]);
const STRENGTH_TYPES = new Set([
  "strength_training",
  "strength",
  "indoor_cardio",
  "hiit",
  "crossfit",
  "weight_training",
]);

export class GarminAuthError extends Error {
  readonly status?: number;
  readonly requiresKeyReplacement: boolean;

  constructor(message: string, options: { status?: number; requiresKeyReplacement?: boolean } = {}) {
    super(message);
    this.name = "GarminAuthError";
    this.status = options.status;
    this.requiresKeyReplacement = options.requiresKeyReplacement ?? false;
  }
}

export class GarminApiError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "GarminApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface BearerToken {
  token: string;
  expiresAtMs: number;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GarminPersonalApiOptions {
  apiKeyProvider: () => Promise<string | null>;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  nowMs?: () => number;
  sleepMs?: (ms: number) => Promise<void>;
  maxRetries?: number;
  initialBackoffMs?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf8");
    }
    if (typeof atob === "function") {
      return atob(padded);
    }
    return null;
  } catch {
    return null;
  }
}

export function extractJwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as { exp?: unknown };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseTokenResponse(rawBody: string, nowMs: number): BearerToken {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    throw new GarminAuthError("Garmin token endpoint returned an empty response.");
  }

  let token: string | null = null;
  let expiresAtMs: number | null = null;

  if (trimmed.startsWith("{")) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new GarminAuthError("Garmin token endpoint returned malformed JSON.");
    }
    const candidate = parsed.access_token ?? parsed.token ?? parsed.jwt;
    if (typeof candidate === "string" && candidate.trim()) {
      token = candidate.trim();
    }
    if (typeof parsed.expires_in === "number" && parsed.expires_in > 0) {
      expiresAtMs = nowMs + parsed.expires_in * 1000;
    } else if (typeof parsed.expiresAt === "number" && parsed.expiresAt > 0) {
      expiresAtMs = parsed.expiresAt > 1e12 ? parsed.expiresAt : parsed.expiresAt * 1000;
    } else if (typeof parsed.expiresAt === "string") {
      const parsedDate = Date.parse(parsed.expiresAt);
      if (Number.isFinite(parsedDate)) {
        expiresAtMs = parsedDate;
      }
    }
  } else {
    token = trimmed.replace(/^"|"$/g, "");
  }

  if (!token) {
    throw new GarminAuthError("Garmin token response did not contain a bearer token.");
  }

  const resolvedExpiry = expiresAtMs ?? extractJwtExpiryMs(token) ?? nowMs + DEFAULT_TOKEN_TTL_MS;
  return { token, expiresAtMs: resolvedExpiry };
}

export function splitDateRange(
  startDate: string,
  endDate: string,
  maxDaysPerChunk: number
): Array<{ start: string; end: string }> {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);
  if (start > end) {
    return [];
  }

  const chunks: Array<{ start: string; end: string }> = [];
  let cursor = new Date(start.getTime());
  while (cursor <= end) {
    const chunkEnd = new Date(cursor.getTime());
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + Math.max(1, maxDaysPerChunk) - 1);
    const clampedEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({
      start: formatIsoDateUtc(cursor),
      end: formatIsoDateUtc(clampedEnd),
    });
    cursor = new Date(clampedEnd.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

export function parseIsoDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(dateStr: string, deltaDays: number): string {
  const dt = parseIsoDateUtc(dateStr);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return formatIsoDateUtc(dt);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function classifyActivityCategory(rawTypeKey: string): ActivityCategory {
  const normalized = rawTypeKey.toLowerCase().trim();
  if (TRAIL_RUN_TYPES.has(normalized) || normalized.includes("trail")) {
    return "trail_run";
  }
  if (ROAD_RUN_TYPES.has(normalized) || normalized.includes("run")) {
    return "road_run";
  }
  if (STRENGTH_TYPES.has(normalized) || normalized.includes("strength")) {
    return "strength";
  }
  return "other";
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeActivityPayload(raw: Record<string, unknown>): ActivityRecord | null {
  const idRaw = raw.activityId ?? raw.id;
  if (idRaw === undefined || idRaw === null || String(idRaw).trim() === "") {
    return null;
  }

  const activityTypeObj =
    raw.activityType && typeof raw.activityType === "object"
      ? (raw.activityType as Record<string, unknown>)
      : null;
  const activityType =
    asNullableString(activityTypeObj?.typeKey) ??
    asNullableString(raw.activityType) ??
    asNullableString(raw.type) ??
    "other";

  const startTimeLocal = asNullableString(raw.startTimeLocal) ?? asNullableString(raw.startTimeGMT);
  const dateStr =
    asNullableString(raw.calendarDate)?.slice(0, 10) ??
    (startTimeLocal ? startTimeLocal.slice(0, 10) : null);
  if (!dateStr) {
    return null;
  }

  let utcOffsetSeconds: number | null = asFiniteNumber(raw.utcOffsetSeconds);
  if (utcOffsetSeconds === null && typeof raw.startTimeLocal === "string" && typeof raw.startTimeGMT === "string") {
    const localMs = Date.parse(raw.startTimeLocal.replace(" ", "T") + "Z");
    const gmtMs = Date.parse(raw.startTimeGMT.replace(" ", "T") + "Z");
    if (Number.isFinite(localMs) && Number.isFinite(gmtMs)) {
      utcOffsetSeconds = Math.round((localMs - gmtMs) / 1000);
    }
  }

  // Explicit unit conversions per Garmin Personal API spec:
  // distance is in meters -> km; duration is in seconds -> minutes.
  const distanceMeters = asFiniteNumber(raw.distance);
  const durationSeconds = asFiniteNumber(raw.duration);

  return {
    garminId: String(idRaw),
    date: dateStr,
    startTimeLocal,
    utcOffsetSeconds,
    activityType,
    category: classifyActivityCategory(activityType),
    name: asNullableString(raw.activityName) ?? asNullableString(raw.name),
    distanceKm: distanceMeters !== null ? roundTo(distanceMeters / 1000, 4) : null,
    durationMinutes: durationSeconds !== null ? roundTo(durationSeconds / 60, 2) : null,
    avgHr: asFiniteNumber(raw.averageHR ?? raw.avgHR ?? raw.avg_hr),
    maxHr: asFiniteNumber(raw.maxHR ?? raw.max_hr),
    elevationGainM: asFiniteNumber(raw.elevationGain ?? raw.totalElevationGain),
  };
}

export function normalizeSleepPayload(
  payload: unknown
): Map<string, { sleepDurationHours: number | null; sleepScore: number | null }> {
  const result = new Map<string, { sleepDurationHours: number | null; sleepScore: number | null }>();
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).dailySleepDTOs)
      ? ((payload as Record<string, unknown>).dailySleepDTOs as unknown[])
      : payload && typeof payload === "object" && (payload as Record<string, unknown>).dailySleepDTO
        ? [(payload as Record<string, unknown>).dailySleepDTO]
        : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const dto =
      row.dailySleepDTO && typeof row.dailySleepDTO === "object"
        ? (row.dailySleepDTO as Record<string, unknown>)
        : row;
    const date = asNullableString(dto.calendarDate)?.slice(0, 10);
    if (!date) continue;

    const sleepSeconds = asFiniteNumber(dto.sleepTimeSeconds ?? dto.totalSleepSeconds);
    const sleepScores =
      dto.sleepScores && typeof dto.sleepScores === "object"
        ? (dto.sleepScores as Record<string, unknown>)
        : null;
    const overallScoreObj =
      sleepScores?.overall && typeof sleepScores.overall === "object"
        ? (sleepScores.overall as Record<string, unknown>)
        : null;
    const sleepScore = asFiniteNumber(overallScoreObj?.value ?? dto.sleepScore);

    result.set(date, {
      sleepDurationHours: sleepSeconds !== null ? roundTo(sleepSeconds / 3600, 2) : null,
      sleepScore,
    });
  }
  return result;
}

export function normalizeHrvPayload(
  payload: unknown
): Map<string, { hrvValue: number | null; hrvBaseline: number | null; hrvStatus: string | null }> {
  const result = new Map<
    string,
    { hrvValue: number | null; hrvBaseline: number | null; hrvStatus: string | null }
  >();
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).hrvSummaries)
      ? ((payload as Record<string, unknown>).hrvSummaries as unknown[])
      : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = asNullableString(row.calendarDate)?.slice(0, 10);
    if (!date) continue;

    const baselineObj =
      row.baseline && typeof row.baseline === "object"
        ? (row.baseline as Record<string, unknown>)
        : null;
    const balancedLow = asFiniteNumber(baselineObj?.balancedLow);
    const balancedUpper = asFiniteNumber(baselineObj?.balancedUpper);
    const computedBaseline =
      balancedLow !== null && balancedUpper !== null
        ? roundTo((balancedLow + balancedUpper) / 2, 1)
        : asFiniteNumber(row.weeklyAvg ?? row.hrvBaseline);

    const hrvValue = asFiniteNumber(row.lastNightAvg ?? row.hrvValue ?? row.weeklyAvg);
    const hrvStatus = asNullableString(row.status);

    result.set(date, {
      hrvValue,
      hrvBaseline: computedBaseline,
      hrvStatus,
    });
  }
  return result;
}

export function normalizeStressPayload(payload: unknown): Map<string, { stress: number | null }> {
  const result = new Map<string, { stress: number | null }>();
  const items = Array.isArray(payload) ? payload : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = asNullableString(row.calendarDate)?.slice(0, 10);
    if (!date) continue;

    const values =
      row.values && typeof row.values === "object" ? (row.values as Record<string, unknown>) : row;
    const rawStress = asFiniteNumber(
      values.overallStressLevel ?? values.avgStressLevel ?? values.averageStressLevel ?? values.stress
    );
    // Garmin uses negative sentinel values (e.g. -1, -2) when unmeasured.
    const stress = rawStress !== null && rawStress >= 0 ? rawStress : null;
    result.set(date, { stress });
  }
  return result;
}

export function normalizeBodyBatteryPayload(
  payload: unknown
): Map<string, { bodyBattery: number | null }> {
  const result = new Map<string, { bodyBattery: number | null }>();
  const items = Array.isArray(payload) ? payload : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = asNullableString(row.date ?? row.calendarDate)?.slice(0, 10);
    if (!date) continue;

    let bodyBattery = asFiniteNumber(
      row.bodyBatteryMostRecentValue ??
        row.bodyBatteryHighestValue ??
        row.highestValue ??
        row.mostRecentValue ??
        row.charged
    );

    if (bodyBattery === null && Array.isArray(row.bodyBatteryValuesArray)) {
      const readings = (row.bodyBatteryValuesArray as unknown[])
        .map((pair) => (Array.isArray(pair) ? asFiniteNumber(pair[1]) : null))
        .filter((v): v is number => v !== null && v >= 0);
      if (readings.length > 0) {
        bodyBattery = readings[readings.length - 1];
      }
    }

    result.set(date, { bodyBattery });
  }
  return result;
}

export function normalizeDailySummariesPayload(
  payload: unknown
): Map<string, { restingHr: number | null; stress: number | null; bodyBattery: number | null }> {
  const result = new Map<
    string,
    { restingHr: number | null; stress: number | null; bodyBattery: number | null }
  >();
  const items = Array.isArray(payload) ? payload : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = asNullableString(row.calendarDate)?.slice(0, 10);
    if (!date) continue;

    const rhr = asFiniteNumber(row.restingHeartRate);
    const rawStress = asFiniteNumber(row.averageStressLevel);
    const bb = asFiniteNumber(
      row.bodyBatteryMostRecentValue ?? row.bodyBatteryHighestValue ?? row.bodyBatteryAtWakeTime
    );

    result.set(date, {
      restingHr: rhr !== null && rhr > 0 ? rhr : null,
      stress: rawStress !== null && rawStress >= 0 ? rawStress : null,
      bodyBattery: bb !== null && bb >= 0 ? bb : null,
    });
  }
  return result;
}

export class PersonalApiAuthenticator {
  private cachedToken: BearerToken | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly nowMs: () => number;

  constructor(private readonly options: GarminPersonalApiOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_GARMIN_API_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  clearCachedToken(): void {
    this.cachedToken = null;
  }

  async getBearerToken(forceRefresh = false): Promise<string> {
    const now = this.nowMs();
    if (
      !forceRefresh &&
      this.cachedToken &&
      now < this.cachedToken.expiresAtMs - TOKEN_REFRESH_BUFFER_MS
    ) {
      return this.cachedToken.token;
    }

    const apiKey = await this.options.apiKeyProvider();
    if (!apiKey || !apiKey.trim()) {
      throw new GarminAuthError(
        "No Garmin Personal API key configured. Add your key in Settings to sync.",
        { requiresKeyReplacement: true }
      );
    }

    const response = await this.fetchImpl(`${this.baseUrl}${TOKEN_EXCHANGE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${apiKey.trim()}`,
        Accept: "application/json",
      },
    });

    if (response.status === 401 || response.status === 403) {
      this.cachedToken = null;
      throw new GarminAuthError(
        "Garmin Personal API key is invalid or expired. Generate a new key in Garmin Connect settings and update it in the app.",
        { status: response.status, requiresKeyReplacement: true }
      );
    }

    if (!response.ok) {
      throw new GarminApiError(
        `Failed to exchange Garmin Personal API key (HTTP ${response.status}).`,
        response.status,
        TOKEN_EXCHANGE_PATH
      );
    }

    const bodyText = await response.text();
    this.cachedToken = parseTokenResponse(bodyText, now);
    return this.cachedToken.token;
  }
}

export class GarminPersonalApiClient {
  readonly auth: PersonalApiAuthenticator;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleepMs: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;

  constructor(options: GarminPersonalApiOptions) {
    this.auth = new PersonalApiAuthenticator(options);
    this.baseUrl = (options.baseUrl ?? DEFAULT_GARMIN_API_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleepMs = options.sleepMs ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 250;
  }

  private parseRetryAfterMs(response: Response): number | null {
    const header = response.headers?.get?.("retry-after");
    if (!header) return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const targetMs = Date.parse(header);
    if (Number.isFinite(targetMs)) {
      return Math.max(0, targetMs - Date.now());
    }
    return null;
  }

  async getJson<T = unknown>(path: string): Promise<T> {
    let token = await this.auth.getBearerToken(false);
    let retriedAuth = false;
    let attempt = 0;

    while (true) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (response.status === 401 && !retriedAuth) {
        retriedAuth = true;
        this.auth.clearCachedToken();
        token = await this.auth.getBearerToken(true);
        continue;
      }

      if (response.status === 401) {
        throw new GarminAuthError(
          "Garmin Personal API authorization failed after token renewal. Please replace your API key.",
          { status: 401, requiresKeyReplacement: true }
        );
      }

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = this.parseRetryAfterMs(response);
        const backoff = retryAfter ?? this.initialBackoffMs * 2 ** attempt;
        attempt += 1;
        await this.sleepMs(backoff);
        continue;
      }

      if (!response.ok) {
        throw new GarminApiError(
          `Garmin Personal API request failed with HTTP ${response.status}`,
          response.status,
          path
        );
      }

      const text = await response.text();
      if (!text.trim()) {
        return [] as unknown as T;
      }
      return JSON.parse(text) as T;
    }
  }

  async fetchActivities(startDate: string, endDate: string, maxPages = 20): Promise<ActivityRecord[]> {
    const limit = GARMIN_RANGE_LIMITS.activityPageLimit;
    const collected: ActivityRecord[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < maxPages; page += 1) {
      const start = page * limit;
      const query = new URLSearchParams({
        start: String(start),
        limit: String(limit),
        startDate,
        endDate,
      });
      const payload = await this.getJson<unknown>(
        `/activitylist-service/activities/search/activities?${query.toString()}`
      );
      if (!Array.isArray(payload) || payload.length === 0) {
        break;
      }

      let reachedBeforeStart = false;
      for (const raw of payload) {
        if (!raw || typeof raw !== "object") continue;
        const normalized = normalizeActivityPayload(raw as Record<string, unknown>);
        if (!normalized) continue;
        if (normalized.date < startDate) {
          reachedBeforeStart = true;
          continue;
        }
        if (normalized.date > endDate) {
          continue;
        }
        if (!seenIds.has(normalized.garminId)) {
          seenIds.add(normalized.garminId);
          collected.push(normalized);
        }
      }

      if (payload.length < limit || reachedBeforeStart) {
        break;
      }
    }

    return collected;
  }

  async fetchSleepRange(
    startDate: string,
    endDate: string
  ): Promise<Map<string, { sleepDurationHours: number | null; sleepScore: number | null }>> {
    const merged = new Map<string, { sleepDurationHours: number | null; sleepScore: number | null }>();
    for (const chunk of splitDateRange(startDate, endDate, GARMIN_RANGE_LIMITS.sleepDays)) {
      const payload = await this.getJson<unknown>(
        `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${chunk.start}&endDate=${chunk.end}`
      );
      for (const [date, val] of normalizeSleepPayload(payload)) {
        merged.set(date, val);
      }
    }
    return merged;
  }

  async fetchHrvRange(
    startDate: string,
    endDate: string
  ): Promise<Map<string, { hrvValue: number | null; hrvBaseline: number | null; hrvStatus: string | null }>> {
    const merged = new Map<
      string,
      { hrvValue: number | null; hrvBaseline: number | null; hrvStatus: string | null }
    >();
    for (const chunk of splitDateRange(startDate, endDate, GARMIN_RANGE_LIMITS.hrvDays)) {
      const payload = await this.getJson<unknown>(`/hrv-service/hrv/daily/${chunk.start}/${chunk.end}`);
      for (const [date, val] of normalizeHrvPayload(payload)) {
        merged.set(date, val);
      }
    }
    return merged;
  }

  async fetchStressRange(startDate: string, endDate: string): Promise<Map<string, { stress: number | null }>> {
    const merged = new Map<string, { stress: number | null }>();
    for (const chunk of splitDateRange(startDate, endDate, GARMIN_RANGE_LIMITS.stressDays)) {
      const payload = await this.getJson<unknown>(
        `/usersummary-service/stats/stress/daily/${chunk.start}/${chunk.end}`
      );
      for (const [date, val] of normalizeStressPayload(payload)) {
        merged.set(date, val);
      }
    }
    return merged;
  }

  async fetchBodyBatteryRange(
    startDate: string,
    endDate: string
  ): Promise<Map<string, { bodyBattery: number | null }>> {
    const merged = new Map<string, { bodyBattery: number | null }>();
    for (const chunk of splitDateRange(startDate, endDate, GARMIN_RANGE_LIMITS.bodyBatteryDays)) {
      const payload = await this.getJson<unknown>(
        `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${chunk.start}&endDate=${chunk.end}`
      );
      for (const [date, val] of normalizeBodyBatteryPayload(payload)) {
        merged.set(date, val);
      }
    }
    return merged;
  }

  async fetchDailySummariesRange(
    startDate: string,
    endDate: string
  ): Promise<Map<string, { restingHr: number | null; stress: number | null; bodyBattery: number | null }>> {
    const merged = new Map<
      string,
      { restingHr: number | null; stress: number | null; bodyBattery: number | null }
    >();
    for (const chunk of splitDateRange(startDate, endDate, GARMIN_RANGE_LIMITS.dailySummaryDays)) {
      const payload = await this.getJson<unknown>(
        `/usersummary-service/v2/dailysummaries?startDate=${chunk.start}&endDate=${chunk.end}`
      );
      for (const [date, val] of normalizeDailySummariesPayload(payload)) {
        merged.set(date, val);
      }
    }
    return merged;
  }
}

export function mergeDailyMetrics(
  dates: Iterable<string>,
  sources: {
    sleep?: Map<string, { sleepDurationHours: number | null; sleepScore: number | null }>;
    hrv?: Map<string, { hrvValue: number | null; hrvBaseline: number | null; hrvStatus: string | null }>;
    stress?: Map<string, { stress: number | null }>;
    bodyBattery?: Map<string, { bodyBattery: number | null }>;
    dailySummaries?: Map<
      string,
      { restingHr: number | null; stress: number | null; bodyBattery: number | null }
    >;
  }
): DailyMetricRecord[] {
  const uniqueDates = Array.from(new Set(dates)).sort();
  return uniqueDates.map((date) => {
    const s = sources.sleep?.get(date);
    const h = sources.hrv?.get(date);
    const st = sources.stress?.get(date);
    const bb = sources.bodyBattery?.get(date);
    const ds = sources.dailySummaries?.get(date);

    return {
      date,
      sleepDurationHours: s?.sleepDurationHours ?? null,
      sleepScore: s?.sleepScore ?? null,
      hrvValue: h?.hrvValue ?? null,
      hrvBaseline: h?.hrvBaseline ?? null,
      hrvStatus: h?.hrvStatus ?? null,
      restingHr: ds?.restingHr ?? null,
      stress: st?.stress ?? ds?.stress ?? null,
      bodyBattery: bb?.bodyBattery ?? ds?.bodyBattery ?? null,
    };
  });
}
