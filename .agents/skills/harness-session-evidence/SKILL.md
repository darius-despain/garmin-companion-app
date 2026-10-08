---
name: harness-session-evidence
description: Save or inspect sanitized project session journals for cross-session handoffs and harness audits. Use when recording development outcomes, resuming from logs, or checking the evidence behind a proposed workflow change.
---

# Session evidence

Keep a concise record of what happened and what was verified, sufficient for another session to continue. Use the project's configured journal; do not create a global archive or copy raw chat histories by default.

## Inspect existing evidence

Find `harness-config.json` in the intended project and use the supplied CLI's `check` command to resolve paths. Read relevant records and their referenced sources. A report or summary establishes what was reported, not that the underlying operation succeeded. Verify current filesystem and runtime state when resuming work.

If configuration or source records are absent, say what is missing. Configure persistence only when that is in scope; otherwise report that no journal was saved. Do not repurpose a different project's journal because it happens to exist.

## Save a record

Prepare a temporary JSON object containing:

- `session_id`: the actual chat ID or a stable unique ID for this work session.
- `workflow_insights`: directly observed lessons from this session; exclude inherited proposals and generated report text.
- `changes_made`: actual edits or actions, with affected paths.
- `validation`: performed checks and results, including failures or unverified flows.
- `blockers`: unresolved dependencies and the next concrete action.
- `references_prior_sessions`: existing filenames in this journal only. Put external chat/turn IDs or file/line citations in a separate `source_references` field.

An optional `timestamp` must be timezone-aware ISO 8601; the CLI otherwise supplies current UTC time. Never include passwords, tokens, device codes, raw environment contents, sensitive personal details, or private transcript dumps.

From the project root, run:

```bash
python3 harness/audit.py --config harness-config.json log --record path/to/session-record.json
```

Check the command result and the newly written file before claiming persistence. Preserve existing journals; the logger writes a new exclusive JSONL file. Session logs and generated reports are ignored by Git by default. Keep shareable, sanitized change rationale in tracked documentation when needed.

## Review patterns

Use `audit` for read-only aggregation, or `audit --write` when saving a separate report is requested. Report findings with source filename and line number. Count distinct sessions, exclude generated audits, and distinguish demonstrated failures from unverified suggestions. Logging records evidence; it does not itself implement improvements or schedule future work.
