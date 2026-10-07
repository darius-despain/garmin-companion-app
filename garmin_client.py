"""
Garmin Connect Client Module

Handles authentication, token persistence, and data retrieval from Garmin Connect.
Uses the garminconnect library with local token storage to avoid frequent MFA prompts.
"""

import os
import json
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from pathlib import Path

import yaml
from garminconnect import Garmin

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
TOKEN_DIR = Path.home() / ".garminconnect"
TOKEN_FILE = TOKEN_DIR / "tokens.yaml"
DB_PATH = Path.home() / ".garminconnect" / "cache.db"

# Activity type mappings
TRAIL_RUN_TYPES = {"trail_run", "trail_running", "trailrun"}
ROAD_RUN_TYPES = {"run", "running", "road_run", "roadrunning"}


class TokenManager:
    """Manages persistent token storage for Garmin Connect authentication."""
    
    def __init__(self, token_dir: Path = TOKEN_DIR):
        self.token_dir = token_dir
        self.token_file = token_dir / "tokens.yaml"
        self._ensure_token_dir()
    
    def _ensure_token_dir(self):
        """Create token directory if it doesn't exist."""
        self.token_dir.mkdir(parents=True, exist_ok=True)
    
    def save_tokens(self, tokens: Dict[str, Any]):
        """Save authentication tokens to local file."""
        try:
            with open(self.token_file, 'w') as f:
                yaml.dump(tokens, f)
            logger.info("Tokens saved successfully")
        except Exception as e:
            logger.error(f"Failed to save tokens: {e}")
            raise
    
    def load_tokens(self) -> Optional[Dict[str, Any]]:
        """Load authentication tokens from local file."""
        try:
            if self.token_file.exists():
                with open(self.token_file, 'r') as f:
                    tokens = yaml.safe_load(f)
                    logger.info("Tokens loaded successfully")
                    return tokens
            return None
        except Exception as e:
            logger.error(f"Failed to load tokens: {e}")
            return None
    
    def clear_tokens(self):
        """Clear stored tokens."""
        try:
            if self.token_file.exists():
                self.token_file.unlink()
                logger.info("Tokens cleared")
        except Exception as e:
            logger.error(f"Failed to clear tokens: {e}")


