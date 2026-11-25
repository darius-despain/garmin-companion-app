# GAR-002 Garmin Personal API and local SQLite sync (TypeScript)

- **Status** in-progress
- **Priority** high
- **Source** Personal Garmin app request, 2026-11-21; Expo TypeScript pivot, 2026-11-24
- **Dependencies** [GAR-009](GAR-009-expo-app-scaffold-and-web-proxy.md)

## Problem

The legacy Streamlit app asks for a Garmin email and password and saves legacy login tokens. Its importer queries road and trail runs separately, guesses distance and duration units from numeric thresholds, and initializes SQLite tables without reading or writing cached records. Moving to a zero-server mobile-first Expo app requires calling Garmin's official Personal API directly from TypeScript on the device (and via a tiny local dev CORS proxy on Expo Web) while keeping the existing Streamlit app untouched as a reference until parity is reached. [Streamlit connection flow](../app.py#L218) · [Garmin client](../garmin_client.py#L78) · [Activity parsing](../garmin_client.py#L340)

## Desired outcome

Keep the app personal, read-only, and zero-server. Implement Garmin's official Personal API client in TypeScript inside `mobile/`:

- Store the Personal API key securely on device via `expo-secure-store` (native Android/iOS) and in-memory / session-only storage on Expo Web, never in UI logs, exports, or Git.
- Exchange the Personal API key (`Authorization: ApiKey <key>`) at `POST /personalapitoken-service/personal-api/personal-api-key/token` for a 24-hour bearer token, reuse the token until near expiry (5-minute buffer), and renew automatically (retrying an unauthorized data request at most once).
- Support a configurable API base URL so native Expo Go / APK calls `https://personal.connectapi.garmin.com` directly while Expo Web routes through the tiny local dev CORS proxy (`http://localhost:8787`).
- First **Sync now** requests the last 28 completed days; subsequent syncs refresh a short overlap (e.g., 3 days) for late uploads or edits.
- Preserve every sport and keep road/trail/strength views as filters. Sync activity summaries and daily sleep, HRV, resting heart rate, stress, and Body Battery where available.
- Persist synced records in on-device `expo-sqlite` (with a schema that also reserves room for future manual check-ins) using idempotent upserts (`daily_metrics` by `date`, `activities` by `garmin_id`, `sync_meta` for range/coverage/last sync).
- Provide a built-in **sample-data mode** so the app, analytics, and UI can be exercised offline without a live API key.

## Acceptance criteria

- On a live smoke test (using `GARMIN_PERSONAL_API_KEY` supplied by the user outside source control), compare one run and one night of sleep with Garmin Connect. Check whether a strength workout is available and whether activity and wellness records from before key creation can be retrieved. Record the observed coverage and available fields.
- Page through activities (`start`/`limit`, page size `<= 50`) and use date-range health endpoints chunked within Garmin's documented limits (stress `<= 28` days; sleep and Body Battery `<= 31` days; HRV and daily summaries `<= 365` days). Convert declared units explicitly (`meters / 1000` -> km, `seconds / 60` -> minutes). Keep local calendar dates (`YYYY-MM-DD`) and timestamp offsets where available. Store absent values as `null`.
- Refresh a short overlap for late uploads or edits. Upsert daily records by date and activities by Garmin ID. Verify a second sync creates no duplicates and a partial failure preserves the last good data. Track requested range, coverage, and last successful sync.
- Renew an expired bearer token and retry an unauthorized (`401`) data request at most once. Show a clear key replacement error if the token exchange fails due to an invalid or expired key (`401`/`403`). Back off on throttling (`429`, honoring `Retry-After`) or transient `5xx` failures. Keep credentials out of UI, logs, exports, and source control.
- Leave the legacy Streamlit app (`app.py`, `garmin_client.py`, `analytics.py`) untouched as a reference until Expo reaches feature parity (retirement tracked in [GAR-012](GAR-012-eas-preview-apk-and-parity-cutover.md)).
- Validate field mapping, token lifecycle, retry/backoff, SQLite upserts, partial-failure preservation, and sample-data mode with automated TypeScript unit tests.

## Relevant references

- [Garmin Personal API Swagger docs](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)
- [Garmin Connect Personal API key settings](https://connect.garmin.com/app/settings/personalApiToken)
- [Garmin authentication FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- [Official Python client](https://github.com/garmin/connect-personal-api-python)

## Completion

Automated implementation and unit tests complete (`garminPersonalApi.test.ts`: 6/6 passing; `sqliteSync.test.ts`: 2/2 passing against real `node:sqlite`). Pending live smoke test via `mobile/scripts/smoke-test.mjs` with user-supplied `GARMIN_PERSONAL_API_KEY`.
