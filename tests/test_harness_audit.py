import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone

SCRIPT = Path(__file__).resolve().parents[1] / "harness" / "audit.py"
spec = importlib.util.spec_from_file_location("audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "harness-config.json"
        self.config = {"project": "fixture", "session_persistence_dir": "conversations",
                       "audit_output_dir": "harness/reports", "max_age_days": 30, "minimum_sessions": 2}
        self.path.write_text(json.dumps(self.config))
        (self.root / "conversations").mkdir()
        self.now = datetime(2026, 10, 6, tzinfo=timezone.utc)

    def record(self, session="one", **extra):
        return dict(timestamp="2026-10-05T12:00:00Z", session_id=session,
                    workflow_insights=["Use config paths"], **extra)

    def write(self, name, records):
        (self.root / "conversations" / name).write_text("\n".join(json.dumps(r) for r in records))

    def report(self):
        return audit.collect(audit.load_config(self.path), self.now)

    def test_independent_sessions_and_duplicate_entries(self):
        self.write("sessions.jsonl", [self.record(), self.record()])
        finding = self.report()["findings"][0]
        self.assertEqual(finding["session_count"], 1)
        self.assertFalse(finding["recurring"])
        self.write("second.jsonl", [self.record("two")])
        self.assertTrue(self.report()["findings"][0]["recurring"])
        self.assertIn("sessions.jsonl:1", [e["source"] for e in self.report()["findings"][0]["evidence"]])

    def test_generated_records_do_not_feed_back(self):
        self.write("sessions.jsonl", [self.record()])
        self.write("report.jsonl", [self.record("two", kind="audit"), self.record("three", agent_version="automation-v1")])
        self.write("daily-audit-log.jsonl", [self.record("four")])
        self.assertEqual(self.report()["findings"][0]["session_count"], 1)

    def test_dates_use_record_not_filename(self):
        old = self.record("old")
        old["timestamp"] = "2026-08-01T00:00:00Z"
        future = self.record("future")
        future["timestamp"] = "2026-12-01T00:00:00Z"
        self.write("2000-01-01.jsonl", [self.record(), old, future])
        self.assertEqual(self.report()["findings"][0]["session_count"], 1)

    def test_malformed_and_missing_references_are_visible(self):
        bad = self.record("bad")
        bad["timestamp"] = "2026-09-29-035304-session-audit"
        self.write("mixed.jsonl", [self.record(references_prior_sessions=["lost.jsonl"]), bad, []])
        with (self.root / "conversations" / "mixed.jsonl").open("a") as output:
            output.write("\nnot-json\n")
        self.assertEqual(len(self.report()["warnings"]), 4)
        self.assertEqual(len(self.report()["findings"]), 1)

    def test_path_boundaries_and_symlinks(self):
        for value in ("../outside", "/tmp/outside"):
            self.config["session_persistence_dir"] = value
            self.path.write_text(json.dumps(self.config))
            with self.assertRaises(ValueError):
                audit.load_config(self.path)
        (self.root / "escape").symlink_to(self.root.parent, target_is_directory=True)
        self.config["session_persistence_dir"] = "escape"
        self.path.write_text(json.dumps(self.config))
        with self.assertRaises(ValueError):
            audit.load_config(self.path)

    def test_missing_directory_fails(self):
        self.config["session_persistence_dir"] = "missing"
        self.path.write_text(json.dumps(self.config))
        with self.assertRaises(ValueError):
            self.report()

    def test_cli_roundtrip_and_readonly_default(self):
        record = self.root / "record.json"
        record.write_text(json.dumps(self.record()))
        base = [sys.executable, str(SCRIPT), "--config", str(self.path)]
        for _ in range(2):
            subprocess.run(base + ["log", "--record", str(record)], check=True, capture_output=True)
        self.assertEqual(len(list((self.root / "conversations").glob("*.jsonl"))), 2)
        subprocess.run(base + ["audit"], check=True, capture_output=True)
        self.assertFalse((self.root / "harness/reports").exists())
        subprocess.run(base + ["audit", "--write"], check=True, capture_output=True)
        self.assertEqual(len(list((self.root / "harness/reports").glob("*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
