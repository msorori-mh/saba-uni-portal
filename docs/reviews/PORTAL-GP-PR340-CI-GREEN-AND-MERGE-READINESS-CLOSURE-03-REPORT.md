# PORTAL-GP-PR340-CI-GREEN-AND-MERGE-READINESS-CLOSURE-03

## Decision

**HOLD_PORTAL_GP_PR340_CI_GITHUB_ACTIONS_NO_RUNNER_ASSIGNED_SHARED_ACCOUNT**

GitHub Actions is not assigning runners to any job (`runner_id=0`, `steps=[]`, fail in 1–10s). This affects PR #340, `main`, and other branches identically since ~2026-08-10T17:17Z. Source on the feature branch is locally green; CI cannot prove GitHub green until the account/runner quota is restored.

## Identifiers

```
START_HEAD=ae73cebb7aad437526b246cca42c5dac68cda0c4
FINAL_HEAD=801de48c4f99a0b053a310027cdac68adfa2c505
ORIGIN_MAIN_SHA=140ca4ab3462e3d2a6a19551e6d5fa19d29d1cde

PR340_MERGEABLE=MERGEABLE
PR340_DRAFT=true

MIGRATION_REVIEW=FAILURE (pre-start; no runner)
WEB_CI=FAILURE (pre-start; no runner)
```

## G0 — Start state

- Branch: `feat/gp-final-closure-20260811`
- Worktree clean at start; HEAD matched `EXPECTED_START_HEAD`
- Fetched `origin/main` (moved ahead of PR base)
- No merge of PR, no production write, no migration apply

## G1 — Real GitHub failures (classified)

### Observed signature (all failing jobs)

| Field | Value |
|---|---|
| failing step | *(none — job never starts)* |
| exact error | `runner_id=0`, `runner_name=""`, `steps=[]`, no logs (`log not found`) |
| duration | ~1–10 seconds |
| labels | `ubuntu-latest` |

### Classification

| Surface | Classification |
|---|---|
| Migration Review `31441117327` / `31443424180` | **ENVIRONMENT_OR_RUNNER** + **SHARED_MAIN_CI_FAILURE** |
| Web CI `31441117343` / `31443424178` (all jobs) | **ENVIRONMENT_OR_RUNNER** + **SHARED_MAIN_CI_FAILURE** |
| Install/Lint/Typecheck/Build | ENVIRONMENT_OR_RUNNER (not SOURCE_REGRESSION) |
| Bun tests | ENVIRONMENT_OR_RUNNER (not TEST_REGRESSION) |
| PG17 verifiers (all matrix legs) | ENVIRONMENT_OR_RUNNER |
| LONGRUN-14 | ENVIRONMENT_OR_RUNNER |
| Migration Review policy scan | ENVIRONMENT_OR_RUNNER (policy scan never executed) |

Not a source/test/migration-policy failure: no step ran, no log body exists.

## G2 — PR-specific vs shared

| Evidence | Detail |
|---|---|
| Last successful Web CI | `31412819258` @ 2026-08-10T17:11:51Z — real runner (`runner_id=1000009720`, 15 steps) |
| First post-cliff failure | `31413290658` @ 2026-08-10T17:17:35Z — `runner_id=0`, 0 steps |
| Main Web CI since cliff | continuous failure with same empty-job signature (e.g. `31443007225`, `31443130371`) |
| Other feature branches | same (e.g. GA `31442068179`) |
| Private repo | `msorori-mh/saba-uni-portal` is private |

**Verdict:** shared account/environment Actions outage (most consistent with Actions minutes / spending-limit exhaustion). Not PR #340-specific.

## G3 — Base drift / merge readiness

- Pre-sync merge-base: `2834f1cdbd5a0ff4e814f37b5b6b1e463879b58d`
- Merged `origin/main` into feature branch (no force-push, no rewrite)
- Merge commit: `801de48c4f99a0b053a310027cdac68adfa2c505`
- Conflicts: none (auto-merge `types.ts`)

