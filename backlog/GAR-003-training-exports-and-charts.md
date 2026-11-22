# GAR-003 Training exports and charts

- **Status** ready
- **Priority** unassigned
- **Source** Personal Garmin app request, 2026-11-21
- **Dependencies** [GAR-002](GAR-002-garmin-personal-api.md)

## Problem

The dashboard shows an overall readiness score and short recovery sparklines. Downloads, a view that puts training volume next to recovery, and the date of the last run of each type would make that data easier to use. [Current dashboard](../app.py#L318)

## Desired outcome

Use one date range for the Streamlit charts and both download options. Default to the last 28 completed days and allow any locally available range. Show weekly run distance and elevation, workout minutes by sport, and daily sleep, resting HR, and HRV against personal baselines when available. Make incomplete weeks and missing days visible.

Show the most recent **low aerobic (easy/base)** run, **high aerobic (tempo/steady-state)** run, and **sprint** workout. Give each an activity date and days since. Highlight a sprint gap of 14 days or more as a prompt to consider a sprint session. Start with runs and keep the approach reusable for strength and other workouts later.

| Download | Contents |
| --- | --- |
| CSV bundle | One ZIP with `activities.csv` containing one row per session, `daily_recovery.csv` containing one row per local day, and a short field and units guide. |
| Training summary JSON | A single file containing dated activity and recovery records, weekly totals, coverage, export date range, units, and a schema version. Suitable for scripts or manual review with an external model. |

## UX kickoff

At ticket kickoff, mock the charts, run recency indicators, date and sport filters, and CSV and JSON export flows with sample data. Walk through a recent sprint, a sprint gap of at least two weeks, and incomplete history at desktop and phone widths. Agree on indicator placement, export scope preview, and completion feedback before implementing. [UX mock review skill](../.agents/skills/ux-mock-review/SKILL.md)

## Acceptance criteria

- Find the latest completed run of each type in locally synced history and compute elapsed days from its local activity date. Verify that narrowing the chart range leaves the latest known run visible, including an older sprint.
- Use a reliable recorded workout type when available and allow a manual label or correction. Count a sprint only when sprinting is the main purpose of the session. Keep ambiguous runs unclassified and show when history or labels are insufficient to judge recency.
- Verify the sprint indicator at 13 and 14 days. When coverage supports the result, highlight the gap starting at day 14 and clear it when a newer sprint is synced or labeled. Show an explicit empty or incomplete-history state when no matching run is available.
- Test the agreed export journey on desktop and phone widths. Verify that the CSV action downloads the ZIP in one step using the applied date and sport filters. The JSON review shows the date, sport, coverage, and sample fields before download. Sport filters apply to activity records and totals. Daily recovery remains tied to the selected dates across all sports.
- Both downloads use data already on screen and work when Garmin is unreachable. Export totals match the charts for the same scope. Check a custom range with a partial first or last week and distinguish days with no logged workouts, unknown activity coverage, and user-confirmed rest.
- Preview the JSON fields before download. Exclude credentials, account identifiers, activity titles and notes, exact start times, GPS coordinates, and raw FIT by default. Keep date and sport so the analysis can refer back to specific workouts.
- Check the Personal API terms presented in Garmin’s signed-in key settings before using a download with an external model. The public FAQ covers individual use and the key setup flow. [Garmin key setup](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- Base the first charts and exports on measured or logged values. Show the updated running efficiency and dated guidance when [GAR-004](GAR-004-training-decisions.md) delivers them.
- Pair the JSON export with a copyable prompt for Gemini or another LLM. The workflow is a user-selected file upload. Direct model calls are a later feature that can reuse the same JSON schema.

## Example prompt

> My current goal and upcoming key session are [add context]. Review the attached training summary. Compare the latest complete week with the prior three weeks. Suggest where to push, maintain, or reduce load over the next seven days. Cite the dates and values behind each suggestion, call out missing data or explanations that compete with the trend, and identify a strength or technique focus only if the logs support it. Ask for the most useful missing detail.

## Relevant references

- [Existing Plotly charts](../app.py#L367)

## Completion

Pending implementation.
