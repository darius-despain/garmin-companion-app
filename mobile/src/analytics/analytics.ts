/**
 * TypeScript port of analytics.py (GAR-010).
 *
 * Implements core analytical logic with fixture parity against analytics.py:
 * - Readiness Budget calculation (HRV, RHR, Sleep components)
 * - Aerobic efficiency index
 * - Conditioning trend detection
 * - Gap diagnosis rules
 */

import type { AnalyticsActivity, AnalyticsDataset } from "../types/garmin";

export type ReadinessStatus = "PUSH" | "CRUISE" | "RECOVER";

export interface ReadinessBreakdownItem {
  score: number;
  weight: number;
  weighted: number;
}

export interface ReadinessResult {
  score: number;
  status: ReadinessStatus;
  hrv_component: number;
  rhr_component: number;
  sleep_component: number;
  available: boolean;
  missing_inputs: string[];
  breakdown: {
    hrv: ReadinessBreakdownItem;
    rhr: ReadinessBreakdownItem;
    sleep: ReadinessBreakdownItem;
    total: number;
    status: ReadinessStatus;
  };
}

export interface ConditioningTrend {
  direction: "Improving" | "Holding" | "Slumping" | "No Data";
  aerobic_efficiency_current: number;
  aerobic_efficiency_baseline: number;
  efficiency_change_pct: number;
  runs_analyzed: number;
  hrv_trend: number[];
  rhr_trend: number[];
}

export interface GapItem {
  type: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  details: string;
  score: number;
}

export interface GapAnalysis {
  primary_gap: string;
  priority: "High" | "Medium" | "Low";
  details: string;
  all_gaps: GapItem[];
}

/**
 * Exact IEEE-754 decimal round-half-to-even matching Python's built-in round().
 */
