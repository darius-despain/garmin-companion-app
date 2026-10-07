"""
Analytics Module

Implements core analytical logic for:
- Readiness Budget calculation (HRV, RHR, Sleep components)
- Aerobic efficiency index
- Conditioning trend detection
- Gap diagnosis rules
"""

import math
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import statistics


class ReadinessStatus(Enum):
    """Readiness status tiers."""
    PUSH = "PUSH"
    CRUISE = "CRUISE"
    RECOVER = "RECOVER"


@dataclass
class ReadinessResult:
    """Result of readiness calculation."""
    score: float
    status: ReadinessStatus
    hrv_component: float
    rhr_component: float
    sleep_component: float
    breakdown: Dict[str, Any]


@dataclass
class ConditioningTrend:
    """Result of conditioning trend analysis."""
    direction: str  # "Improving", "Holding", "Slumping"
    aerobic_efficiency_current: float
    aerobic_efficiency_baseline: float
    efficiency_change_pct: float
    runs_analyzed: int
    hrv_trend: List[float]
    rhr_trend: List[float]


@dataclass
class GapAnalysis:
    """Result of gap diagnosis."""
    primary_gap: str
    priority: str  # "High", "Medium", "Low"
    details: str
    all_gaps: List[Dict[str, Any]]


def calculate_readiness_budget(
    dataset: Dict[str, Any],
    today: Optional[str] = None
) -> ReadinessResult:
    """
    Calculate daily readiness budget (0-100) with 3-tier status.
    
    Components:
    - HRV Component (40%): Ratio of last night's HRV to 28-day baseline
    - RHR Component (30%): Deviation of today's RHR against 28-day rolling average (lower is better)
    - Sleep Component (30%): Sleep duration relative to 8-hour target
    """
    if today is None:
        today = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # --- HRV Component (40% weight) ---
    hrv_component = calculate_hrv_component(dataset, today)
    
    # --- RHR Component (30% weight) ---
    rhr_component = calculate_rhr_component(dataset, today)
    
    # --- Sleep Component (30% weight) ---
    sleep_component = calculate_sleep_component(dataset, today)
    
    # Weighted composite score
    composite = (
        hrv_component * 0.40 +
        rhr_component * 0.30 +
        sleep_component * 0.30
    )
    
    # Clamp to 0-100
    score = max(0.0, min(100.0, composite))
    
    # Map to 3-tier status
    if score >= 75:
        status = ReadinessStatus.PUSH
    elif score >= 45:
        status = ReadinessStatus.CRUISE
    else:
        status = ReadinessStatus.RECOVER
    
    breakdown = {
        'hrv': {
            'score': round(hrv_component, 1),
            'weight': 40,
            'weighted': round(hrv_component * 0.40, 1)
        },
        'rhr': {
            'score': round(rhr_component, 1),
            'weight': 30,
            'weighted': round(rhr_component * 0.30, 1)
        },
        'sleep': {
            'score': round(sleep_component, 1),
            'weight': 30,
            'weighted': round(sleep_component * 0.30, 1)
        },
        'total': round(score, 1),
        'status': status.value
    }
    
    return ReadinessResult(
        score=round(score, 1),
        status=status,
        hrv_component=round(hrv_component, 1),
        rhr_component=round(rhr_component, 1),
        sleep_component=round(sleep_component, 1),
        breakdown=breakdown
    )


def calculate_hrv_component(dataset: Dict[str, Any], today: str) -> float:
    """
    Calculate HRV component score (0-100).
    Based on ratio of last night's HRV to 28-day baseline.
    """
    hrv_data = dataset.get('hrv', {})
    
    if today not in hrv_data:
        return 50.0  # Neutral if no data
    
    current_hrv = hrv_data[today].get('hrv_value')
    baseline_hrv = hrv_data[today].get('hrv_baseline')
    
    if not current_hrv or not baseline_hrv or baseline_hrv <= 0:
        return 50.0
    
    ratio = current_hrv / baseline_hrv
    
    # Map ratio to 0-100 scale
    # Ratio of 1.0 (at baseline) = 70
    # Ratio > 1.2 = 100
    # Ratio < 0.8 = 0
    if ratio >= 1.2:
        return 100.0
    elif ratio >= 1.0:
        return 70 + (ratio - 1.0) * 150  # 70 to 100
    elif ratio >= 0.8:
        return 70 * (ratio - 0.8) / 0.2  # 0 to 70
    else:
        return max(0.0, ratio / 0.8 * 50)  # Below 0.8 scales down


