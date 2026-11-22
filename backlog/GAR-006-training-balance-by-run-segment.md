# GAR-006 Training balance by run segment

- **Status** idea
- **Priority** unassigned
- **Source** Training balance suggestion, 2026-11-22
- **Dependencies** [GAR-002](GAR-002-garmin-personal-api.md) for Garmin activity data

## Problem

A single workout category hides parts of a mixed run. When a run combines base running with tempo or sprint work, the workout summary gives limited visibility into which efforts have had recent attention.

## Desired outcome

Show recent low aerobic, high aerobic, and anaerobic work by segment across runs. Display time per category, with fast rep counts and total sprint time where available. Show how recently each type of work occurred and compare recent totals with a personal baseline or goal to help choose what to prioritize next.

## Acceptance criteria

- At kickoff, mock a recent training balance view and a mixed workout breakdown. Review how the view communicates gaps and shows the basis for the comparison. [UX mock review skill](../.agents/skills/ux-mock-review/SKILL.md)
- Verify that a 35-minute base block plus 15 minutes of tempo contributes to both aerobic categories. Verify that a base run with six 15-second sprints credits its base time and shows six sprint reps totaling 90 seconds. Count each block once.
- Use recorded workout steps, laps, or other reliable activity data where available. Allow a runner to label or correct a block. Show unclassified time and data coverage so an unknown block stays distinct from a category with zero recorded time.
- Label the displayed units and comparison window. Treat minutes and reps as measures of training exposure, and use the selected baseline or goal to put the balance in context.

## Relevant references

- [GAR-003 whole-workout recency](GAR-003-training-exports-and-charts.md)
- [GAR-004 training decisions](GAR-004-training-decisions.md)

## Completion

Pending triage.
