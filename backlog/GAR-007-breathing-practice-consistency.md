# GAR-007 Daily breathing practice consistency

- **Status** idea
- **Priority** unassigned
- **Source** Breathing practice suggestion, 2026-11-22
- **Dependencies** none identified for manual logging

## Problem

The daily breathing exercise goal is at least five minutes. It takes a manual check to tell how much practice is logged today and how consistently the goal has been met.

## Desired outcome

Show today’s breathing practice total against the five-minute goal, the number of days that met it over the last seven completed days, and the current streak. Sum multiple sessions on the same local calendar day.

## Acceptance criteria

- At kickoff, mock today in progress, goal met, and a week with both logged sessions and gaps. [UX mock review skill](../.agents/skills/ux-mock-review/SKILL.md)
- Verify that a two-minute session and a three-minute session on the same day meet the goal. Show an in-progress day separately from the recent completed days used for consistency.
- Check whether Garmin imports dedicated breathing exercise sessions and use their recorded durations where available. Provide a quick manual log for unrecorded sessions and count a session once when a manual entry and a synced record refer to the same practice.
- Show missing sync coverage separately from a day with no logged practice. Verify the daily total and streak across a local day boundary.

## Relevant references

- [GAR-002 Garmin Personal API and local sync](GAR-002-garmin-personal-api.md)

## Completion

Pending triage.
