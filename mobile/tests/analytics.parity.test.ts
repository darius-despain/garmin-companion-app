import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeConditioningTrend,
  calculateAerobicEfficiency,
  calculateReadinessBudget,
  diagnoseGaps,
  formatConditioningTrend,
  formatGapAnalysis,
} from "../src/analytics/analytics";
import { buildSampleDataset } from "../src/data/sampleData";
import { addDaysIso } from "../src/services/garminPersonalApi";
import type { AnalyticsDataset } from "../src/types/garmin";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

interface PythonParityOutput {
  readiness: {
    score: number;
    status: string;
    hrv_component: number;
    rhr_component: number;
    sleep_component: number;
    breakdown: Record<string, unknown>;
  };
  trend: {
    direction: string;
    aerobic_efficiency_current: number;
    aerobic_efficiency_baseline: number;
    efficiency_change_pct: number;
    runs_analyzed: number;
    hrv_trend: number[];
    rhr_trend: number[];
  };
  trend_formatted: string;
  gaps: {
    primary_gap: string;
    priority: string;
    details: string;
    all_gaps: Array<Record<string, unknown>>;
  };
  gaps_formatted: string;
}

function runPythonReference(dataset: AnalyticsDataset, today: string): PythonParityOutput {
  const pyScript = `
import json, sys
sys.path.insert(0, ${JSON.stringify(REPO_ROOT)})
import analytics

payload = json.loads(sys.stdin.read())
dataset = payload["dataset"]
today = payload["today"]

readiness = analytics.calculate_readiness_budget(dataset, today=today)
trend = analytics.analyze_conditioning_trend(dataset)
gaps = analytics.diagnose_gaps(dataset)

print(json.dumps({
    "readiness": {
        "score": readiness.score,
        "status": readiness.status.value,
        "hrv_component": readiness.hrv_component,
        "rhr_component": readiness.rhr_component,
        "sleep_component": readiness.sleep_component,
        "breakdown": readiness.breakdown,
    },
    "trend": {
        "direction": trend.direction,
        "aerobic_efficiency_current": trend.aerobic_efficiency_current,
        "aerobic_efficiency_baseline": trend.aerobic_efficiency_baseline,
        "efficiency_change_pct": trend.efficiency_change_pct,
        "runs_analyzed": trend.runs_analyzed,
        "hrv_trend": trend.hrv_trend,
        "rhr_trend": trend.rhr_trend,
    },
    "trend_formatted": analytics.format_conditioning_trend(trend),
    "gaps": {
        "primary_gap": gaps.primary_gap,
        "priority": gaps.priority,
        "details": gaps.details,
        "all_gaps": gaps.all_gaps,
    },
    "gaps_formatted": analytics.format_gap_analysis(gaps),
}))
`;

  const stdout = execFileSync("python3", ["-c", pyScript], {
    input: JSON.stringify({ dataset, today }),
    encoding: "utf8",
  });
  return JSON.parse(stdout) as PythonParityOutput;
}

function buildFixture(
  anchorToday: string,
  overrides: {
    sleepHours?: (i: number) => number;
    hrvValue?: (i: number) => number;
    hrvBaseline?: number;
    rhr?: (i: number) => number;
    stress?: (i: number) => number;
    trailRuns?: AnalyticsDataset["activities"]["trail"];
    roadRuns?: AnalyticsDataset["activities"]["road"];
  } = {}
): AnalyticsDataset {
  const dataset: AnalyticsDataset = {
    sleep: {},
    hrv: {},
    rhr: {},
    stress: {},
    body_battery: {},
    activities: {
      trail: overrides.trailRuns ?? [],
      road: overrides.roadRuns ?? [],
    },
  };

  for (let i = 0; i < 28; i += 1) {
    const date = addDaysIso(anchorToday, -(27 - i));
    const sleep = overrides.sleepHours ? overrides.sleepHours(i) : 7.8;
    const hrv = overrides.hrvValue ? overrides.hrvValue(i) : 52;
    const rhr = overrides.rhr ? overrides.rhr(i) : 54;
    const stress = overrides.stress ? overrides.stress(i) : 24;

    dataset.sleep[date] = { date, sleep_duration_hours: sleep, sleep_score: 82 };
    dataset.hrv[date] = { date, hrv_value: hrv, hrv_baseline: overrides.hrvBaseline ?? 50 };
    dataset.rhr[date] = { date, resting_hr: rhr };
    dataset.stress[date] = { date, stress, body_battery: 78 };
    dataset.body_battery[date] = { date, body_battery: 78 };
  }
  return dataset;
}