## G4 — Migration Review (source analysis)

PR GP migrations (no dangerous-pattern hits):

- `supabase/migrations/20260811010000_gp_identity_options_and_revision_notes_01.sql`
- `supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql`

Council migrations brought from main contain `DELETE FROM` in a DO cleanup block; after sync they match `origin/main` and should not appear as PR-only diffs against current `main` tip. Migration Review job itself never executed on GitHub due to no runner.

## G5 — Web CI (source analysis)

No source fix required for the GitHub failure mode. Local simulation of GP CI chains + bun suites passed.

## G6 — Local validation

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/graduation-projects` | PASS — 138 pass / 0 fail |
| `bun test tests/student-requests` | PASS — 1066 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| PG17 `graduation-projects-foundation` | PASS |
| PG17 `graduation-projects-lifecycle` | PASS |
| PG17 `graduation-projects-storage` | PASS |
| PG17 `graduation-projects-level4` | PASS |
| Remediation-02 disposable PG17 (via bun test) | PASS |

```
GP_TESTS=PASS
STUDENT_REQUESTS=PASS
PG17=PASS (GP CI chains + remediation-02)
TYPECHECK=PASS
BUILD=PASS
DIFF_CHECK=PASS
```

## G7 — Security non-regression

Local remediation-02 verifier notices / markers:

```
H01=CLOSED
H03=CLOSED
M01=CLOSED
M02=CLOSED
M03=CLOSED
L01=CLOSED

STALE_EVALUATION_DIRECT_RPC_NEGATIVE=PASS
PROGRAM_DEPARTMENT_NEGATIVE=PASS
IDENTITY_OPTIONS_SCOPE=PASS
COMMITTEE_COUNT_MATRIX=PASS
ARCHIVE_DETAIL=PASS
LEADER_ROLE_UI_BACKEND_PARITY=PASS

CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0
```

No admin/dean bypass introduced; L4 guard chain PASS locally; signed-download / archive-detail / committee-count contracts remain covered by existing tests.

## G8 — Commit + push

- Pushed merge commit `801de48c` to `origin/feat/gp-final-closure-20260811` (no force)
- Triggered new runs: Migration Review `31443424180`, Web CI `31443424178`
- One allowed rerun of `31443424178` — identical instant failure

## G9 — Watch result

Post-push checks failed again with the same pre-start signature. Cannot reach GREEN while GitHub does not assign runners.

## G10 — Production readiness (do not overstate)

```
PRODUCTION_MIGRATIONS=NOT_APPLIED
PRODUCTION_RPC_WRITES=0
PRODUCTION_E2E=PENDING
ACTOR_MATRIX_GATE=PENDING
```

This mission only covers SOURCE + SECURITY + CI + MERGE readiness. Production E2E is not claimed.

## ROOT_CAUSES

1. **PRIMARY (blocking):** GitHub Actions shared-account runner assignment failure since ~17:17Z 2026-08-10 (`runner_id=0` / empty steps) on private repo — affects `main` and all PRs.
2. **SECONDARY (resolved in branch):** feature branch was behind `origin/main`; merged safely for merge-readiness sync.

## FIXES

1. Merged `origin/main` into `feat/gp-final-closure-20260811` (`801de48c`).
2. Revalidated GP + student-requests + tsc + build + GP PG17 CI chains locally.
3. Pushed and rewatched CI; performed one rerun — still blocked externally.
4. **No security semantics changed to appease CI.**

## External unblock required

Account owner must restore GitHub Actions capacity (billing / included minutes / spending limit) so `ubuntu-latest` jobs receive runners. After that, re-run Web CI + Migration Review on HEAD `801de48c` (or later report tip) without source changes expected for this blocker.

## FINAL DECISION

**HOLD_PORTAL_GP_PR340_CI_GITHUB_ACTIONS_NO_RUNNER_ASSIGNED_SHARED_ACCOUNT**

NO MERGE. NO PRODUCTION WRITE. NO MIGRATION APPLY. NO DEPLOY.
