# GAR-005 Review the training and export experience

- **Status** cancelled
- **Priority** unassigned
- **Source** UX planning follow-up, 2026-11-21
- **Dependencies** none identified

UX design now starts at kickoff in [GAR-003](../GAR-003-training-exports-and-charts.md) and [GAR-004](../GAR-004-training-decisions.md). The early mock is shelved in the local workspace.

## Problem

The training dashboard needs to answer two questions quickly. What should I do with my next workout, and how do I export the evidence for a closer look? The visibility of the recommendation, its rationale, and the export scope needs a review before implementation.

## Desired outcome

Walk through the early mock on a phone and desktop. Use the same sample data to explore the daily recommendation, weekly trends, and export preview. Capture the agreed experience in GAR-003 and GAR-004, including what the app shows when the data is stale or sparse.

## Acceptance criteria

- Confirm where the next-session suggestion and its dated reasons appear. Review PUSH, CRUISE, RECOVER, and Insufficient data. Check that recovery uncertainty and the basis for a strength or technique focus remain visible.
- Confirm how to find export, select dates and sports, tell what the file contains, and copy the optional model prompt. Walk through the CSV and JSON choices with complete and limited data. The mock simulates download completion.
- Try the main paths at desktop and phone widths using synthetic records. Record the scenario, observed result, and actionable review findings. Revise and replay affected paths after feedback.
- Record the user’s agreement on the layout, wording, and edge states in this ticket. Carry the selected states, interactions, and checks into GAR-003 and GAR-004 before either enters implementation.

## Questions from the draft

- Check whether Today gives enough context to change a planned session and whether the strength and technique evidence belongs on the main view or behind a detail control.
- Review the default weekly view, access to daily recovery readings, and the date and sport controls. The mock has 7-day and 28-day presets. Confirm how a custom range should fit alongside them.
- Try Quick CSV and the separate JSON review. Confirm the placement of export, the scope summary, and how much preview detail you want before sharing a file.

## Relevant references

- [UX mock review skill](../../.agents/skills/ux-mock-review/SKILL.md)
- [Visual Plans skill](https://github.com/BuilderIO/agent-native/tree/main/skills/visual-plans)
- [Roadmap](../../ROADMAP.md)

## Completion

The archived mock uses synthetic data and simulated downloads. A Sol review identified gaps in the speed of CSV export, recovery granularity, mixed-sport and workout evidence, and missing versus zero values. The draft incorporates those findings.

Offline Chromium checks passed at 1,280, 390, and 360 px. They covered all four recommendations, the hard-ride example, keyboard navigation and dialog dismissal, dated recovery gaps, recorded zero versus unknown activity, date and sport filters, Quick CSV, both export previews, and the prompt control. Desktop and phone screenshots were inspected after the revisions.
