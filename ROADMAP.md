# Garmin Companion roadmap

Help decide how hard to train and what to work on next, with running as the first sport and a training history that includes other workouts.

| Order | Work | Completion |
| --- | --- | --- |
| First | [GAR-002 Personal API and sync](backlog/GAR-002-garmin-personal-api.md) | Key-based sync is verified against Garmin Connect and the app saves activity and recovery data locally. |
| After sync | [GAR-003 Training exports and charts](backlog/GAR-003-training-exports-and-charts.md) | The charts and CSV and JSON downloads use the same local date range, sport filters, and coverage. |
| After exports | [GAR-004 Running load, strength, and technique guidance](backlog/GAR-004-training-decisions.md) | The advice cites dated evidence and handles mixed, stale, or insufficient data. Strength and technique prompts reflect available evidence. |
| Later | In-app model review | Revisit direct model calls once the manual export workflow is useful and provider handling is understood. |

At the kickoff of GAR-003 and GAR-004, start with a UI mock. Walk through the main and limited-data scenarios at desktop and phone widths, agree on the behavior, and use those scenarios to verify implementation. Deliver running load and efficiency first within GAR-004, then add strength and technique context. [UX mock review skill](.agents/skills/ux-mock-review/SKILL.md) · [Backlog](BACKLOG.md)
