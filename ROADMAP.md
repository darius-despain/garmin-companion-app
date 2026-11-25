# Garmin Companion roadmap

Help decide how hard to train and what to work on next, with running as the first sport and a training history that includes other workouts.

**Architecture:** Single zero-server **Expo (React Native + Web, TypeScript)** app in `mobile/` that is 100% Expo Go–compatible (Android + iOS), supports Expo Web via a tiny local dev CORS proxy, calls Garmin's official Personal API directly from the device (`expo-secure-store` for the API key), stores synced history and future check-ins in on-device `expo-sqlite`, includes a built-in sample-data mode, and builds a sideloadable Android APK via EAS `preview`. The legacy Streamlit app (`app.py`, `garmin_client.py`, `analytics.py`) stays untouched as a reference until Expo reaches feature parity.

| Order | Work | Completion |
| --- | --- | --- |
| Task 1 | [GAR-009 Expo scaffold, web CORS proxy, and test runner](backlog/GAR-009-expo-app-scaffold-and-web-proxy.md) | Expo TypeScript app boots in `mobile/` (Expo Go + Web), local dev CORS proxy forwards Garmin Personal API calls, and automated unit tests run cleanly. |
| Task 2 | [GAR-002 Personal API and local SQLite sync](backlog/GAR-002-garmin-personal-api.md) | TypeScript Garmin Personal API client, `expo-secure-store` key storage, `expo-sqlite` upsert store, and sample-data mode pass automated tests and live smoke test. |
| Task 3 | [GAR-010 TypeScript analytics parity port](backlog/GAR-010-typescript-analytics-parity-port.md) | Readiness budget, aerobic efficiency, conditioning trend, and gap diagnosis match `analytics.py` across shared fixtures. |
| Task 4 | [GAR-011 Mobile-first Expo dashboard UI](backlog/GAR-011-expo-dashboard-ui-and-navigation.md) | Phone and desktop UI mock is reviewed first; dashboard renders readiness, trends, gaps, sync status, and sample-data toggle with zero credentials exposed. |
| After dashboard | [GAR-003 Training exports and charts](backlog/GAR-003-training-exports-and-charts.md) | The charts and CSV and JSON downloads use the same local date range, sport filters, and coverage. |
| After exports | [GAR-004 Running load, strength, and technique guidance](backlog/GAR-004-training-decisions.md) | The advice cites dated evidence and handles mixed, stale, or insufficient data. Strength and technique prompts reflect available evidence. |
| Cutover | [GAR-012 EAS preview APK and Streamlit cutover](backlog/GAR-012-eas-preview-apk-and-parity-cutover.md) | Sideloadable Android APK builds via EAS `preview`; legacy Streamlit password login and files are retired once feature parity is verified. |
| Later | In-app model review | Revisit direct model calls once the manual export workflow is useful and provider handling is understood. |

At the kickoff of **Task 4 (GAR-011)**, **GAR-003**, and **GAR-004**, start with a UI mock. Walk through the main and limited-data scenarios at phone and desktop widths, agree on the behavior, and use those scenarios to verify implementation. Deliver running load and efficiency first within GAR-004, then add strength and technique context. [UX mock review skill](.agents/skills/ux-mock-review/SKILL.md) · [Backlog](BACKLOG.md)
