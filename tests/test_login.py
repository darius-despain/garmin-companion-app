"""Offline regression tests: never authenticate to a real Garmin account."""
from unittest.mock import MagicMock, patch
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest
from garminconnect import GarminConnectConnectionError
from garminconnect.client import Client as SDKClient
from garmin_client import GarminClient, ReadOnlySDKClient, get_client


@pytest.fixture
def client():
    with patch("garmin_client.Garmin") as constructor:
        sdk = constructor.return_value
        sdk.login.return_value = (None, None)
        c = GarminClient("test@example.invalid", "offline-password")
        yield c, sdk, constructor
        c.logout()


def test_supported_login_initializes_profile_and_clears_password(client):
    c, sdk, constructor = client
    assert c.authenticate()
    constructor.assert_called_once_with(email="test@example.invalid", password="offline-password",
                                        return_on_mfa=True, retry_attempts=0)
    assert sdk.login.call_args_list[0].args == ()
    assert "tokenstore" in sdk.login.call_args_list[1].kwargs
    assert c.authenticated
    assert sdk.password is None


def test_mfa_waits_for_verification_on_same_session(client):
    c, sdk, _ = client
    sdk.login.return_value = ("needs_mfa", None)
    assert not c.authenticate()
    assert c.needs_mfa
    assert not c.authenticated
    sdk.resume_login.return_value = (None, None)
    assert c.complete_mfa("123456")
    sdk.resume_login.assert_called_once_with({}, "123456")
    assert c.authenticated and not c.needs_mfa


def test_login_error_never_displays_exception_body(client, caplog):
    c, sdk, _ = client
    sdk.login.side_effect = GarminConnectConnectionError("secret-token personal-health-response")
    assert not c.authenticate()
    assert "security challenge" in c.error_message
    assert "secret-token" not in c.error_message + caplog.text


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE", "post"])
def test_guard_blocks_account_writes_before_transport(method):
    sdk = ReadOnlySDKClient()
    with patch.object(SDKClient, "_run_request") as transport:
        with pytest.raises(PermissionError, match="read-only"):
            sdk._run_request(method, "/activity-service/activity/123")
        transport.assert_not_called()


def test_guard_allows_read_requests():
    sdk = ReadOnlySDKClient()
    with patch.object(SDKClient, "_run_request", return_value="read-result") as transport:
        assert sdk._run_request("GET", "/userprofile-service/socialProfile") == "read-result"
        transport.assert_called_once()


def test_managed_proxy_uses_requests_without_disabling_tls(monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy:8080")
    sdk = ReadOnlySDKClient()
    assert sdk.skip_strategies == {"mobile+cffi", "widget+cffi", "portal+cffi"}
    with patch("garmin_client.requests.post") as transport:
        sdk._http_post("https://diauth.garmin.com/di-oauth2-service/oauth/token")
        transport.assert_called_once_with(
            "https://diauth.garmin.com/di-oauth2-service/oauth/token", timeout=30
        )


@pytest.mark.parametrize("method", ["post", "put", "delete"])
def test_sdk_convenience_mutations_are_guarded(method):
    sdk = ReadOnlySDKClient()
    with patch.object(sdk._api_session, "request") as transport:
        with pytest.raises(PermissionError):
            getattr(sdk, method)("connectapi", "/activity-service/activity/123")
        transport.assert_not_called()


def test_current_sdk_data_shapes_and_units(client):
    c, sdk, _ = client
    date = "2026-10-01"
    sdk.get_sleep_data.return_value = {"dailySleepDTO": {
        "sleepTimeSeconds": 28800, "remSleepSeconds": 5400,
        "sleepScores": {"overall": {"value": 90}}
    }}
    sleep = c.fetch_sleep_data(date)
    assert sleep["sleep_duration_hours"] == 8
    assert sleep["sleep_score"] == 90
    assert sleep["rem_sleep"] == 90
    sdk.get_hrv_data.return_value = {"hrvSummary": {"lastNightAvg": 45, "weeklyAvg": 44}}
    assert c.fetch_hrv_data(date)["hrv_value"] == 45
    sdk.get_heart_rates.return_value = {"restingHeartRate": 55}
    assert c.fetch_rhr_data(date)["resting_hr"] == 55
    sdk.get_stress_data.return_value = {"avgStressLevel": 25}
    sdk.get_body_battery.return_value = [{"bodyBatteryValuesArray": [[0, 50], [1, 75]]}]
    assert c.fetch_stress_data(date)["body_battery"] == 75
    assert c.fetch_stress_data(date)["stress"] == 25
    sdk.get_activities_by_date.return_value = [{
        "activityId": 123, "activityType": {"typeKey": "running"},
        "startTimeLocal": date + " 08:00:00", "distance": 500, "duration": 180
    }]
    activity = c.fetch_activities("road", (date, date))[0]
    assert activity["date"] == date
    assert activity["distance_km"] == .5
    assert activity["duration_minutes"] == 3
    sdk.get_activities_by_date.assert_called_once_with(date, date)


def test_ui_mfa_continuation(monkeypatch):
    monkeypatch.setenv("GARMIN_USERNAME", "offline-user")
    monkeypatch.setenv("GARMIN_PASSWORD", "offline-password")
    mock = MagicMock()
    mock.needs_mfa = True
    mock.complete_mfa.return_value = True
    with patch("garmin_client.get_client", return_value=mock):
        app = AppTest.from_file(Path(__file__).resolve().parents[1] / "app.py").run()
        next(b for b in app.button if "Connect to Garmin" in b.label).click().run()
        assert not app.exception
        next(field for field in app.text_input if field.label == "Garmin verification code").input("123456").run()
        next(b for b in app.button if b.label == "Verify Garmin login").click().run()
        assert not app.exception
        mock.complete_mfa.assert_called_once_with("123456")
        assert app.session_state.garmin_client is mock


def test_disconnect_does_not_call_remote_logout(client):
    c, sdk, _ = client
    # The fixture also disconnects; disconnect is idempotent.
    c.logout()
    sdk.logout.assert_not_called()
    assert not c.session_dir.exists()


def test_ui_connect_refresh_and_disconnect_without_real_account(monkeypatch):
    monkeypatch.setenv("GARMIN_USERNAME", "offline-username-secret")
    monkeypatch.setenv("GARMIN_PASSWORD", "offline-password-secret")
    from tests.conftest import build_well_rested_28_day_dataset
    mock = MagicMock()
    mock.needs_mfa = False
    mock.get_full_28_day_dataset.return_value = build_well_rested_28_day_dataset()
    with patch("garmin_client.get_client", return_value=mock) as factory:
        app = AppTest.from_file(Path(__file__).resolve().parents[1] / "app.py").run()
        assert all(field.value == "" for field in app.text_input)
        next(b for b in app.button if "Connect to Garmin" in b.label).click().run()
        factory.assert_called_once_with("offline-username-secret", "offline-password-secret")
        assert not app.exception
        next(b for b in app.button if "Refresh Data" in b.label).click().run()
        assert not app.exception
        assert any("PUSH" in str(m.value) for m in app.markdown)
        next(b for b in app.button if "Logout" in b.label).click().run()
        mock.logout.assert_called_once()
        assert not app.exception
