---
name: harness-development-loop
description: Iterate on a software change through implementation, focused verification, failure diagnosis, and session evidence. Use for building, fixing, or continuing development in projects using this harness.
---

# Development loop

Carry the user's requested behavior to a verified result. Keep the loop scoped to that behavior; a passing syntax check or running server alone is not completion.

## Establish the target

Read applicable project instructions, inspect the actual checkout and existing changes, and identify the acceptance condition from the request. Consult relevant recent session evidence for unresolved blockers and prior verification; confirm it against current files before relying on it. Use the project's existing tooling and tests.

If a requirement is unclear, proceed with independent work and ask only for information that materially affects the result. Keep the original objective when a later message adds constraints or asks for status.

## Implement, verify, diagnose, repeat

1. Make the smallest coherent change that satisfies the target. Preserve unrelated work. Inspect setup commands for destructive side effects before executing them.
2. Run focused verification appropriate to the changed behavior. For a regression, reproduce the failure and add a meaningful test when warranted. For a UI or integration flow, exercise the relevant interaction when tools and credentials permit; report the limit if it cannot be exercised.
3. If verification fails, classify the cause: changed code, pre-existing behavior, environment, credentials, or an external dependency. Use the failure output to choose the next action. Change one coherent cause and rerun the affected checks.
4. Repeat while the next step makes progress within the authorized scope. After the same unchanged blocker recurs, do not retry it blindly: complete independent work and identify the specific input or external change needed. Never loosen the acceptance condition merely to get a green check.
5. After relevant checks pass, inspect the final diff for accidental scope and complete required project checks. Broaden tests only when the change or remaining uncertainty justifies it.

## Close the loop

Report the resulting behavior, checks actually performed, and any remaining blocker. Distinguish syntax checks, tests, service health, and user-flow verification. Save a sanitized session record when the project harness is configured; use the sibling `harness-session-evidence` skill if available, otherwise follow the project's logging instructions. Include changed files and validation outcomes so a later session can resume accurately.

Commit, publish, deploy, or message another person only within the user's authorization. Do not start a scheduler or a harness self-improvement run merely because development finished; record useful observations for a later improvement cycle.
