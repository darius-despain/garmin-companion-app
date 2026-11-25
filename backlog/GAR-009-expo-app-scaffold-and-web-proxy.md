# GAR-009: Expo TypeScript scaffold, local web CORS proxy, and test runner

- Status: in-progress
- Priority: high
- Source: Expo mobile refactor kickoff, 2026-11-24
- Dependencies: none identified

## Problem

The existing repository only contains a desktop-oriented Python Streamlit prototype (`app.py`). There is no mobile-friendly TypeScript/Expo codebase, no local web CORS proxy for browser development against Garmin's Personal API, and no automated TypeScript test runner.

## Desired outcome

Scaffold a clean, zero-server Expo (TypeScript) app in `mobile/` that is 100% Expo Go–compatible (Android + iOS) and supports Expo Web:

- Expo SDK + TypeScript strict config with Expo Go–compatible dependencies only (`expo-secure-store`, `expo-sqlite`, etc., no custom native modules required for Expo Go).
- Tiny zero-dependency Node.js local dev CORS proxy (`mobile/scripts/garmin-cors-proxy.mjs`) that forwards allowed Garmin Personal API paths to `https://personal.connectapi.garmin.com` without logging any `Authorization` headers or credentials.
- Automated TypeScript test runner (`vitest`) with strict `tsc --noEmit` type-checking.
- Starter `eas.json` configured with a `preview` Android APK profile (`buildType: "apk"`) for later sideloading.
- Leave root Python/Streamlit files untouched.

## Acceptance criteria

- `mobile/` contains a valid Expo TypeScript project (`package.json`, `app.json`, `tsconfig.json`, `eas.json`, `App.tsx`) using only Expo Go–compatible packages.
- `mobile/scripts/garmin-cors-proxy.mjs` handles `OPTIONS` preflight, forwards only allowlisted Garmin Personal API paths, enforces CORS for localhost origins, and never logs credentials or headers.
- `npm test` and `npm run typecheck` run cleanly in `mobile/`.
- `.gitignore` excludes `node_modules/`, `.expo/`, `.env*`, and local SQLite/cache files.

## Relevant references

- [ROADMAP.md](../ROADMAP.md)
- [GAR-002](GAR-002-garmin-personal-api.md)

## Completion

Implemented `mobile/` Expo SDK 58 (TypeScript, Expo Go–compatible) scaffold with `expo-secure-store`, `expo-sqlite`, `eas.json` (`preview` Android APK profile), `scripts/garmin-cors-proxy.mjs`, and Vitest. Verified via `npm run typecheck` (0 errors) and `npm test` (including `tests/corsProxy.test.ts` passing).
