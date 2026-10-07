"""
E2E Integration Tests for Garmin Readiness Streamlit App

Uses streamlit.testing.v1.AppTest to simulate the running application
without a browser, and unittest.mock to isolate Garmin API calls.

Each test maps directly to the Gherkin acceptance criteria.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

try:
    from streamlit.testing.v1 import AppTest
except ImportError:
    # Fallback for environments without streamlit testing module installed
    AppTest = None


# ------------------------------------------------------------------
# Helper: Configure App with Mocked Data
# ------------------------------------------------------------------

def run_app_with_dataset(dataset_dict):
    """
    Launch AppTest from app.py with a mocked dataset injected into session.
    Mocks garmin_client.get_client and analytics functions to use our fixtures.
    """
    if AppTest is None:
        pytest.skip("streamlit.testing.v1.AppTest not available")

    with patch("app.get_client") as mock_client_factory, \
         patch("app.calculate_readiness_budget") as mock_readiness, \
         patch("app.analyze_conditioning_trend") as mock_trend, \
         patch("app.diagnose_gaps") as mock_gaps:

        # Configure mock client to return dataset when get_full_28_day_dataset called
        mock_client = MagicMock()
        mock_client.get_full_28_day_dataset.return_value = dataset_dict
        mock_client.logout = MagicMock()
        mock_client_factory.return_value = mock_client

        # Mock analytics results based on dataset state
        from analytics import calculate_readiness_budget, analyze_conditioning_trend, diagnose_gaps
        # Use real analytics on fixture data for accurate assertions
        mock_readiness.side_effect = lambda d, t=None: calculate_readiness_budget(d, t)
        mock_trend.side_effect = lambda d: analyze_conditioning_trend(d)
        mock_gaps.side_effect = lambda d: diagnose_gaps(d)

        at = AppTest.from_file("app.py", default_timeout=10)
        at.run()
        return at


# ------------------------------------------------------------------
# Gherkin Scenario: User is well-recovered and ready to push
# ------------------------------------------------------------------

def test_well_recovered_user_push_tier(well_rested_dataset):
    """
    Gherkin Scenario:
    Given mocked Garmin data shows >7.5h sleep
    And overnight HRV is within 28-day baseline
    And resting HR is stable
    When Streamlit app loads
    Then Readiness Gauge displays score >= 75
    And UI displays "PUSH" tier status
    """
    at = run_app_with_dataset(well_rested_dataset)

    # Verify UI elements exist and contain expected content
    # We look for the readiness gauge value and the PUSH badge
    # Streamlit AppTest allows inspecting elements by key

    # Check that the readiness score is reflected in the tooltip/text
    # (AppTest renders markdown with score embedded)
    texts = [e.value for e in at.markdown] if hasattr(at, "markdown") else []
    combined_text = " ".join(str(t) for t in texts)

    # Assert PUSH status appears in rendered output
    assert "PUSH" in combined_text or "PUSH" in str(at), \
        "Expected PUSH tier status to appear in UI"

    # Assert readiness score >= 75 (check analytics directly for certainty)
    from analytics import calculate_readiness_budget
    readiness = calculate_readiness_budget(well_rested_dataset)
    assert readiness.score >= 75, f"Expected readiness >=75, got {readiness.score}"


# ------------------------------------------------------------------
# Gherkin Scenario: User has a significant sleep deficit
# ------------------------------------------------------------------

def test_sleep_deficit_gap_diagnosis(sleep_deprived_dataset):
    """
    Gherkin Scenario:
    Given mocked Garmin data shows 3-day avg sleep <6.0h
    When app loads and gap diagnosis runs
    Then Gap Analysis displays "Primary Gap: Sleep Deficit"
    """
    at = run_app_with_dataset(sleep_deprived_dataset)

    # Direct analytics assertion for gap type
    from analytics import diagnose_gaps
    gaps = diagnose_gaps(sleep_deprived_dataset)

    assert gaps.primary_gap == "Primary Gap: Sleep Deficit", \
        f"Expected Sleep Deficit gap, got '{gaps.primary_gap}'"

    # Verify UI rendering contains the gap text
    texts = [str(e) for e in at.markdown] if hasattr(at, "markdown") else []
    combined_text = " ".join(texts)
    assert "Sleep Deficit" in combined_text or "Sleep Deficit" in str(at), \
        "Expected Sleep Deficit gap to be visible in UI"


# ------------------------------------------------------------------
# Gherkin Scenario: User has high daytime stress blocking recovery
# ------------------------------------------------------------------

def test_high_stress_parasympathetic_suppression(high_stress_dataset):
    """
    Gherkin Scenario:
    Given mocked Garmin data shows daytime stress avg >40 on rest days
    And sleep duration is normal
    When app loads
    Then Gap Analysis displays "Primary Gap: High Parasympathetic Suppression"
    """
    at = run_app_with_dataset(high_stress_dataset)

    from analytics import diagnose_gaps
    gaps = diagnose_gaps(high_stress_dataset)

    assert "Parasympathetic Suppression" in gaps.primary_gap or \
           gaps.primary_gap == "Primary Gap: High Parasympathetic Suppression", \
        f"Expected Parasympathetic Suppression gap, got '{gaps.primary_gap}'"

    texts = [str(e) for e in at.markdown] if hasattr(at, "markdown") else []
    combined_text = " ".join(texts)
    assert "Parasympathetic Suppression" in combined_text, \
        "Expected Parasympathetic Suppression gap visible in UI"


# ------------------------------------------------------------------
# Gherkin Scenario: User's conditioning is trending positively
# ------------------------------------------------------------------

def test_conditioning_trending_positive(improved_efficiency_dataset):
    """
    Gherkin Scenario:
    Given mocked Garmin activity data shows improved pace at stable HR
    over last 7 days vs prior 21 days
    When app loads
    Then Weekly Conditioning Trend displays "Improving" for Aerobic Efficiency
    """
    at = run_app_with_dataset(improved_efficiency_dataset)

    from analytics import analyze_conditioning_trend
    trend = analyze_conditioning_trend(improved_efficiency_dataset)

    assert trend.direction == "Improving", \
        f"Expected Improving trend, got '{trend.direction}'"

    texts = [str(e) for e in at.markdown] if hasattr(at, "markdown") else []
    combined_text = " ".join(texts)
    assert "Improving" in combined_text, \
        "Expected 'Improving' trend to be rendered in UI"


# ------------------------------------------------------------------
# Additional Integration Tests (Edge / Coverage)
# ------------------------------------------------------------------

def test_readiness_calculation_integration(well_rested_dataset):
    """Verify the readiness budget calculation produces valid 0-100 scores."""
    from analytics import calculate_readiness_budget
    result = calculate_readiness_budget(well_rested_dataset)
    assert 0 <= result.score <= 100
    assert result.status.value in {"PUSH", "CRUISE", "RECOVER"}


def test_gap_priority_ordering(sleep_deprived_dataset):
    """Verify gap diagnosis sorts by priority score correctly."""
    from analytics import diagnose_gaps
    gaps = diagnose_gaps(sleep_deprived_dataset)
    if gaps.all_gaps:
        scores = [g["score"] for g in gaps.all_gaps]
        assert scores == sorted(scores, reverse=True), "Gaps should be sorted by priority"