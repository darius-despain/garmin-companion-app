/**
 * Built-in deterministic sample-data mode (GAR-002).
 *
 * Provides 28 completed days of realistic sleep, HRV, RHR, stress, Body Battery,
 * road runs, trail runs, and strength sessions so the app can run offline
 * without a Garmin Personal API key.
 */

import { addDaysIso, formatIsoDateLocal } from "../services/garminPersonalApi";
import type { ActivityRecord, AnalyticsDataset, DailyMetricRecord } from "../types/garmin";

export interface SampleDatasetBundle {
  anchorDate: string; // Last completed local day YYYY-MM-DD
  dailyMetrics: DailyMetricRecord[];
  activities: ActivityRecord[];
  dataset: AnalyticsDataset;
}

export function buildSampleDataset(anchorDate?: string): SampleDatasetBundle {
  const end = anchorDate ?? addDaysIso(formatIsoDateLocal(new Date()), -1);
  const dailyMetrics: DailyMetricRecord[] = [];
  const activities: ActivityRecord[] = [];

  for (let offset = 27; offset >= 0; offset -= 1) {
    const date = addDaysIso(end, -offset);
    const dayIndex = 27 - offset;
    const isRecent = dayIndex >= 21;

    const sleepDurationHours =
      dayIndex === 27 ? 8.1 : Number((7.2 + ((dayIndex * 7) % 10) * 0.1).toFixed(2));
    const sleepScore = Math.min(96, Math.round(72 + (sleepDurationHours - 6.5) * 12));
    const hrvBaseline = 54;
    const hrvValue = isRecent ? 56 + (dayIndex % 4) : 52 + (dayIndex % 5);
    const restingHr = isRecent ? 51 + (dayIndex % 2) : 53 + (dayIndex % 3);
    const stress = dayIndex % 7 === 6 ? 24 : 28 + (dayIndex % 9);
    const bodyBattery = Math.min(95, 74 + (dayIndex % 15));

    dailyMetrics.push({
      date,
      sleepDurationHours,
      sleepScore,
      hrvValue,
      hrvBaseline,
      hrvStatus: hrvValue >= hrvBaseline ? "BALANCED" : "LOW",
      restingHr,
      stress,
      bodyBattery,
    });

    // Mix of trail runs, road runs, and strength workouts across the 28-day window
    if (dayIndex % 4 === 1) {
      const distanceKm = isRecent ? 9.2 : 8.5;
      const durationMinutes = isRecent ? 46.0 : 51.0;
      activities.push({
        garminId: `sample-trail-${dayIndex}`,
        date,
        startTimeLocal: `${date} 07:15:00`,
        utcOffsetSeconds: -28800,
        activityType: "trail_running",
        category: "trail_run",
        name: "Morning Trail Loop",
        distanceKm,
        durationMinutes,
        avgHr: 146,
        maxHr: 168,
        elevationGainM: 340,
      });
    } else if (dayIndex % 4 === 3) {
      const distanceKm = isRecent ? 10.0 : 8.0;
      const durationMinutes = isRecent ? 48.0 : 44.0;
      activities.push({
        garminId: `sample-road-${dayIndex}`,
        date,
        startTimeLocal: `${date} 06:45:00`,
        utcOffsetSeconds: -28800,
        activityType: "running",
        category: "road_run",
        name: "Tempo Road Run",
        distanceKm,
        durationMinutes,
        avgHr: 150,
        maxHr: 172,
        elevationGainM: 85,
      });
    } else if (dayIndex % 6 === 2) {
      activities.push({
        garminId: `sample-strength-${dayIndex}`,
        date,
        startTimeLocal: `${date} 17:30:00`,
        utcOffsetSeconds: -28800,
        activityType: "strength_training",
        category: "strength",
        name: "Lower Body & Core Strength",
        distanceKm: null,
        durationMinutes: 45,
        avgHr: 118,
        maxHr: 142,
        elevationGainM: null,
      });
    }
  }

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

  for (const d of dailyMetrics) {
    dataset.sleep[d.date] = {
      date: d.date,
      sleep_duration_hours: d.sleepDurationHours,
      sleep_score: d.sleepScore,
    };
    dataset.hrv[d.date] = {
      date: d.date,
      hrv_value: d.hrvValue,
      hrv_baseline: d.hrvBaseline,
      hrv_status: d.hrvStatus,
    };
    dataset.rhr[d.date] = {
      date: d.date,
      resting_hr: d.restingHr,
    };
    dataset.stress[d.date] = {
      date: d.date,
      stress: d.stress,
      body_battery: d.bodyBattery,
    };
    dataset.body_battery[d.date] = {
      date: d.date,
      body_battery: d.bodyBattery,
    };
  }

  for (const act of activities) {
    const mapped = {
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
    if (act.category === "trail_run") dataset.activities.trail.push(mapped);
    else if (act.category === "road_run") dataset.activities.road.push(mapped);
    else if (act.category === "strength") dataset.activities.strength!.push(mapped);
    else dataset.activities.other!.push(mapped);
  }

  return {
    anchorDate: end,
    dailyMetrics,
    activities,
    dataset,
  };
}
