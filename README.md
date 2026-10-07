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

### Prerequisites

```bash
pip install garminconnect streamlit plotly
```

### Configuration

Create a `.env` file in the project root with your Garmin Connect credentials:

```bash
GARMIN_USERNAME=your_email@example.com
GARMIN_PASSWORD=your_password
```

### Running the App

```bash
cd garmin-readiness-app
streamlit run app.py --server.address=0.0.0.0
```

View the app on mobile devices connected to the same network by accessing the provided local IP address.

## Architecture

### 1. garmin_client.py

Handles login, token saving, and data retrieval for:
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
2. App authenticates with Garmin Connect using stored tokens
3. Retrieves past 28 days of health and activity data
4. Analytics engine processes data for readiness, trends, and gaps
5. Streamlit UI renders results

## Storage

Data is cached locally in SQLite to:
- Prevent rate-limiting Garmin servers
- Ensure offline access
- Maintain user privacy

## Notes

- Authentication tokens are stored locally in `~/.garminconnect` to avoid MFA prompts
- The app respects Garmin Connect's rate limits
- All processing happens locally for privacy
- The app is designed for desktop execution with mobile viewing via local network