# GAR-011: Mobile-first Expo dashboard UI and UX mock review

- Status: ready
- Priority: high
- Source: Expo mobile refactor kickoff, 2026-11-24
- Dependencies: [GAR-002](GAR-002-garmin-personal-api.md), [GAR-009](GAR-009-expo-app-scaffold-and-web-proxy.md), [GAR-010](GAR-010-typescript-analytics-parity-port.md)

## Problem

Once the Expo scaffold, Garmin Personal API + SQLite sync, and TypeScript analytics engine are tested, the app needs a mobile-first dashboard UI that works cleanly on phone screens (Expo Go / Android APK) and desktop browsers (Expo Web).

## Desired outcome

Follow the UX mock review gate in `ROADMAP.md` before building screens:

1. Present a quick clickable UI mock at phone and desktop widths covering main data, limited/stale data, and sample-data states.
2. Implement the agreed Expo UI:
   - Readiness Budget card (score, tier, HRV/RHR/Sleep breakdown, unavailable state).
   - Conditioning Trend summary and recent activity list with sport filters (All / Road / Trail / Strength).
   - Prioritized Gap Diagnosis cards.
   - Sync & Settings screen: Personal API key entry (`expo-secure-store`, masked, never logged), **Sync now** action, last sync + date coverage indicator, and **Sample Data** toggle.

## Acceptance criteria

- UI mock at phone and desktop widths is reviewed and approved before screen implementation.
- Dashboard works in both Sample Data mode and synced SQLite mode without requiring a server.
- No API key or bearer token is ever rendered in plain text, logged, or included in exports.

## Relevant references

- [ROADMAP.md](../ROADMAP.md)
- [UX mock review skill](../.agents/skills/ux-mock-review/SKILL.md)
- [app.py](../app.py)

## Completion

Pending UX mock review and implementation.
