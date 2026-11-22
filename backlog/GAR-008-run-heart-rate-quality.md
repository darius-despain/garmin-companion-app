# GAR-008 Run heart-rate quality and fitness trends

- **Status** idea
- **Priority** unassigned
- **Source** Heart-rate recording quality suggestion, 2026-11-21
- **Dependencies** [GAR-002](GAR-002-garmin-personal-api.md) for Garmin activity data

## Problem

A missed chest-strap connection can leave a run with unreliable wrist heart-rate readings. An under-reading can make a given pace appear easier and skew the app's fitness comparisons. Without a way to flag the recording, the user has to remember which runs to discount.

## Desired outcome

Start with a reversible way to mark a run's heart rate as unreliable. Use that mark in GAR-004's pace and heart-rate comparisons. Keep the recorded run in the activity history and count its distance and duration. Keep Garmin's reported VO₂ max visible alongside the app's trend from comparable runs.

## Acceptance criteria

- At kickoff, mock flagging a run, seeing the reason beside the fitness trend, and restoring the run to the comparison. Include a view with too few comparable runs. [UX mock review skill](../.agents/skills/ux-mock-review/SKILL.md)
- Verify that flagging a run removes it from heart-rate-based comparisons and preserves its distance, duration, and workout recency. Verify that undo restores its eligibility and retains the original readings.
- Compare example FIT files with and without a working strap. Use time-stamped source data to identify the sensor supplying each segment where the file provides it. [Garmin source switching](https://support.garmin.com/en-US/?faq=Nf8r6ApX4d9lX0G0flEsVA) · [FIT activity files](https://developer.garmin.com/fit/articles/cookbook/decoding_activity_files.html)
- Explore review flags for abrupt, sustained HR changes during steady running after validating the manual workflow. Attribute a Garmin daily VO₂ max point to a run only when the linkage is supported. [Personal API endpoint wrappers](https://github.com/garmin/connect-personal-api-python#endpoint-wrappers)

## Relevant references

- [GAR-004 comparable-run fitness trend](GAR-004-training-decisions.md)

## Completion

Pending triage.
