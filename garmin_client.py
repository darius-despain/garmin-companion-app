"""
Garmin Connect Client Module

Handles read-only Garmin authentication and data retrieval.
Sessions stay in memory; private temporary storage is cleared on disconnect.
"""

import os
import sqlite3
import logging
import tempfile
import shutil
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from pathlib import Path
import requests

from garminconnect import (Garmin, GarminConnectAuthenticationError,
                           GarminConnectConnectionError, GarminConnectTooManyRequestsError)
from garminconnect.client import Client as SDKClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Sessions and health caches are private and ephemeral by default.
# Do not put account data or reusable tokens in repository files/snapshots.
for sdk_logger in ("garminconnect", "garminconnect.client"):
    logging.getLogger(sdk_logger).disabled = True


class ReadOnlySDKClient(SDKClient):
    """Reject account mutations before they reach Garmin.

    Authentication/token refresh uses separate SDK auth transports. Account API
    requests through this client are GET/HEAD only, including SDK convenience
    methods that would otherwise upload, change, or delete data.
    """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # The managed HTTPS proxy supplies trust and credential injection.
        # Use the SDK's requests strategies on this route rather than cycling
        # browser TLS fingerprints, which can stall through multiple timeouts.
        if os.getenv("HTTPS_PROXY"):
            self.skip_strategies = {"mobile+cffi", "widget+cffi", "portal+cffi"}

    def _http_post(self, url, **kwargs):
        if os.getenv("HTTPS_PROXY"):
            kwargs.setdefault("timeout", 30)
            return requests.post(url, **kwargs)
        return super()._http_post(url, **kwargs)

    def _run_request(self, method, path, **kwargs):
        if method.upper() not in {"GET", "HEAD"}:
            raise PermissionError("Garmin account access is read-only")
        return super()._run_request(method, path, **kwargs)


# Activity type mappings
TRAIL_RUN_TYPES = {"trail_run", "trail_running", "trailrun"}
ROAD_RUN_TYPES = {"run", "running", "road_run", "roadrunning"}


