# GAR-012: EAS preview Android APK and legacy Streamlit cutover

- Status: ready
- Priority: medium
- Source: Expo mobile refactor kickoff, 2026-11-24
- Dependencies: [GAR-002](GAR-002-garmin-personal-api.md), [GAR-011](GAR-011-expo-dashboard-ui-and-navigation.md)

## Problem

The Expo app needs a repeatable sideloadable Android APK build path via EAS `preview`, and once Expo reaches feature parity with the legacy Streamlit prototype, the old password-based Streamlit code should be retired cleanly.

## Desired outcome

- Verify `eas build --platform android --profile preview` produces a sideloadable APK that connects to Garmin's Personal API directly from the phone.
- Once feature parity is confirmed against `app.py`, retire the legacy Streamlit password login (`app.py`, `garmin_client.py`, `analytics.py`, `requirements.txt`) and update `README.md` for Expo-first usage.

## Acceptance criteria

- EAS `preview` build configuration produces an installable Android APK without custom server infrastructure.
- Live sync works on-device in Expo Go and the sideloaded APK.
- Legacy Streamlit password auth and unused Python files are removed only after parity sign-off; no personal fitness records are lost.

## Relevant references

- [ROADMAP.md](../ROADMAP.md)
- [GAR-002](GAR-002-garmin-personal-api.md)

## Completion

Pending parity verification and EAS preview build.