class GarminClient:
    """Main client for interacting with Garmin Connect API."""
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.garmin = Garmin()
        self.token_manager = TokenManager()
        self.db_path = DB_PATH
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
            logger.error(f"Database initialization error: {e}")
    
    def authenticate(self) -> bool:
        """
        Authenticate with Garmin Connect.
        Uses cached tokens if available, otherwise performs full login.
        """
        try:
            # Try loading cached tokens first
            tokens = self.token_manager.load_tokens()
            
            if tokens:
                # Attempt to restore session with cached tokens
                try:
                    self.garmin = Garmin(
                        email=self.username,
                        password=self.password,
                        token=tokens.get('token'),
                        unit_system='metric'
                    )
                    # Verify token is still valid by making a simple request
                    self.garmin.get_full_sleep_data("today")
                    logger.info("Authenticated with cached tokens")
                    return True
                except Exception as e:
                    logger.warning(f"Cached tokens invalid, performing full login: {e}")
            
            # Perform full login
            self.garmin.login(self.username, self.password)
            
            # Save new tokens
            tokens = {
                'token': self.garmin.token if hasattr(self.garmin, 'token') else None,
                'username': self.username,
                'last_login': datetime.now().isoformat()
            }
            self.token_manager.save_tokens(tokens)
            logger.info("Authentication successful with new tokens")
            return True
            
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return False
    
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
            
            if not sleep_data or 'sleep' not in sleep_data:
                logger.warning(f"No sleep data for {date}")
                return None
            
            sleep = sleep_data['sleep']
            if not sleep or len(sleep) == 0:
                return None
            
            # Extract main sleep summary
            main_sleep = sleep[0] if isinstance(sleep, list) else sleep
            
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
            logger.error(f"Error fetching sleep data for {date}: {e}")
            return None
    
    def _extract_sleep_duration(self, sleep_data: Dict) -> Optional[float]:
        """Extract sleep duration in hours from sleep data."""
        try:
            # Try common field names
            duration = sleep_data.get('minutes', sleep_data.get('duration', None))
            if duration:
                if isinstance(duration, str):
                    # Parse "HH:MM" format
                    parts = duration.split(':')
                    if len(parts) >= 2:
                        hours = int(parts[0])
                        minutes = int(parts[1])
                        return hours + minutes / 60
                elif isinstance(duration, (int, float)):
                    # Assume minutes
                    return duration / 60
            return None
        except Exception:
            return None
    
    def _extract_sleep_score(self, sleep_data: Dict) -> Optional[int]:
        """Extract sleep score from sleep data."""
        try:
            return sleep_data.get('score', sleep_data.get('sleepScore', None))
        except Exception:
            return None
    
    def _extract_sleep_stage(self, sleep_data: Dict, stage: str) -> Optional[int]:
        """Extract sleep stage duration in minutes."""
        try:
            stages = sleep_data.get('stages', {})
            return stages.get(stage, sleep_data.get(f'{stage}Minutes', None))
        except Exception:
            return None
    
    def fetch_hrv_data(self, date: str) -> Optional[Dict]:
        """
        Fetch HRV data for a specific date.
        Returns HRV status and 7-day baseline.
        """
        try:
            hrv_data = self.garmin.get_hrv_status(date)
            
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
            logger.error(f"Error fetching HRV data for {date}: {e}")
            return None
    
    def _extract_hrv_value(self, hrv_data: Dict) -> Optional[float]:
        """Extract HRV value (RMSSD)."""
        try:
            return hrv_data.get('rmssd', hrv_data.get('hrv', hrv_data.get('value', None)))
        except Exception:
            return None
    
    def _extract_hrv_baseline(self, hrv_data: Dict) -> Optional[float]:
        """Extract 7-day HRV baseline."""
        try:
            return hrv_data.get('baseline', hrv_data.get('sevenDayAvg', None))
        except Exception:
            return None
    
    def fetch_rhr_data(self, date: str) -> Optional[Dict]:
        """
        Fetch Resting Heart Rate data for a specific date.
        """
        try:
            # Garmin Connect stores RHR in body battery or health snapshot
            rhr_data = self.garmin.get_heart_rate(date)
            
            if not rhr_data:
                return None
            
            result = {
                'date': date,
                'resting_hr': self._extract_resting_hr(rhr_data)
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching RHR data for {date}: {e}")
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
            stress_data = self.garmin.get_body_battery(date)
            
            if not stress_data:
                return None
            
            result = {
                'date': date,
                'body_battery': self._extract_body_battery(stress_data),
                'stress': self._extract_stress_score(stress_data)
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching stress data for {date}: {e}")
            return None
    
    def _extract_body_battery(self, data: Dict) -> Optional[int]:
        """Extract body battery value."""
        try:
            return data.get('bodyBattery', data.get('body_battery', None))
        except Exception:
            return None
    
    def _extract_stress_score(self, data: Dict) -> Optional[int]:
        """Extract average daily stress score."""
        try:
            return data.get('stress', data.get('stressScore', None))
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
            activities = self.garmin.get_activities(
                date_range[0],
                date_range[1]
            )
            
            if not activities:
                return []
            
            # Filter by activity type
            filtered = []
            for activity in activities:
                act_type = activity.get('activityType', '').lower()
                
                if activity_type == 'trail' and act_type in TRAIL_RUN_TYPES:
                    filtered.append(self._parse_activity(activity))
                elif activity_type == 'road' and act_type in ROAD_RUN_TYPES:
                    filtered.append(self._parse_activity(activity))
                elif activity_type == 'all':
                    if act_type in TRAIL_RUN_TYPES or act_type in ROAD_RUN_TYPES:
                        filtered.append(self._parse_activity(activity))
            
            return filtered
            
        except Exception as e:
            logger.error(f"Error fetching activities: {e}")
            return []
    
    def _parse_activity(self, activity: Dict) -> Dict:
        """Parse activity data into standard format."""
        return {
            'id': activity.get('activityId', activity.get('id', '')),
            'type': activity.get('activityType', 'unknown'),
            'date': activity.get('startTimeLocal', activity.get('date', '')),
            'distance_km': self._parse_distance(activity.get('distance', 0)),
            'duration_minutes': self._parse_duration(activity.get('duration', 0)),
            'avg_hr': activity.get('averageHeartRate', activity.get('avgHeartRate', None)),
            'elevation_gain': activity.get('elevationGain', activity.get('totalElevationGain', 0))
        }
    
    def _parse_distance(self, distance: Any) -> float:
        """Parse distance, converting to km if needed."""
        try:
            if isinstance(distance, (int, float)):
                # Assume meters if > 1000, otherwise km
                if distance > 1000:
                    return distance / 1000
                return distance
            return float(distance)
        except Exception:
            return 0.0
    
    def _parse_duration(self, duration: Any) -> float:
        """Parse duration, converting to minutes if needed."""
        try:
            if isinstance(duration, (int, float)):
                # Assume seconds if > 3600, otherwise minutes
                if duration > 3600:
                    return duration / 60
                return duration
            return float(duration)
        except Exception:
            return 0.0
    
    def get_full_28_day_dataset(self) -> Dict[str, Any]:
        """
        Fetch complete dataset for past 28 days including all metrics.
        Returns structured data for analytics processing.
        """
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
        
        return dataset
    
    def logout(self):
        """Logout and clear tokens."""
        try:
            self.garmin.logout()
            logger.info("Logged out successfully")
        except Exception as e:
            logger.error(f"Logout error: {e}")
        finally:
            self.token_manager.clear_tokens()


def get_client(username: str, password: str) -> GarminClient:
    """Factory function to create and authenticate Garmin client."""
    client = GarminClient(username, password)
    if not client.authenticate():
        raise ConnectionError("Failed to authenticate with Garmin Connect")
    return client