export function roundPython(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  // Exact decimal expansion of IEEE-754 float via toFixed(decimals + 12) matches Python's dtoa rounding
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const scaled = abs * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;

  let rounded: number;
  if (diff > 0.5) {
    rounded = floor + 1;
  } else if (diff < 0.5) {
    rounded = floor;
  } else {
    // Exact binary half: check exact decimal expansion to see if abs > (floor + 0.5) / factor
    const exactStr = abs.toFixed(decimals + 15);
    const dotIdx = exactStr.indexOf(".");
    const frac = dotIdx >= 0 ? exactStr.slice(dotIdx + 1) : "";
    const guardDigit = Number(frac[decimals] ?? "0");
    const tail = frac.slice(decimals + 1);
    const hasNonZeroTail = /[1-9]/.test(tail);
    if (guardDigit > 5 || (guardDigit === 5 && hasNonZeroTail)) {
      rounded = floor + 1;
    } else if (guardDigit < 5) {
      rounded = floor;
    } else {
      rounded = floor % 2 === 0 ? floor : floor + 1;
    }
  }
  const result = (sign * rounded) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function mean(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function defaultYesterdayIso(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmdUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function calculateHrvComponent(dataset: AnalyticsDataset, today: string): number {
  const hrvData = dataset.hrv ?? {};
  const entry = hrvData[today];
  if (!entry) {
    return 50.0;
  }

  const currentHrv = entry.hrv_value;
  const baselineHrv = entry.hrv_baseline;

  if (!currentHrv || !baselineHrv || baselineHrv <= 0) {
    return 50.0;
  }

  const ratio = currentHrv / baselineHrv;

  if (ratio >= 1.2) {
    return 100.0;
  }
  if (ratio >= 1.0) {
    return 70 + (ratio - 1.0) * 150;
  }
  if (ratio >= 0.8) {
    return (70 * (ratio - 0.8)) / 0.2;
  }
  return Math.max(0.0, (ratio / 0.8) * 50);
}

export function calculateRhrComponent(dataset: AnalyticsDataset, today: string): number {
  const rhrData = dataset.rhr ?? {};
  const entry = rhrData[today];
  if (!entry) {
    return 50.0;
  }

  const currentRhr = entry.resting_hr;
  if (!currentRhr || currentRhr <= 0) {
    return 50.0;
  }

  const rhrValues: number[] = [];
  for (const data of Object.values(rhrData)) {
    const rhr = data?.resting_hr;
    if (rhr && rhr > 0) {
      rhrValues.push(rhr);
    }
  }

  if (rhrValues.length < 3) {
    return 50.0;
  }

  const avgRhr = mean(rhrValues);
  const deviation = (avgRhr - currentRhr) / avgRhr;

  if (deviation >= 0.05) {
    return Math.min(100.0, 90 + deviation * 200);
  }
  if (deviation >= 0) {
    return 50 + deviation * 800;
  }
  if (deviation >= -0.05) {
    return 50 + deviation * 800;
  }
  return Math.max(0.0, 10 + (deviation + 0.05) * 200);
}

export function calculateSleepComponent(dataset: AnalyticsDataset, today: string): number {
  const sleepData = dataset.sleep ?? {};
  const entry = sleepData[today];
  if (!entry) {
    return 50.0;
  }

  const duration = entry.sleep_duration_hours;
  if (!duration || duration <= 0) {
    return 50.0;
  }

  const targetHours = 8.0;
  if (duration >= targetHours) {
    return 100.0;
  }
  if (duration >= 7.0) {
    return 75 + (duration - 7.0) * 25;
  }
  if (duration >= 6.0) {
    return 50 + (duration - 6.0) * 25;
  }
  if (duration >= 5.0) {
    return 25 + (duration - 5.0) * 25;
  }
  return Math.max(0.0, duration * 6.25);
}

export function calculateReadinessBudget(
  dataset: AnalyticsDataset,
  today?: string
): ReadinessResult {
  const targetDay = today ?? defaultYesterdayIso();

  const missingInputs: string[] = [];
  const hrvEntry = dataset.hrv?.[targetDay];
  if (!hrvEntry?.hrv_value || !hrvEntry?.hrv_baseline || hrvEntry.hrv_baseline <= 0) {
    missingInputs.push("hrv");
  }
  const rhrEntry = dataset.rhr?.[targetDay];
  const validRhrCount = Object.values(dataset.rhr ?? {}).filter(
    (d) => d?.resting_hr && d.resting_hr > 0
  ).length;
  if (!rhrEntry?.resting_hr || rhrEntry.resting_hr <= 0 || validRhrCount < 3) {
    missingInputs.push("rhr");
  }
  const sleepEntry = dataset.sleep?.[targetDay];
  if (!sleepEntry?.sleep_duration_hours || sleepEntry.sleep_duration_hours <= 0) {
    missingInputs.push("sleep");
  }

  const hrvComponent = calculateHrvComponent(dataset, targetDay);
  const rhrComponent = calculateRhrComponent(dataset, targetDay);
  const sleepComponent = calculateSleepComponent(dataset, targetDay);

  const composite = hrvComponent * 0.4 + rhrComponent * 0.3 + sleepComponent * 0.3;
  const score = Math.max(0.0, Math.min(100.0, composite));

  let status: ReadinessStatus;
  if (score >= 75) {
    status = "PUSH";
  } else if (score >= 45) {
    status = "CRUISE";
  } else {
    status = "RECOVER";
  }

  const breakdown = {
    hrv: {
      score: roundPython(hrvComponent, 1),
      weight: 40,
      weighted: roundPython(hrvComponent * 0.4, 1),
    },
    rhr: {
      score: roundPython(rhrComponent, 1),
      weight: 30,
      weighted: roundPython(rhrComponent * 0.3, 1),
    },
    sleep: {
      score: roundPython(sleepComponent, 1),
      weight: 30,
      weighted: roundPython(sleepComponent * 0.3, 1),
    },
    total: roundPython(score, 1),
    status,
  };

  return {
    score: roundPython(score, 1),
    status,
    hrv_component: roundPython(hrvComponent, 1),
    rhr_component: roundPython(rhrComponent, 1),
    sleep_component: roundPython(sleepComponent, 1),
    available: missingInputs.length === 0,
    missing_inputs: missingInputs,
    breakdown,
  };
}

export function calculateAerobicEfficiency(
  activity: Partial<AnalyticsActivity>,
  restingHr?: number | null
): number | null {
  const avgHr = activity.avg_hr;
  const distanceKm = activity.distance_km;
  const durationMin = activity.duration_minutes;

  if (!avgHr || !distanceKm || !durationMin) {
    return null;
  }
  if (distanceKm <= 0 || durationMin <= 0) {
    return null;
  }

  const pace = durationMin / distanceKm;
  const resolvedRhr = restingHr === undefined || restingHr === null ? Math.max(40, avgHr - 50) : restingHr;
  const hrReserve = avgHr - resolvedRhr;

  if (hrReserve <= 0) {
    return null;
  }

  const efficiency = pace / hrReserve;
  return roundPython(efficiency, 4);
}

export function analyzeConditioningTrend(dataset: AnalyticsDataset): ConditioningTrend {
  const trail = dataset.activities?.trail ?? [];
  const road = dataset.activities?.road ?? [];
  const allRuns = [...trail, ...road];

  if (allRuns.length === 0) {
    return {
      direction: "No Data",
      aerobic_efficiency_current: 0,
      aerobic_efficiency_baseline: 0,
      efficiency_change_pct: 0,
      runs_analyzed: 0,
      hrv_trend: [],
      rhr_trend: [],
    };
  }

  const rhrData = dataset.rhr ?? {};
  const rhrValues = Object.values(rhrData)
    .map((d) => d?.resting_hr)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgRhr = rhrValues.length > 0 ? mean(rhrValues) : 50;

  const efficiencies: Array<{ date: string; efficiency: number; distance: number }> = [];
  for (const run of allRuns) {
    const eff = calculateAerobicEfficiency(run, avgRhr);
    if (eff) {
      efficiencies.push({
        date: (run.date ?? "").slice(0, 10),
        efficiency: eff,
        distance: run.distance_km ?? 0,
      });
    }
  }

  if (efficiencies.length === 0) {
    return {
      direction: "No Data",
      aerobic_efficiency_current: 0,
      aerobic_efficiency_baseline: 0,
      efficiency_change_pct: 0,
      runs_analyzed: 0,
      hrv_trend: [],
      rhr_trend: [],
    };
  }

  efficiencies.sort((a, b) => a.date.localeCompare(b.date));

  const timestamps = efficiencies.map((e) => parseYmdUtcMs(e.date));
  const maxDateMs = Math.max(...timestamps);
  const cutoffMs = maxDateMs - 7 * 24 * 60 * 60 * 1000;

  const currentEff = efficiencies.filter((_, i) => timestamps[i] >= cutoffMs);
  const baselineEff = efficiencies.filter((_, i) => timestamps[i] < cutoffMs);

  const currentAvg = currentEff.length > 0 ? mean(currentEff.map((e) => e.efficiency)) : 0;
  const baselineAvg = baselineEff.length > 0 ? mean(baselineEff.map((e) => e.efficiency)) : 0;

  const changePct = baselineAvg > 0 ? ((baselineAvg - currentAvg) / baselineAvg) * 100 : 0;

  let direction: ConditioningTrend["direction"];
  if (changePct >= 5) {
    direction = "Improving";
  } else if (changePct <= -5) {
    direction = "Slumping";
  } else {
    direction = "Holding";
  }

  const hrvData = dataset.hrv ?? {};
  const hrvTrend: number[] = [];
  for (const dateStr of Object.keys(hrvData).sort().slice(-7)) {
    const val = hrvData[dateStr]?.hrv_value;
    if (val) {
      hrvTrend.push(val);
    }
  }

  const rhrTrend: number[] = [];
  for (const dateStr of Object.keys(rhrData).sort().slice(-7)) {
    const val = rhrData[dateStr]?.resting_hr;
    if (val) {
      rhrTrend.push(val);
    }
  }

  return {
    direction,
    aerobic_efficiency_current: roundPython(currentAvg, 4),
    aerobic_efficiency_baseline: roundPython(baselineAvg, 4),
    efficiency_change_pct: roundPython(changePct, 1),
    runs_analyzed: efficiencies.length,
    hrv_trend: hrvTrend,
    rhr_trend: rhrTrend,
  };
}

export function diagnoseGaps(dataset: AnalyticsDataset, now: Date = new Date()): GapAnalysis {
  const gaps: GapItem[] = [];

  // --- Rule 1: Sleep Deficit ---
  const sleepData = dataset.sleep ?? {};
  const recentSleep: number[] = [];
  for (const dateStr of Object.keys(sleepData).sort().slice(-3)) {
    const dur = sleepData[dateStr]?.sleep_duration_hours;
    if (dur) {
      recentSleep.push(dur);
    }
  }

  if (recentSleep.length > 0 && mean(recentSleep) < 7.0) {
    const avgSleep = mean(recentSleep);
    gaps.push({
      type: "sleep_deficit",
      title: "Primary Gap: Sleep Deficit",
      priority: "High",
      details:
        `3-day sleep average: ${roundPython(avgSleep, 1).toFixed(1)} hours (target: 7+). ` +
        "High priority for cellular & muscular recovery.",
      score: 90,
    });
  }

  // --- Rule 2: High Stress on Rest Days ---
  const stressData = dataset.stress ?? {};
  const activities = dataset.activities ?? { trail: [], road: [] };

  const allDates = new Set<string>();
  for (const actList of [activities.trail ?? [], activities.road ?? []]) {
    for (const act of actList) {
      allDates.add((act.date ?? "").slice(0, 10));
    }
  }

  const restDayStress: number[] = [];
  for (const dateStr of Object.keys(stressData).sort().slice(-7)) {
    if (!allDates.has(dateStr)) {
      const stressVal = stressData[dateStr]?.stress;
      if (stressVal !== null && stressVal !== undefined) {
        restDayStress.push(stressVal);
      }
    }
  }

  if (restDayStress.length > 0 && mean(restDayStress) > 40) {
    const avgStress = mean(restDayStress);
    gaps.push({
      type: "high_stress",
      title: "Primary Gap: High Parasympathetic Suppression",
      priority: "High",
      details:
        `Rest day stress average: ${roundPython(avgStress, 0).toFixed(0)} (>40). ` +
        "Consider active relaxation, breathwork, or meditation.",
      score: 85,
    });
  }

  // --- Rule 3: Recovery Window Deficit ---
  const runDates = new Set<string>();
  const cutoffMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  for (const actList of [activities.trail ?? [], activities.road ?? []]) {
    for (const act of actList) {
      const dateStr = (act.date ?? "").slice(0, 10);
      if (!dateStr) continue;
      // Match Python's datetime.strptime(date_str, "%Y-%m-%d") >= datetime.now() - timedelta(days=7)
      const [y, m, d] = dateStr.split("-").map(Number);
      const actDateMs = new Date(y, m - 1, d).getTime();
      if (actDateMs >= cutoffMs) {
        runDates.add(dateStr);
      }
    }
  }

  if (runDates.size > 5) {
    gaps.push({
      type: "recovery_deficit",
      title: "Primary Gap: Recovery Window Deficit",
      priority: "High",
      details:
        `${runDates.size} running days in last 7 days with zero rest days. ` +
        "Schedule a full non-impact day.",
      score: 80,
    });
  }

  // --- Secondary Gap: Low HRV trend ---
  const hrvData = dataset.hrv ?? {};
  const hrvValues = Object.values(hrvData)
    .map((d) => d?.hrv_value)
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (hrvValues.length >= 7) {
    const recentHrv = hrvValues.slice(-7);
    const baselineHrv = hrvValues.length > 7 ? hrvValues.slice(0, -7) : hrvValues;
    if (mean(recentHrv) < mean(baselineHrv) * 0.85) {
      gaps.push({
        type: "hrv_decline",
        title: "Secondary Gap: HRV Declining",
        priority: "Medium",
        details: "7-day HRV average is 15% below baseline. Consider reducing training intensity.",
        score: 60,
      });
    }
  }

  // --- Secondary Gap: Elevated RHR trend ---
  const rhrValues = Object.values(dataset.rhr ?? {})
    .map((d) => d?.resting_hr)
    .filter((v): v is number => typeof v === "number" && v > 0);
  if (rhrValues.length >= 7) {
    const recentRhr = rhrValues.slice(-7);
    const baselineRhr = rhrValues.length > 7 ? rhrValues.slice(0, -7) : rhrValues;
    if (mean(recentRhr) > mean(baselineRhr) * 1.05) {
      gaps.push({
        type: "rhr_elevated",
        title: "Secondary Gap: Elevated Resting HR",
        priority: "Medium",
        details: "7-day RHR average is 5% above baseline. Monitor for overtraining or illness.",
        score: 55,
      });
    }
  }

  gaps.sort((a, b) => b.score - a.score);

  if (gaps.length > 0) {
    const primary = gaps[0];
    return {
      primary_gap: primary.title,
      priority: primary.priority,
      details: primary.details,
      all_gaps: gaps,
    };
  }

  return {
    primary_gap: "No significant gaps detected",
    priority: "Low",
    details: "All metrics within normal ranges. Continue current routine.",
    all_gaps: [],
  };
}

export function formatConditioningTrend(trend: ConditioningTrend): string {
  if (trend.direction === "No Data") {
    return "Insufficient run data for trend analysis";
  }

  const sign = trend.efficiency_change_pct >= 0 ? "+" : "";
  return (
    `Trend: ${trend.direction} | ` +
    `Current Efficiency: ${trend.aerobic_efficiency_current.toFixed(4)} | ` +
    `Baseline: ${trend.aerobic_efficiency_baseline.toFixed(4)} | ` +
    `Change: ${sign}${trend.efficiency_change_pct.toFixed(1)}% | ` +
    `Runs analyzed: ${trend.runs_analyzed}`
  );
}

export function formatGapAnalysis(gap: GapAnalysis): string {
  if (gap.all_gaps.length === 0) {
    return gap.details;
  }

  const lines = [gap.details];
  for (const g of gap.all_gaps.slice(1)) {
    lines.push(`• ${g.title}: ${g.details}`);
  }
  return lines.join("\n");
}