class GarminClient:
    """Main client for interacting with Garmin Connect API."""
    
    def __init__(self, username: str, password: str):
        self.garmin = Garmin(email=username, password=password,
                             return_on_mfa=True, retry_attempts=0)
        self.garmin.client = ReadOnlySDKClient(verify_login=True)
        self.session_dir = Path(tempfile.mkdtemp(prefix="garmin-readiness-"))
        self.db_path = self.session_dir / "cache.db"
        self.needs_mfa = False
        self.authenticated = False
        self.error_message = None
        self._ensure_db()

    def _ensure_db(self):
        """Initialize SQLite database for caching."""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS daily_metrics (
                    date TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS activities (
                    id TEXT PRIMARY KEY,
                    activity_type TEXT NOT NULL,
                    date TEXT NOT NULL,
                    data TEXT NOT NULL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error("Garmin operation failed (%s)", type(e).__name__)
    
    def _finish_login(self):
        # The SDK's return_on_mfa mode returns before profile initialization,
        # even when MFA is unnecessary. Restore the in-memory session through
        # its supported tokenstore API to initialize profile and units.
        self.garmin.login(tokenstore=self.garmin.client.dumps())
        self.garmin.password = None
        self.authenticated = True
        self.needs_mfa = False
        self.error_message = None

    def _login_error(self, error):
        self.authenticated = False
        if isinstance(error, GarminConnectTooManyRequestsError):
            message = "Garmin is rate limiting login. Wait before trying again."
        elif isinstance(error, GarminConnectAuthenticationError):
            message = "Garmin rejected authentication. Check your credentials or verification code."
        elif isinstance(error, GarminConnectConnectionError):
            message = "Cannot reach Garmin sign-in. Garmin may be blocking this network with a security challenge."
        else:
            message = "Garmin connection failed. Please try again later."
        self.error_message = message
        # Exception bodies may contain account data, URLs, or tokens.
        logger.warning("Garmin login failed (%s)", type(error).__name__)
        return False

    def authenticate(self) -> bool:
        """Authenticate without persisting secrets or assuming MFA succeeded."""
        try:
            status, _ = self.garmin.login()
            self.needs_mfa = status == "needs_mfa"
            if self.needs_mfa:
                return False
            self._finish_login()
            return True
        except Exception as error:
            return self._login_error(error)

    def complete_mfa(self, code: str) -> bool:
        """Complete a pending challenge on the same in-memory SDK session."""
        if not self.needs_mfa:
            raise ValueError("No Garmin verification is pending")
        try:
            self.garmin.resume_login({}, code)
            self.garmin.password = None
            self.authenticated = True
            self.needs_mfa = False
            self.error_message = None
            return True
        except Exception as error:
            return self._login_error(error)

    def _get_date_range(self, days: int = 28) -> tuple:
        """Get date range for past N days."""
        end_date = datetime.now() - timedelta(days=1)  # Yesterday (most complete data)
        start_date = end_date - timedelta(days=days - 1)
        return (
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d")
        )
    
    def fetch_sleep_data(self, date: str) -> Optional[Dict]:
        """
        Fetch sleep data for a specific date.
        Returns sleep duration (hours) and sleep score.
        """
        try:
            sleep_data = self.garmin.get_sleep_data(date)
            
            if not sleep_data:
                return None
            main_sleep = sleep_data.get('dailySleepDTO') or {}
            if not main_sleep or main_sleep.get('sleepTimeSeconds') is None:
                return None

            result = {
                'date': date,
                'sleep_duration_hours': self._extract_sleep_duration(main_sleep),
                'sleep_score': self._extract_sleep_score(main_sleep),
                'light_sleep': self._extract_sleep_stage(main_sleep, 'light'),
                'deep_sleep': self._extract_sleep_stage(main_sleep, 'deep'),
                'rem_sleep': self._extract_sleep_stage(main_sleep, 'rem')
            }
            
            return result
            
        except Exception as e:
            logger.error("Garmin operation failed (%s)", type(e).__name__)
            return None
    
    def _extract_sleep_duration(self, sleep_data: Dict) -> Optional[float]:
        seconds = sleep_data.get('sleepTimeSeconds')
        return seconds / 3600 if isinstance(seconds, (int, float)) else None

    def _extract_sleep_score(self, sleep_data: Dict) -> Optional[int]:
        return (sleep_data.get('sleepScores') or {}).get('overall', {}).get('value')

    def _extract_sleep_stage(self, sleep_data: Dict, stage: str) -> Optional[int]:
        seconds = sleep_data.get(f'{stage}SleepSeconds')
        return seconds / 60 if isinstance(seconds, (int, float)) else None

    def fetch_hrv_data(self, date: str) -> Optional[Dict]:
        """
        Fetch HRV data for a specific date.
        Returns HRV status and 7-day baseline.
        """
        try:
            hrv_data = self.garmin.get_hrv_data(date)
            
            hrv_data = (hrv_data or {}).get('hrvSummary') or {}
            if not hrv_data:
                return None
            
            result = {
                'date': date,
                'hrv_value': self._extract_hrv_value(hrv_data),
                'hrv_status': hrv_data.get('status', hrv_data.get('hrvStatus', None)),
                'hrv_baseline': self._extract_hrv_baseline(hrv_data)
            }
            
            return result
            
        except Exception as e:
            logger.error("Garmin operation failed (%s)", type(e).__name__)
            return None
    
    def _extract_hrv_value(self, hrv_data: Dict) -> Optional[float]:
        """Extract HRV value (RMSSD)."""
        try:
            return hrv_data.get('lastNightAvg')
        except Exception:
            return None
    
    def _extract_hrv_baseline(self, hrv_data: Dict) -> Optional[float]:
        """Extract 7-day HRV baseline."""
        try:
            return hrv_data.get('weeklyAvg')
        except Exception:
            return None
    
    def fetch_rhr_data(self, date: str) -> Optional[Dict]:
        """
        Fetch Resting Heart Rate data for a specific date.
        """
        try:
            # Garmin Connect stores RHR in body battery or health snapshot
            rhr_data = self.garmin.get_heart_rates(date)
            
            if not rhr_data:
                return None
            
            result = {
                'date': date,
                'resting_hr': self._extract_resting_hr(rhr_data)
            }
            
            return result
            
        except Exception as e:
            logger.error("Garmin operation failed (%s)", type(e).__name__)
            return None
    
    def _extract_resting_hr(self, hr_data: Dict) -> Optional[int]:
        """Extract resting heart rate."""
        try:
            return hr_data.get('restingHeartRate', hr_data.get('rhr', None))
        except Exception:
            return None
    
    def fetch_stress_data(self, date: str) -> Optional[Dict]:
        """
        Fetch daily stress data.
        Returns average stress score and body battery.
        """
        try:
            stress_data = self.garmin.get_stress_data(date)
            battery_days = self.garmin.get_body_battery(date)
            battery = battery_days[0] if battery_days else {}
            
            if not stress_data:
                return None
            
            result = {
                'date': date,
                'body_battery': self._extract_body_battery(battery),
                'stress': self._extract_stress_score(stress_data)
            }
            
            return result
            
        except Exception as e:
            logger.error("Garmin operation failed (%s)", type(e).__name__)
            return None
    
    def _extract_body_battery(self, data: Dict) -> Optional[int]:
        """Extract body battery value."""
        try:
            values = data.get('bodyBatteryValuesArray') or []
            return next((row[-1] for row in reversed(values) if len(row) >= 2 and isinstance(row[-1], (int, float)) and row[-1] >= 0), None)
        except Exception:
            return None
    
    def _extract_stress_score(self, data: Dict) -> Optional[int]:
        """Extract average daily stress score."""
        try:
            return data.get('avgStressLevel')
        except Exception:
            return None
    
    def fetch_activities(self, activity_type: str, date_range: tuple = None) -> List[Dict]:
        """
        Fetch activities of specified type within date range.
        Defaults to past 28 days.
        """
        if date_range is None:
            date_range = self._get_date_range(28)
        
        try:
            activities = self.garmin.get_activities_by_date(date_range[0], date_range[1])
            
            if not activities:
                return []
            
            # Filter by activity type
            filtered = []
            for activity in activities:
                act_type = self._activity_type(activity)
                
                if activity_type == 'trail' and act_type in TRAIL_RUN_TYPES:
                    filtered.append(self._parse_activity(activity))
                elif activity_type == 'road' and act_type in ROAD_RUN_TYPES:
                    filtered.append(self._parse_activity(activity))
                elif activity_type == 'all':
                    if act_type in TRAIL_RUN_TYPES or act_type in ROAD_RUN_TYPES:
                        filtered.append(self._parse_activity(activity))
            
            return filtered
            
        except Exception as e:
            logger.error("Garmin operation failed (%s)", type(e).__name__)
            return []
    
    def _parse_activity(self, activity: Dict) -> Dict:
        """Parse activity data into standard format."""
        return {
            'id': activity.get('activityId', activity.get('id', '')),
            'type': self._activity_type(activity),
            'date': activity.get('startTimeLocal', activity.get('date', ''))[:10],
            'distance_km': self._parse_distance(activity.get('distance', 0)),
            'duration_minutes': self._parse_duration(activity.get('duration', 0)),
            'avg_hr': activity.get('averageHeartRate', activity.get('avgHeartRate', None)),
            'elevation_gain': activity.get('elevationGain', activity.get('totalElevationGain', 0))
        }
    
    @staticmethod
    def _activity_type(activity: Dict) -> str:
        value = activity.get('activityType') or ''
        if isinstance(value, dict):
            value = value.get('typeKey', '')
        return value.lower()

    def _parse_distance(self, distance: Any) -> float:
        # Garmin reports meters, including runs shorter than one kilometer.
        return float(distance or 0) / 1000

    def _parse_duration(self, duration: Any) -> float:
        # Garmin reports seconds, including activities shorter than one hour.
        return float(duration or 0) / 60

    def get_full_28_day_dataset(self) -> Dict[str, Any]:
        """
        Fetch complete dataset for past 28 days including all metrics.
        Returns structured data for analytics processing.
        """
        if not self.authenticated:
            raise ConnectionError("Connect to Garmin before refreshing data")
        date_range = self._get_date_range(28)
        
        logger.info(f"Fetching data from {date_range[0]} to {date_range[1]}")
        
        dataset = {
            'sleep': {},
            'hrv': {},
            'rhr': {},
            'stress': {},
            'body_battery': {},
            'activities': {
                'trail': [],
                'road': []
            }
        }
        
        # Fetch daily metrics for each date
        start_date = datetime.strptime(date_range[0], "%Y-%m-%d")
        end_date = datetime.strptime(date_range[1], "%Y-%m-%d")
        
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            
            # Fetch sleep
            sleep = self.fetch_sleep_data(date_str)
            if sleep:
                dataset['sleep'][date_str] = sleep
            
            # Fetch HRV
            hrv = self.fetch_hrv_data(date_str)
            if hrv:
                dataset['hrv'][date_str] = hrv
            
            # Fetch RHR
            rhr = self.fetch_rhr_data(date_str)
            if rhr:
                dataset['rhr'][date_str] = rhr
            
            # Fetch stress/body battery
            stress = self.fetch_stress_data(date_str)
            if stress:
                dataset['stress'][date_str] = stress
                dataset['body_battery'][date_str] = stress
            
            current_date += timedelta(days=1)
        
        # Fetch activities
        logger.info("Fetching trail run activities...")
        dataset['activities']['trail'] = self.fetch_activities('trail', date_range)
        
        logger.info("Fetching road run activities...")
        dataset['activities']['road'] = self.fetch_activities('road', date_range)
        
        logger.info(f"Dataset complete: {len(dataset['sleep'])} sleep days, "
                   f"{len(dataset['hrv'])} HRV days, "
                   f"{len(dataset['activities']['trail'])} trail runs, "
                   f"{len(dataset['activities']['road'])} road runs")
        
        if not any(dataset[key] for key in ('sleep', 'hrv', 'rhr', 'stress')) and not any(dataset['activities'].values()):
            raise ConnectionError('No Garmin data was retrieved; check the connection before retrying')
        return dataset
    
    def logout(self):
        """Disconnect locally; never revoke or modify the Garmin account."""
        self.garmin = None
        self.authenticated = False
        self.needs_mfa = False
        if self.session_dir.exists():
            shutil.rmtree(self.session_dir)


def get_client(username: str, password: str) -> GarminClient:
    """Factory function to create and authenticate Garmin client."""
    client = GarminClient(username, password)
    if not client.authenticate() and not client.needs_mfa:
        message = client.error_message
        client.logout()
        raise ConnectionError(message) from None
    return client
