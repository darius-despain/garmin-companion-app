"""
pytest fixtures and mocks for Garmin Readiness App E2E tests.
Provides mocked Garmin Connect responses for Gherkin scenarios.
"""
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

def build_well_rested_28_day_dataset():
    dataset = {"sleep": {}, "hrv": {}, "rhr": {}, "stress": {},
               "body_battery": {}, "activities": {"trail": [], "road": []}}
    for i in range(28):
        d = (datetime.now() - timedelta(days=28 - i)).strftime("%Y-%m-%d")
        dataset["sleep"][d] = {"date": d, "sleep_duration_hours": 7.8 + (i % 5) * 0.05, "sleep_score": 85 + (i % 10)}
    today = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    dataset["sleep"][today] = {"date": today, "sleep_duration_hours": 8.2, "sleep_score": 92}
    for d in dataset["sleep"]:
        dataset["hrv"][d] = {"date": d, "hrv_value": 45 + 2, "hrv_baseline": 45, "hrv_status": "optimal"}
        dataset["rhr"][d] = {"date": d, "resting_hr": 54 + (hash(d) % 3)}
        dataset["stress"][d] = {"date": d, "stress": 22, "body_battery": 85}
        dataset["body_battery"][d] = {"date": d, "body_battery": 85}
    return dataset

def build_sleep_deprived_28_day_dataset():
    dataset = {"sleep": {}, "hrv": {}, "rhr": {}, "stress": {},
               "body_battery": {}, "activities": {"trail": [], "road": []}}
    for i in range(28):
        d = (datetime.now() - timedelta(days=28 - i)).strftime("%Y-%m-%d")
        dataset["sleep"][d] = {"date": d, "sleep_duration_hours": 5.2 if i < 3 else 7.2, "sleep_score": 45 if i < 3 else 72}
    today = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    dataset["sleep"][today] = {"date": today, "sleep_duration_hours": 5.0, "sleep_score": 40}
    for d in dataset["sleep"]:
        dataset["hrv"][d] = {"date": d, "hrv_value": (38.0 if d in list(dataset["sleep"])[:3] else 44.0), "hrv_baseline": 44.0, "hrv_status": "low"}
        dataset["rhr"][d] = {"date": d, "resting_hr": 62 if d in list(dataset["sleep"])[:3] else 54}
        dataset["stress"][d] = {"date": d, "stress": 30, "body_battery": 65}
        dataset["body_battery"][d] = {"date": d, "body_battery": 65}
    return dataset

def build_high_stress_28_day_dataset():
    dataset = {"sleep": {}, "hrv": {}, "rhr": {}, "stress": {},
               "body_battery": {}, "activities": {"trail": [], "road": []}}
    for i in range(28):
        d = (datetime.now() - timedelta(days=28 - i)).strftime("%Y-%m-%d")
        dataset["sleep"][d] = {"date": d, "sleep_duration_hours": 7.5, "sleep_score": 78}
        dataset["stress"][d] = {"date": d, "stress": 52 if i >= 23 else 28, "body_battery": 55}
        dataset["body_battery"][d] = {"date": d, "body_battery": 55}
        dataset["hrv"][d] = {"date": d, "hrv_value": 42, "hrv_baseline": 44, "hrv_status": "low"}
        dataset["rhr"][d] = {"date": d, "resting_hr": 58}
    today = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    dataset["stress"][today] = {"date": today, "stress": 52, "body_battery": 48}
    dataset["body_battery"][today] = {"date": today, "body_battery": 48}
    return dataset

def build_improved_efficiency_28_day_dataset():
    dataset = {"sleep": {}, "hrv": {}, "rhr": {}, "stress": {},
               "body_battery": {}, "activities": {"trail": [], "road": []}}
    for i in range(28):
        d = (datetime.now() - timedelta(days=28 - i)).strftime("%Y-%m-%d")
        dataset["sleep"][d] = {"date": d, "sleep_duration_hours": 7.5, "sleep_score": 80}
        dataset["hrv"][d] = {"date": d, "hrv_value": 42, "hrv_baseline": 43}
        dataset["rhr"][d] = {"date": d, "resting_hr": 56}
        dataset["stress"][d] = {"date": d, "stress": 25, "body_battery": 78}
        dataset["body_battery"][d] = {"date": d, "body_battery": 78}
    for j in range(5):
        d = (datetime.now() - timedelta(days=15 + j)).strftime("%Y-%m-%d")
        dataset["activities"]["trail"].append({"id": f"base_{j}", "type": "trail_run", "date": d, "distance_km": 8.5, "duration_minutes": 51, "avg_hr": 145, "elevation_gain": 400})
    for j in range(3):
        d = (datetime.now() - timedelta(days=3 + j)).strftime("%Y-%m-%d")
        dataset["activities"]["trail"].append({"id": f"curr_{j}", "type": "trail_run", "date": d, "distance_km": 9.0, "duration_minutes": 45, "avg_hr": 145, "elevation_gain": 380})
    return dataset
