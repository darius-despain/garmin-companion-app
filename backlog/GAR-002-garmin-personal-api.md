# GAR-002 Garmin Personal API and local sync

- **Status** ready
- **Priority** unassigned
- **Source** Personal Garmin app request, 2026-11-21
- **Dependencies** none identified

## Problem

The Streamlit app asks for a Garmin email and password and saves legacy login tokens. The importer queries road and trail runs separately, guesses distance and duration units from numeric thresholds, and initializes SQLite tables without reading or writing cached records. [Streamlit connection flow](../app.py#L218) · [Garmin client](../garmin_client.py#L78) · [Activity parsing](../garmin_client.py#L340)

## Desired outcome

Keep the app personal and read-only. Replace login with Garmin’s official Python client on Python 3.12, which is available in the workspace. Store the Personal API key in server-side configuration outside the repo under `GARMIN_PERSONAL_API_KEY`. Exchange it for an OAuth2 bearer token, reuse the token until its reported expiry, and exchange the key again when needed. [Garmin authentication FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/) · [Official Python client](https://github.com/garmin/connect-personal-api-python#requirements-and-installation)

The first **Sync now** action requests the last 28 completed days. Preserve every sport and keep the existing road and trail views as filters. Sync activity summaries and daily sleep, HRV, resting heart rate, stress, and Body Battery where available. Retain the data in local SQLite so viewing and exporting can work from the last successful sync. [Personal API endpoint wrappers](https://github.com/garmin/connect-personal-api-python#endpoint-wrappers)

## Acceptance criteria

- On a live smoke test, compare one run and one night of sleep with Garmin Connect. Check whether a strength workout is available and whether activity and wellness records from before key creation can be retrieved. Record the observed coverage and available fields. If more history is needed, scope an import from Garmin’s account export separately. [Garmin data export instructions](https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8)
- Page through activities and use date-range health endpoints where supported. Convert declared units explicitly, so a distance of 800 meters becomes 0.8 km and 1,800 seconds becomes 30 minutes. Keep local calendar dates and timestamp offsets where available. Store absent values as missing.
- Refresh a short overlap for late uploads or edits. Upsert daily records by date and activities by Garmin ID. Verify a second sync creates no duplicates and a partial failure preserves the last good data. Show requested range, coverage, and last successful sync in the app. Show readiness as unavailable when it lacks required inputs.
- Renew an expired bearer token and retry an unauthorized data request at most once. Show a clear key replacement message if the exchange fails due to an invalid or expired key. Back off on throttling or transient failures. Keep credentials out of the UI, logs, exports, and source control.
- After the Personal API smoke test passes, remove the app’s password login and legacy environment settings, and update setup instructions. Preserve any existing fitness records and retire only app-owned legacy credentials.
- Validate field mapping and sync behavior with sample payloads and exercise the Streamlit connect and refresh flow against a mocked client. The repo currently has four passing tests and six setup errors from unregistered fixtures. Restore the relevant test setup as part of validating the new connection flow. [Fixture builders](../tests/conftest.py) · [Streamlit test harness](../tests/test_app.py#L25)

## Relevant references

- [Garmin Personal API Swagger docs](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)
- [Garmin Connect Personal API key settings](https://connect.garmin.com/app/settings/personalApiToken)

## Completion

Pending implementation and live validation.
