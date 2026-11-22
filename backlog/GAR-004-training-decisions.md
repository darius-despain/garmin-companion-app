# GAR-004 Running load, strength, and technique guidance

- **Status** ready
- **Priority** unassigned
- **Source** Personal Garmin app request, 2026-11-21
- **Dependencies** [GAR-002](GAR-002-garmin-personal-api.md), [GAR-003](GAR-003-training-exports-and-charts.md)

## Problem

The current PUSH, CRUISE, and RECOVER tiers use HRV, resting HR, and sleep. They omit recent training load and can produce a tier from neutral fallback values when metrics are missing. The existing aerobic efficiency formula can also show improvement when heart rate rises at the same pace. [Readiness calculation](../analytics.py#L58) · [Running efficiency calculation](../analytics.py#L243)

## Desired outcome

Make each training suggestion traceable to recent sessions, personal recovery trends, and the next planned workout. Running is the first sport with specific comparisons. Shared activity records and simple manual check-ins support strength, cycling, and other sports as their own data becomes available.

Implement running load and comparable-run efficiency first. Add optional workout, strength, and technique context in the following slice.

## UX kickoff

At ticket kickoff, mock the next-workout recommendation, its evidence, and how strength or technique context appears when available. Walk through each readiness state, including mixed signals and insufficient data, at desktop and phone widths. Agree on the behavior before implementing. [UX mock review skill](../.agents/skills/ux-mock-review/SKILL.md)

## Acceptance criteria

- Verify the agreed recommendation, evidence, and missing-data states on desktop and phone widths.
- Show **PUSH**, **CRUISE**, **RECOVER**, or **Insufficient data** with dated reasons. Compare the latest seven days with the preceding three weeks using weekly distance, minutes, elevation, and logged hard sessions alongside HRV, resting HR, sleep, and optional fatigue or soreness. Use the same as-of date across signals. Check every logged sport and use a check-in to confirm rest days.
- A push suggestion supports a planned quality session when load and recovery agree. Mixed signals support sticking with an easy or planned session. A recent load increase with worsening recovery supports postponing or reducing a hard session. Missing or stale inputs are visible in the explanation. Back-check the rules with historical sessions before treating the labels as useful.
- Specify minimum baseline observations and maximum data age before coding the recommendation rules. Verify that stale or insufficient coverage prevents PUSH and that a hard recorded ride can shift a running recommendation. Check that a dated check-in changes the displayed evidence when used.
- Replace the current efficiency formula with a comparison of heart rate at similar pace or pace at similar heart rate on comparable easy runs. Keep road, trail, and treadmill separate. Account for elevation and conditions when available, show the sample size, and report insufficient comparable runs when coverage is low. Verify that a higher heart rate at the same pace never counts as an improvement.
- Check activity details and optional FIT files for recorded laps, running dynamics, or strength sets. Use optional manual workout intent, perceived effort, soreness, exercise, sets, reps, and weight to cover missing context. Keep planned exercises separate from completed sets. [Garmin FIT activity file documentation](https://developer.garmin.com/fit/file-types/activity) · [Personal API activity wrappers](https://github.com/garmin/connect-personal-api-python#endpoint-wrappers)
- Suggest a specific strength focus only when goals and logged exercises support it. For technique, surface observable patterns and a practical follow-up, such as reviewing a comparable video clip after a change in cadence at similar pace. With only a session summary, show which observation would help decide what to focus on.
- Make the dated reasons and supporting values available in the same training summary that powers manual model review. Check scenarios with stale data, an unlogged workout, a hard cycling session, differing run terrain, and a strength session with missing set details.

## Relevant references

- [Current recovery-gap rules](../analytics.py#L387)

## Completion

Pending implementation.