def calculate_rhr_component(dataset: Dict[str, Any], today: str) -> float:
    """
    Calculate RHR component score (0-100).
    Based on deviation of today's RHR against 28-day rolling average.
    Lower RHR is better.
    """
    rhr_data = dataset.get('rhr', {})
    
    if today not in rhr_data:
        return 50.0  # Neutral if no data
    
    current_rhr = rhr_data[today].get('resting_hr')
    
    if not current_rhr or current_rhr <= 0:
        return 50.0
    
    # Calculate 28-day rolling average (excluding today)
    rhr_values = []
    for date_str, data in rhr_data.items():
        rhr = data.get('resting_hr')
        if rhr and rhr > 0:
            rhr_values.append(rhr)
    
    if len(rhr_values) < 3:
        return 50.0  # Need at least 3 data points
    
    avg_rhr = statistics.mean(rhr_values)
    
    # Deviation: how much lower is current vs average?
    # Negative deviation = current is lower (better)
    deviation = (avg_rhr - current_rhr) / avg_rhr
    
    # Map deviation to 0-100
    # Deviation of +5% (RHR 5% below average) = 90
    # Deviation of 0% (at average) = 50
    # Deviation of -5% (RHR 5% above average) = 10
    if deviation >= 0.05:
        return min(100.0, 90 + deviation * 200)
    elif deviation >= 0:
        return 50 + deviation * 800  # 50 to 90
    elif deviation >= -0.05:
        return 50 + deviation * 800  # 50 down to 10
    else:
        return max(0.0, 10 + (deviation + 0.05) * 200)


def calculate_sleep_component(dataset: Dict[str, Any], today: str) -> float:
    """
    Calculate Sleep component score (0-100).
    Based on sleep duration relative to 8-hour target.
    """
    sleep_data = dataset.get('sleep', {})
    
    if today not in sleep_data:
        return 50.0
    
    duration = sleep_data[today].get('sleep_duration_hours')
    
    if not duration or duration <= 0:
        return 50.0
    
    target_hours = 8.0
    
    # Map hours to 0-100
    # 8+ hours = 100
    # 7 hours = 75
    # 6 hours = 50
    # 5 hours = 25
    # <4 hours = 0
    if duration >= target_hours:
        return 100.0
    elif duration >= 7.0:
        return 75 + (duration - 7.0) * 25
    elif duration >= 6.0:
        return 50 + (duration - 6.0) * 25
    elif duration >= 5.0:
        return 25 + (duration - 5.0) * 25
    else:
        return max(0.0, duration * 6.25)


def calculate_aerobic_efficiency(
    activity: Dict,
    resting_hr: Optional[int] = None
) -> Optional[float]:
    """
    Calculate aerobic efficiency index for a run.
    Formula: (Avg Pace in min/km) / (Avg HR - Resting HR)
    
    Lower value = better efficiency (faster pace at lower relative HR)
    """
    avg_hr = activity.get('avg_hr')
    distance_km = activity.get('distance_km')
    duration_min = activity.get('duration_minutes')
    
    if not avg_hr or not distance_km or not duration_min:
        return None
    
    if distance_km <= 0 or duration_min <= 0:
        return None
    
    # Calculate pace (min/km)
    pace = duration_min / distance_km
    
    # Use resting HR if provided, otherwise estimate from activity
    if resting_hr is None:
        # Rough estimate: use 50 bpm below avg HR if unknown
        resting_hr = max(40, avg_hr - 50)
    
    hr_reserve = avg_hr - resting_hr
    
    if hr_reserve <= 0:
        return None
    
    # Aerobic efficiency index
    efficiency = pace / hr_reserve
    
    return round(efficiency, 4)