describe("analytics.ts <-> analytics.py fixture parity", () => {
  // Use yesterday relative to system clock so Rule 3 (which uses datetime.now() in Python) aligns identically
  const now = new Date();
  const today = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const scenarios: Array<{ name: string; dataset: AnalyticsDataset }> = [
    {
      name: "well-rested PUSH user",
      dataset: buildFixture(today, {
        sleepHours: (i) => (i === 27 ? 8.3 : 7.9),
        hrvValue: (i) => (i === 27 ? 58 : 50),
        hrvBaseline: 50,
        rhr: (i) => (i === 27 ? 50 : 55),
      }),
    },
    {
      name: "sleep-deprived RECOVER user with sleep deficit + HRV decline + elevated RHR",
      dataset: buildFixture(today, {
        sleepHours: (i) => (i >= 25 ? 5.1 : 7.4),
        hrvValue: (i) => (i >= 21 ? 35 : 52),
        hrvBaseline: 52,
        rhr: (i) => (i >= 21 ? 62 : 54),
      }),
    },
    {
      name: "high stress on rest days",
      dataset: buildFixture(today, {
        stress: (i) => (i >= 23 ? 52 : 25),
      }),
    },
    {
      name: "improved aerobic efficiency conditioning trend",
      dataset: buildFixture(today, {
        trailRuns: [
          { id: "b1", type: "trail_run", date: addDaysIso(today, -18), distance_km: 8.5, duration_minutes: 51, avg_hr: 145 },
          { id: "b2", type: "trail_run", date: addDaysIso(today, -14), distance_km: 8.5, duration_minutes: 51, avg_hr: 145 },
          { id: "c1", type: "trail_run", date: addDaysIso(today, -4), distance_km: 9.0, duration_minutes: 45, avg_hr: 145 },
          { id: "c2", type: "trail_run", date: addDaysIso(today, -2), distance_km: 9.0, duration_minutes: 45, avg_hr: 145 },
        ],
      }),
    },
    {
      name: "slumping efficiency + recovery window deficit (>5 run days in 7d)",
      dataset: buildFixture(today, {
        roadRuns: [
          { id: "b1", type: "run", date: addDaysIso(today, -16), distance_km: 10, duration_minutes: 48, avg_hr: 145 },
          { id: "c1", type: "run", date: addDaysIso(today, -5), distance_km: 8, duration_minutes: 48, avg_hr: 155 },
          { id: "c2", type: "run", date: addDaysIso(today, -4), distance_km: 8, duration_minutes: 48, avg_hr: 155 },
          { id: "c3", type: "run", date: addDaysIso(today, -3), distance_km: 8, duration_minutes: 48, avg_hr: 155 },
          { id: "c4", type: "run", date: addDaysIso(today, -2), distance_km: 8, duration_minutes: 48, avg_hr: 155 },
          { id: "c5", type: "run", date: addDaysIso(today, -1), distance_km: 8, duration_minutes: 48, avg_hr: 155 },
          { id: "c6", type: "run", date: today, distance_km: 8, duration_minutes: 48, avg_hr: 155 },
        ],
      }),
    },
    {
      name: "built-in sample dataset",
      dataset: buildSampleDataset(today).dataset,
    },
    {
      name: "empty / missing dataset",
      dataset: {
        sleep: {},
        hrv: {},
        rhr: {},
        stress: {},
        body_battery: {},
        activities: { trail: [], road: [] },
      },
    },
  ];

  for (const scenario of scenarios) {
    it(`matches analytics.py exactly for: ${scenario.name}`, () => {
      const py = runPythonReference(scenario.dataset, today);

      const tsReadiness = calculateReadinessBudget(scenario.dataset, today);
      expect({
        score: tsReadiness.score,
        status: tsReadiness.status,
        hrv_component: tsReadiness.hrv_component,
        rhr_component: tsReadiness.rhr_component,
        sleep_component: tsReadiness.sleep_component,
        breakdown: tsReadiness.breakdown,
      }).toEqual(py.readiness);

      const tsTrend = analyzeConditioningTrend(scenario.dataset);
      expect(tsTrend).toEqual(py.trend);
      expect(formatConditioningTrend(tsTrend)).toBe(py.trend_formatted);

      const tsGaps = diagnoseGaps(scenario.dataset, now);
      expect(tsGaps).toEqual(py.gaps);
      expect(formatGapAnalysis(tsGaps)).toBe(py.gaps_formatted);
    });
  }

  it("flags readiness as unavailable when required inputs are missing", () => {
    const empty: AnalyticsDataset = {
      sleep: {},
      hrv: {},
      rhr: {},
      stress: {},
      body_battery: {},
      activities: { trail: [], road: [] },
    };
    const res = calculateReadinessBudget(empty, today);
    expect(res.available).toBe(false);
    expect(res.missing_inputs).toEqual(["hrv", "rhr", "sleep"]);
  });

  it("handles calculateAerobicEfficiency edge cases", () => {
    expect(calculateAerobicEfficiency({ distance_km: 0, duration_minutes: 30, avg_hr: 150 }, 50)).toBeNull();
    expect(calculateAerobicEfficiency({ distance_km: 10, duration_minutes: 50, avg_hr: 150 }, 50)).toBe(0.05);
    expect(calculateAerobicEfficiency({ distance_km: 10, duration_minutes: 50, avg_hr: 50 }, 55)).toBeNull();
  });
});
