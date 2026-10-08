#!/usr/bin/env python3
"""Explicit session logging and evidence aggregation; Python standard library only."""
import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import uuid


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp requires a timezone")
    return parsed.astimezone(timezone.utc)


def load_config(path):
    path = path.resolve()
    config = json.loads(path.read_text())
    if not isinstance(config.get("project"), str) or config["project"] in ("", "<update-me>"):
        raise ValueError("set project in harness-config.json")
    for key in ("max_age_days", "minimum_sessions"):
        if type(config[key]) is not int or config[key] < 1:
            raise ValueError(f"{key} must be a positive integer")
    for key in ("session_persistence_dir", "audit_output_dir"):
        value = Path(config[key])
        if value.is_absolute() or ".." in value.parts or not value.parts:
            raise ValueError(f"{key} must be a relative project path")
        resolved = (path.parent / value).resolve()
        if not resolved.is_relative_to(path.parent):
            raise ValueError(f"{key} escapes project through a symlink")
        config[key] = resolved
    if config["session_persistence_dir"] == config["audit_output_dir"]:
        raise ValueError("reports must be separate from session evidence")
    return config


def collect(config, now):
    root = config["session_persistence_dir"]
    if not root.is_dir():
        raise ValueError(f"session directory missing: {root}")
    grouped = defaultdict(lambda: {"sessions": set(), "evidence": []})
    warnings = []
    cutoff = now - timedelta(days=config["max_age_days"])
    for path in sorted(root.glob("*.jsonl")):
        if path.is_symlink():
            warnings.append(f"{path.name}: symlink skipped")
            continue
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            source = f"{path.name}:{number}"
            try:
                record = json.loads(line)
                if not isinstance(record, dict):
                    raise ValueError("record must be an object")
                # Legacy generated audits lack kind; exclude by both filename and agent.
                if (record.get("kind", "session") != "session" or
                        "audit-log" in path.name or "daily-audit" in path.name or
                        record.get("agent_version", "").startswith(("daily-audit", "automation"))):
                    continue
                date = timestamp(record["timestamp"])
                session = record["session_id"]
                insights = record.get("workflow_insights", [])
                if not isinstance(session, str) or not session.strip():
                    raise ValueError("session_id must be nonempty")
                if not isinstance(insights, list) or any(not isinstance(i, str) for i in insights):
                    raise ValueError("workflow_insights must be a list of strings")
                if not cutoff <= date <= now:
                    continue
                for insight in dict.fromkeys(i.strip() for i in insights if i.strip()):
                    entry = grouped[insight]
                    entry["sessions"].add(session)
                    entry["evidence"].append({"source": source, "session_id": session, "timestamp": record["timestamp"]})
                for reference in record.get("references_prior_sessions", []):
                    if not isinstance(reference, str) or not (root / reference).resolve().is_relative_to(root) or not (root / reference).is_file():
                        warnings.append(f"{source}: unresolved reference {reference!r}")
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                warnings.append(f"{source}: {error}")
    findings = [{"insight": insight, "session_count": len(entry["sessions"]),
                 "recurring": len(entry["sessions"]) >= config["minimum_sessions"],
                 "evidence": entry["evidence"]} for insight, entry in sorted(grouped.items())]
    return {"kind": "audit", "timestamp": now.isoformat(), "project": config["project"],
            "findings": findings, "warnings": warnings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("harness-config.json"))
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check")
    log = sub.add_parser("log")
    log.add_argument("--record", type=Path, required=True)
    audit = sub.add_parser("audit")
    audit.add_argument("--write", action="store_true", help="save a separate report; default is read-only")
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        now = datetime.now(timezone.utc)
        if args.command == "check":
            print(json.dumps({k: str(v) if isinstance(v, Path) else v for k, v in config.items()}, indent=2))
        elif args.command == "log":
            record = json.loads(args.record.read_text())
            if not isinstance(record, dict) or not isinstance(record.get("session_id"), str) or not record["session_id"].strip():
                raise ValueError("record requires nonempty session_id")
            for field in ("workflow_insights", "changes_made", "validation", "references_prior_sessions"):
                if not isinstance(record.get(field, []), list) or any(not isinstance(v, str) for v in record.get(field, [])):
                    raise ValueError(f"{field} must be a list of strings")
            record["timestamp"] = timestamp(record.get("timestamp", now.isoformat())).isoformat()
            record["kind"] = "session"
            record["project"] = config["project"]
            root = config["session_persistence_dir"]
            root.mkdir(parents=True, exist_ok=True)
            # Exclusive files avoid overwrite and concurrent append corruption.
            destination = root / f"{now:%Y-%m-%d}-{uuid.uuid4().hex}.jsonl"
            with destination.open("x") as output:
                output.write(json.dumps(record) + "\n")
            print(destination)
        else:
            report = collect(config, now)
            if args.write:
                root = config["audit_output_dir"]
                root.mkdir(parents=True, exist_ok=True)
                destination = root / f"{now:%Y-%m-%d}-{uuid.uuid4().hex}.json"
                with destination.open("x") as output:
                    json.dump(report, output, indent=2)
                print(destination)
            else:
                print(json.dumps(report, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Harness error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