def analyze_conditioning_trend(dataset: Dict[str, Any]) -> ConditioningTrend:
    """
    Analyze conditioning trend over past 7 days vs 28-day baseline.
    
    Calculates aerobic efficiency index for runs:
    (Avg Pace in min/km) / (Avg HR - Resting HR)
    
    Determines trend: Improving / Holding / Slumping
    """
    # Get all runs (both trail and road)
    all_runs = dataset.get('activities', {}).get('trail', []) + \
               dataset.get('activities', {}).get('road', [])
    
    if not all_runs:
        return ConditioningTrend(
            direction="No Data",
            aerobic_efficiency_current=0,
            aerobic_efficiency_baseline=0,
            efficiency_change_pct=0,
            runs_analyzed=0,
            hrv_trend=[],
            rhr_trend=[]
        )
    
    # Get RHR baseline
    rhr_data = dataset.get('rhr', {})
    rhr_values = [d.get('resting_hr') for d in rhr_data.values() 
                  if d.get('resting_hr') and d.get('resting_hr') > 0]
    avg_rhr = statistics.mean(rhr_values) if rhr_values else 50
    
    # Calculate efficiency for each run
    efficiencies = []
    for run in all_runs:
        eff = calculate_aerobic_efficiency(run, avg_rhr)
        if eff:
            efficiencies.append({
                'date': run.get('date', '')[:10],
                'efficiency': eff,
                'distance': run.get('distance_km', 0)
            })
    
    if not efficiencies:
        return ConditioningTrend(
            direction="No Data",
            aerobic_efficiency_current=0,
            aerobic_efficiency_baseline=0,
            efficiency_change_pct=0,
            runs_analyzed=0,
            hrv_trend=[],
            rhr_trend=[]
        )
    
    # Sort by date
    efficiencies.sort(key=lambda x: x['date'])
    
    # Split into baseline (older 21 days) and current (last 7 days)
    dates = [datetime.strptime(e['date'], "%Y-%m-%d") for e in efficiencies]
    cutoff_date = max(dates) - timedelta(days=7)
    
    current_eff = [e for e, d in zip(efficiencies, dates) if d >= cutoff_date]
    baseline_eff = [e for e, d in zip(efficiencies, dates) if d < cutoff_date]
    
    current_avg = statistics.mean([e['efficiency'] for e in current_eff]) if current_eff else 0
    baseline_avg = statistics.mean([e['efficiency'] for e in baseline_eff]) if baseline_eff else 0
    
    # Determine trend direction
    # Lower efficiency index = better (faster pace, lower relative HR)
    if baseline_avg > 0:
        change_pct = ((baseline_avg - current_avg) / baseline_avg) * 100
    else:
        change_pct = 0
    
    if change_pct >= 5:
        direction = "Improving"
    elif change_pct <= -5:
        direction = "Slumping"
    else:
        direction = "Holding"
    
    # Get HRV trend (last 7 days)
    hrv_data = dataset.get('hrv', {})
    hrv_trend = []
    for date_str in sorted(hrv_data.keys())[-7:]:
        val = hrv_data[date_str].get('hrv_value')
        if val:
            hrv_trend.append(val)
    
    # Get RHR trend (last 7 days)
    rhr_trend = []
    for date_str in sorted(rhr_data.keys())[-7:]:
        val = rhr_data[date_str].get('resting_hr')
        if val:
            rhr_trend.append(val)
    
    return ConditioningTrend(
        direction=direction,
        aerobic_efficiency_current=round(current_avg, 4),
        aerobic_efficiency_baseline=round(baseline_avg, 4),
        efficiency_change_pct=round(change_pct, 1),
        runs_analyzed=len(efficiencies),
        hrv_trend=hrv_trend,
        rhr_trend=rhr_trend
    )


