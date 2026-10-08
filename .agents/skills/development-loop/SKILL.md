---
name: development-loop
description: Develop, validate, and deliver Garmin companion changes with offline regression tests, read-only account access, and a durable handoff.
---

# Development loop

Read `AGENTS.md` and `docs/handoff.md` first. Follow the Garmin account restrictions
through implementation and validation. Use the existing checkout: cloud tasks
are isolated, so do not create a Git worktree unless the user requests it.

1. Inspect Git status and the affected code. Preserve existing work. Establish
   the requested behavior and acceptance criteria before changing implementation.
2. Use a feature/fix branch for delivery; keep `main` untouched unless the user
   explicitly authorizes work there. Do not reset, force-push, or discard user work.
3. Add meaningful offline regression coverage for changed behavior. Use mocked
   Garmin responses and Streamlit AppTest for UI flows. Exercise the real SDK
   boundary where relevant; mocked factory success alone does not verify login.
4. Implement the change, then run the relevant checks and the full repository
   suite. Fix failures or explicitly record a diagnosed external blocker.
5. For UI changes, check the affected AppTest flow and, when startup changes,
   start Streamlit and verify its local health endpoint. Do not expose a public
   listener or user-facing localhost preview during cloud work.
6. Review the diff and file inventory. Reconcile all ordinary untracked files:
   intentionally commit them or delete confirmed generated/disposable files.
   Never commit credentials, session tokens, personal health data, or `.env`.
   Do not treat Git-ignored sensitive files as safe to publish in a snapshot.
7. Update documentation and the handoff with behavior, validation evidence,
   limitations, and next actions. Commit and push when authorized. Verify the
   remote branch matches local HEAD and the working tree is clean. Do not merge
   or publish merely because a push was requested.

## Setup and checks

Python 3.11+ is required. From the repository root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt pytest==9.1.1
.venv/bin/python -m pip check
.venv/bin/python -m pytest -q -p no:cacheprovider
git diff --check
```

In the prepared cloud environment, use
`/workspace/.venvs/garmin-companion-app/bin/python` instead of `.venv/bin/python`.
The dependency manifest pins the Garmin SDK; do not upgrade it without validating
the constructor, login, MFA, transport guard, and data-shape contracts.

```bash
.venv/bin/python -m streamlit run app.py --server.address=127.0.0.1 \
  --server.port=8501 --server.headless=true --browser.gatherUsageStats=false
```

Check `http://127.0.0.1:8501/_stcore/health` internally; expect `ok`. Stop only
processes you started. Processes do not survive environment publication.

## Definition of done

- Acceptance criteria are satisfied and regressions have meaningful coverage.
- Required tests execute and pass; skipped, unrun, and externally blocked checks
  are reported separately. Never equate mocked login with real authentication.
- The changed UI flow renders without exceptions, and required startup works.
- Read-only account access and credential/privacy rules remain enforced.
- Documentation matches implementation; the handoff records outstanding work.
- The diff has been reviewed, delivery files are committed, and authorized pushes
  are verified without merging `main`.

A checkpoint may be saved with a diagnosed external blocker. It is ready to
resume, but does not satisfy an acceptance criterion requiring that integration
to work. Never label real Garmin connectivity done while live login is blocked.

## Live Garmin validation

Tests default to offline mocks. Real-account checks require user authorization,
ready secure credential bindings, and a network Garmin accepts. Use minimal
authentication/read requests through `GarminClient`; never mutate the account.
Do not print secret values, raw exceptions, MFA codes, tokens, or health responses.
Do not capture reusable account state in snapshots. Stop on rate limits or
unchanged security challenges. Preserve proxy and TLS trust; do not bypass them.

## Harness provenance

The packaged harness skills and CLI were imported from
`https://github.com/darius-despain/agentic-harness` at commit
`f3d4db307f67dac028314692d7fd6aac883ee354`. Use the packaged
`harness-development-loop` skill for implementation and this document for the
project's commands, acceptance criteria, and Garmin-specific constraints. Use
`harness-session-evidence` for journaling and `harness-improvement-loop` only for
explicit workflow improvement work. No scheduler or automatic chat capture is installed.

Copy `harness-config-template.json` to `harness-config.json` if the ignored local
configuration is absent, then run `python3 harness/audit.py --config harness-config.json check`.
Private journals live in `conversations/`; generated audits live in `harness/reports/`.
Keep a shareable summary in `docs/handoff.md`, because ignored journals are not pushed.
