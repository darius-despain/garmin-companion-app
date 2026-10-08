# Garmin login checkpoint

This checkpoint is saved on `fix/garmin-readonly-login`, based on main commit
`05e3e03365fe740bb3e013213bb0bbaa13d05ff4`. It is a resumable checkpoint, not a
claim that live Garmin connectivity works. Follow `AGENTS.md` and the referenced
development-loop skill before continuing.

## Implemented

- Pinned `garminconnect==0.3.17`, which was missing from the dependency manifest.
- Credentials now go into the SDK constructor; `login()` uses its supported
  signature. Successful login initializes the profile through the supported
  in-memory tokenstore interface. MFA continues on the same SDK session.
- Injected credentials stay on the server rather than appearing as widget defaults.
  Login errors expose safe categories rather than raw SDK exceptions.
- `ReadOnlySDKClient` rejects account API methods other than GET/HEAD. Authentication
  and refresh use separate allowed auth transports. Disconnect clears local state
  without calling remote logout/revocation. This guard does not reduce the Garmin
  password's underlying account privileges.
- Managed HTTPS-proxy sessions use requests-based SDK strategies to avoid repeated
  browser-fingerprint transport timeouts. Proxy and TLS verification remain enabled.
- Corrected current SDK methods and response parsing for sleep, HRV, heart rate,
  stress/body battery, date-filtered activities, and distance/duration units.
- Sessions stay in memory. SQLite initialization uses a private temporary directory;
  disconnect removes it. Health-response caching/offline persistence is not implemented.
- Fixed the dashboard's hexadecimal sparkline fill color.
- Repaired missing pytest fixtures and AppTest setup/content assertions. Added login,
  MFA, credential hiding, read-only, data-shape, proxy, and UI-flow regression tests.

## Validation evidence

- Full offline suite: **27 application tests passed** in the earlier checkpoint, no skipped tests in the validated run.
- `pip check`: no broken requirements. `git diff --check`: passed.
- Mocked Connect → Refresh → Dashboard → Disconnect and MFA UI flows pass.
- Streamlit server startup succeeds; its internal health endpoint returns `ok`.
- Live app Connect was exercised with securely injected credential bindings:
  no UI exception, no secret defaults in widgets, authentication unsuccessful,
  sanitized security-challenge message shown, no MFA prompt reached.
- Garmin SSO mobile/portal/embed checks returned **HTTP 403 with Cloudflare challenge
  content** from this cloud network. The earlier default SDK strategy chain also
  exceeded the AppTest timeout before proxy strategy selection was corrected.
- No successful real-account login or health/activity retrieval was established.
  Do not repeat unchanged login attempts or report the real integration as ready.

## Environment and delivery

Checkout: `/workspace/garmin-companion-app`. Prepared interpreter:
`/workspace/.venvs/garmin-companion-app/bin/python` (Python 3.12).
Secrets are supplied through environment settings as `GARMIN_USERNAME` and
`GARMIN_PASSWORD`; never copy their values into files or chat.

Prior environment configuration saves include installation and startup instructions
and Garmin-scoped credential requirements. Draft saving is separate from runtime
application and publication; do not assume the latest draft is published.
No merge into main is part of this checkpoint. Check the actual branch/upstream
and Git status when resuming rather than trusting the name alone.

## Outstanding work

1. **Live connectivity:** use an authorized network Garmin accepts, then verify a
   minimal login and read request through the app. MFA may be needed. The cloud
   security challenge is an external blocker; successful mocks do not resolve it.
2. **Harness installed:** the owner supplied `https://github.com/darius-despain/agentic-harness`.
   Imported its CLI, three packaged skills with UI metadata, merged agent rules, and
   audit tests from commit `f3d4db307f67dac028314692d7fd6aac883ee354`. Local configuration
   and journals are ignored; the project config template, tooling, skills, and this
   handoff are committed. No automatic chat capture or scheduler is installed.
3. **Future validation improvements:** mock success tests cross the UI and client
   separately, not a complete real-server path. Real data shapes remain unverified
   against this account. Add targeted failure/transport cases as those areas change.
4. **CI:** this repository has no CI workflow yet. The local skill records the normal
   check commands and definition of done; CI automation is a separate improvement.

Next features that can be developed offline may proceed after this checkpoint is
reviewed. Features requiring real Garmin behavior remain gated on live validation.

## Commit/push preparation findings

A fresh test process exposed randomized fixture behavior: resting heart rate used
Python's process-randomized `hash(date)`, making the supposedly well-recovered case
occasionally fall below the PUSH threshold. The fixture now uses fixed baseline
values and a deterministic current value; the standalone assertion matches the
75-point acceptance criterion. This was a test-data defect, not evidence that live
Garmin login works. Validate multiple hash seeds before delivery.

The owner's delivery request authorizes committing all intentional source/docs/tests
and pushing the fix branch to origin without merging main. Generated Python caches
are disposable. Private harness config/journals remain intentionally ignored in
accordance with the imported harness; shared handoff context is in this tracked file.

## Final checkpoint validation

After harness integration and the deterministic fixture correction, the full suite
passes **34 tests** (27 application/regression cases and 7 harness cases), with no
skips. Application tests also pass under an alternate explicit Python hash seed.
The harness configuration check and Git whitespace check pass. Previous live
Garmin results remain a recorded external blocker; live login was not retried during
checkpoint delivery. The copied harness code and packaged skills retain their
upstream contents; only the project config template's project name was adapted.

Private journal/config retention is intentional and Git-ignored. On a fresh clone,
copy `harness-config-template.json` to `harness-config.json` and check the config.
The committed handoff is the durable, shareable session context even when ignored
journals do not travel with Git. Delivery uses a normal branch push, with no merge,
force push, scheduler, or automatic chat capture.
