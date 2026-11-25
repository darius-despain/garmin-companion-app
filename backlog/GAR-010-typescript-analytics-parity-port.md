# GAR-010: Port analytics.py to TypeScript with fixture parity tests

- Status: in-progress
- Priority: high
- Source: Expo mobile refactor kickoff, 2026-11-24
- Dependencies: [GAR-009](GAR-009-expo-app-scaffold-and-web-proxy.md)

## Problem

All readiness, aerobic efficiency, conditioning trend, and gap diagnosis calculations live in Python (`analytics.py`). The zero-server Expo app needs the exact same analytical logic running locally in TypeScript on the device.

## Desired outcome

Port `analytics.py` to `mobile/src/analytics/` in strict TypeScript and verify numerical and behavioral parity against the existing Python implementation using deterministic shared fixtures:

- `calculateReadinessBudget` (and HRV, RHR, Sleep components + `PUSH`/`CRUISE`/`RECOVER` tiers + unavailable state when required inputs are missing).
- `calculateAerobicEfficiency` (`pace / (avgHr - restingHr)`).
- `analyzeConditioningTrend` (7-day vs prior 21-day baseline, `Improving`/`Holding`/`Slumping`/`No Data`, HRV and RHR 7-day trends).
- `diagnoseGaps` (Sleep Deficit, High Parasympathetic Suppression, Recovery Window Deficit, HRV Declining, Elevated Resting HR, sorted by priority score).
- `formatConditioningTrend` and `formatGapAnalysis`.

## Acceptance criteria

- TypeScript analytics module passes unit tests covering all readiness tiers, edge cases (empty/partial/zero/negative inputs), aerobic efficiency, conditioning trends, and all 5 gap rules.
- Automated fixture parity test runs the Python `analytics.py` reference against deterministic JSON fixtures (mirroring `tests/conftest.py` scenarios plus edge cases) and asserts the TypeScript port produces matching outputs.
- `analytics.py` remains untouched.

## Relevant references

- [analytics.py](../analytics.py)
- [tests/conftest.py](../tests/conftest.py)

## Completion

Ported `analytics.py` to `mobile/src/analytics/analytics.ts` with exact IEEE-754 Python rounding parity and readiness availability metadata. Verified via `npm run typecheck` and `mobile/tests/analytics.parity.test.ts` (9/9 passing, including 7 direct `analytics.py` <-> `analytics.ts` fixture parity checks). `analytics.py` left untouched.
