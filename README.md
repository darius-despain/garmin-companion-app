# Garmin Readiness App

A lightweight, local web application that pulls passive health and activity data from Garmin Connect, evaluates weekly conditioning trends, provides a daily "readiness budget," and diagnoses gaps in recovery or training.

## Features

- **Passive Data Ingestion**: Extract sleep, HRV, RHR, stress, body battery, and run activities for the past 28 days
- **Conditioning Trend Analysis**: Calculate aerobic efficiency and identify training trends (Improving/Stable/Detraining)
- **Daily Readiness Budget**: 0-100 gauge with 3-tier status (PUSH/CRUISE/RECOVER) based on HRV, RHR, and sleep
- **Gap Analysis**: Prioritize recommendations based on sleep deficit, stress levels, or recovery windows

## Tech Stack

- **Language**: Python 3.11+
- **Garmin Ingestion**: `garminconnect` Python library (cyberjunky/python-garminconnect)
- **UI Framework**: Streamlit
- **Local Cache**: SQLite

## Setup

For the development workflow and definition of done, follow
[the development-loop skill](.agents/skills/development-loop/SKILL.md).
See [the current handoff](docs/handoff.md) for validation evidence and blockers.

### Read-only account access

This app authenticates with Garmin and reads health/activity data. Its account
API transport rejects POST, PUT, PATCH, and DELETE requests. Sign-in, verification,
and token refresh may still use POST. Disconnect clears only local session state.
The password itself retains normal account privileges; see [AGENTS.md](AGENTS.md)
for rules all agents must follow.

For cloud use, inject `GARMIN_USERNAME` and `GARMIN_PASSWORD` through secure
environment settings. Do not send values in chat or commit a `.env` file.
The UI's **Use securely configured credentials** option keeps injected values
out of browser widgets. Sessions and SQLite files use private temporary storage;
the app does not persist reusable login tokens in the repository.

The tested SDK is `garminconnect==0.3.17`: credentials belong in the `Garmin`
constructor, not `login()`. MFA continues on the same in-memory session using
the verification-code field. Garmin may block cloud sign-in with an HTTP 403
security challenge. A successful local/mock test does not establish real-account
connectivity. Keep TLS verification and the configured proxy enabled.

### Prerequisites

```bash
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the project root with your Garmin Connect credentials:

```bash
GARMIN_USERNAME=your_email@example.com
GARMIN_PASSWORD=your_password
```

### Running the App

```bash
cd garmin-companion-app
streamlit run app.py --server.address=127.0.0.1 --browser.gatherUsageStats=false
```

The default listener is local to the machine. Keep it private when testing with
real account credentials.

## Architecture

### 1. garmin_client.py

Handles in-memory login/MFA sessions and read-only data retrieval for:
- Sleep metrics (duration, sleep score)
- Autonomic recovery (HRV, RHR)
- Daily load & stress (stress score, body battery)
- Activities (trail runs, road runs)

### 2. analytics.py

Implements core analytical logic:
- Readiness Budget calculation (HRV, RHR, Sleep components)
- Aerobic efficiency index
- Conditioning trend detection
- Gap diagnosis rules

### 3. app.py

Streamlit dashboard implementing:
- Readiness Gauge with 3-tier status
- Weekly conditioning trend visualization
- Gap analysis and recommendations
- Mobile-responsive layout

## Data Flow

1. User runs app
2. App authenticates with Garmin Connect and retains the session in memory
3. Retrieves past 28 days of health and activity data
4. Analytics engine processes data for readiness, trends, and gaps
5. Streamlit UI renders results

## Storage

The client initializes SQLite tables in private temporary storage, but persistent
health-data caching and offline account-data access are not implemented. Login
tokens are not saved to disk. Disconnect removes the client's temporary directory.

## Notes

- Authentication sessions stay in memory; reconnecting may require MFA again
- The app respects Garmin Connect's rate limits
- All processing happens locally for privacy
- The app is designed for desktop execution with mobile viewing via local network