def diagnose_gaps(dataset: Dict[str, Any]) -> GapAnalysis:
    """
    Generate prioritized recommendations based on rule triggers.
    
    Rules:
    1. Sleep Avg < 7.0 hours over last 3 days -> Sleep Deficit (High priority)
    2. Daytime Stress Avg > 40 on rest days -> High Parasympathetic Suppression (High)
    3. Run Frequency > 5 days with zero rest -> Recovery Window Deficit (High)
    """
    gaps = []
    
    # --- Rule 1: Sleep Deficit ---
    sleep_data = dataset.get('sleep', {})
    recent_sleep = []
    for date_str in sorted(sleep_data.keys())[-3:]:
        dur = sleep_data[date_str].get('sleep_duration_hours')
        if dur:
            recent_sleep.append(dur)
    
    if recent_sleep and statistics.mean(recent_sleep) < 7.0:
        gaps.append({
            'type': 'sleep_deficit',
            'title': 'Primary Gap: Sleep Deficit',
            'priority': 'High',
            'details': f'3-day sleep average: {statistics.mean(recent_sleep):.1f} hours (target: 7+). '
                      'High priority for cellular & muscular recovery.',
            'score': 90
        })
    
    # --- Rule 2: High Stress on Rest Days ---
    stress_data = dataset.get('stress', {})
    activities = dataset.get('activities', {})
    
    # Get rest days (no activities in last 7 days)
    all_dates = set()
    for act_list in [activities.get('trail', []), activities.get('road', [])]:
        for act in act_list:
            date_str = act.get('date', '')[:10]
            all_dates.add(date_str)
    
    rest_day_stress = []
    for date_str in sorted(stress_data.keys())[-7:]:
        if date_str not in all_dates:
            stress_val = stress_data[date_str].get('stress')
            if stress_val is not None:
                rest_day_stress.append(stress_val)
    
    if rest_day_stress and statistics.mean(rest_day_stress) > 40:
        gaps.append({
            'type': 'high_stress',
            'title': 'Primary Gap: High Parasympathetic Suppression',
            'priority': 'High',
            'details': f'Rest day stress average: {statistics.mean(rest_day_stress):.0f} (>40). '
                      'Consider active relaxation, breathwork, or meditation.',
            'score': 85
        })
    
    # --- Rule 3: Recovery Window Deficit ---
    # Count running days in last 7 days
    run_dates = set()
    for act_list in [activities.get('trail', []), activities.get('road', [])]:
        for act in act_list:
            date_str = act.get('date', '')[:10]
            # Only count within last 7 days
            act_date = datetime.strptime(date_str, "%Y-%m-%d")
            cutoff = datetime.now() - timedelta(days=7)
            if act_date >= cutoff:
                run_dates.add(date_str)
    
    if len(run_dates) > 5:
        gaps.append({
            'type': 'recovery_deficit',
            'title': 'Primary Gap: Recovery Window Deficit',
            'priority': 'High',
            'details': f'{len(run_dates)} running days in last 7 days with zero rest days. '
                      'Schedule a full non-impact day.',
            'score': 80
        })
    
    # --- Additional gaps (lower priority) ---
    
    # Low HRV trend
    hrv_data = dataset.get('hrv', {})
    hrv_values = [d.get('hrv_value') for d in hrv_data.values() 
                  if d.get('hrv_value') and d.get('hrv_value') > 0]
    if len(hrv_values) >= 7:
        recent_hrv = hrv_values[-7:]
        baseline_hrv = hrv_values[:-7] if len(hrv_values) > 7 else hrv_values
        if statistics.mean(recent_hrv) < statistics.mean(baseline_hrv) * 0.85:
            gaps.append({
                'type': 'hrv_decline',
                'title': 'Secondary Gap: HRV Declining',
                'priority': 'Medium',
                'details': '7-day HRV average is 15% below baseline. '
                          'Consider reducing training intensity.',
                'score': 60
            })
    
    # Elevated RHR trend
    rhr_values = [d.get("resting_hr") for d in dataset.get("rhr", {}).values() if d.get("resting_hr") and d.get("resting_hr") > 0]
    if len(rhr_values) >= 7:
        recent_rhr = rhr_values[-7:]
        baseline_rhr = rhr_values[:-7] if len(rhr_values) > 7 else rhr_values
        if statistics.mean(recent_rhr) > statistics.mean(baseline_rhr) * 1.05:
            gaps.append({
                'type': 'rhr_elevated',
                'title': 'Secondary Gap: Elevated Resting HR',
                'priority': 'Medium',
                'details': '7-day RHR average is 5% above baseline. '
                          'Monitor for overtraining or illness.',
                'score': 55
            })
    
    # Sort by priority score (highest first)
    gaps.sort(key=lambda x: x['score'], reverse=True)
    
    # Determine primary gap
    if gaps:
        primary = gaps[0]
        return GapAnalysis(
            primary_gap=primary['title'],
            priority=primary['priority'],
            details=primary['details'],
            all_gaps=gaps
        )
    else:
        return GapAnalysis(
            primary_gap="No significant gaps detected",
            priority="Low",
            details="All metrics within normal ranges. Continue current routine.",
            all_gaps=[]
        )


def format_conditioning_trend(trend: ConditioningTrend) -> str:
    """Format conditioning trend for display."""
    if trend.direction == "No Data":
        return "Insufficient run data for trend analysis"
    
    return (
        f"Trend: {trend.direction} | "
        f"Current Efficiency: {trend.aerobic_efficiency_current:.4f} | "
        f"Baseline: {trend.aerobic_efficiency_baseline:.4f} | "
        f"Change: {trend.efficiency_change_pct:+.1f}% | "
        f"Runs analyzed: {trend.runs_analyzed}"
    )


def format_gap_analysis(gap: GapAnalysis) -> str:
    """Format gap analysis for display."""
    if not gap.all_gaps:
        return gap.details
    
    lines = [gap.details]
    for g in gap.all_gaps[1:]:
        lines.append(f"• {g['title']}: {g['details']}")
    
    return "\n".join(lines)