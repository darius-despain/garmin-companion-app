#!/usr/bin/env python3
"""
Minimal standalone test runner for Garmin Readiness App E2E suite.
Runs with unittest; shared fixture builders require the development pytest dependency.
Maps to Gherkin acceptance criteria.
"""

import unittest
from unittest.mock import patch, MagicMock
import sys, os

# Ensure project root is on Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class GarminE2EAcceptanceTests(unittest.TestCase):
    """Maps Gherkin scenarios to Python assertions."""

    def setUp(self):
        from analytics import calculate_readiness_budget, diagnose_gaps, analyze_conditioning_trend
        self.calculate_readiness = calculate_readiness_budget
        self.diagnose_gaps = diagnose_gaps
        self.analyze_trend = analyze_conditioning_trend

    # ------------------------------------------------------------------
    # Gherkin: User is well-recovered and ready to push
    # ------------------------------------------------------------------
    def test_well_recovered_user_push_tier(self):
        from tests.conftest import build_well_rested_28_day_dataset
        dataset = build_well_rested_28_day_dataset()
        result = self.calculate_readiness(dataset)
        self.assertGreaterEqual(
            result.score, 75,
            f"Expected readiness >=75 for well-rested user, got {result.score}"
        )
        self.assertEqual(
            result.status.value, "PUSH",
            f"Expected PUSH tier for well-rested user, got {result.status.value}"
        )

    # ------------------------------------------------------------------
    # Gherkin: User has a significant sleep deficit
    # ------------------------------------------------------------------
    def test_significant_sleep_deficit_gap(self):
        from tests.conftest import build_sleep_deprived_28_day_dataset
        dataset = build_sleep_deprived_28_day_dataset()
        gaps = self.diagnose_gaps(dataset)
        self.assertIn(
            "Sleep Deficit", gaps.primary_gap,
            f"Expected 'Sleep Deficit' in primary gap, got '{gaps.primary_gap}'"
        )

    # ------------------------------------------------------------------
    # Gherkin: User has high daytime stress blocking recovery
    # ------------------------------------------------------------------
    def test_high_daytime_stress_gap(self):
        from tests.conftest import build_high_stress_28_day_dataset
        dataset = build_high_stress_28_day_dataset()
        gaps = self.diagnose_gaps(dataset)
        self.assertIn(
            "Parasympathetic Suppression", gaps.primary_gap,
            f"Expected 'Parasympathetic Suppression' in gap, got '{gaps.primary_gap}'"
        )

    # ------------------------------------------------------------------
    # Gherkin: User's conditioning is trending positively
    # ------------------------------------------------------------------
    def test_conditioning_trending_positively(self):
        from tests.conftest import build_improved_efficiency_28_day_dataset
        dataset = build_improved_efficiency_28_day_dataset()
        trend = self.analyze_trend(dataset)
        self.assertEqual(
            trend.direction, "Improving",
            f"Expected 'Improving' conditioning trend, got '{trend.direction}'"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
