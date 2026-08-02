# PORTAL-B1-FIVE-SERVICES-TERMINAL-VISIBILITY-MINIMAL-FIX-34 — Report

Mode: **MINIMAL SOURCE-ONLY IMPLEMENTATION** (no production/staging apply, no RPC,
no Gate25 activation, no deploy/publish, no edit of PR #274)

Branch: `fix/b1-five-services-terminal-visibility-fail-closed-34`
Base: `origin/main` @ `3b743d72`

## Decision

`PASS_B1_FIVE_SERVICES_TERMINAL_VISIBILITY_MINIMAL_FIX_READY_FOR_REVIEW`

## 1. Changed files

| File | Change |
|---|---|
| `supabase/migrations/20260802070000_b1_34_five_services_terminal_visibility_false.sql` | new forward-only migration after head `20260801021541` |
| `tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | source contract: terminal writer must leave the five hidden |
| `scripts/b1-five-services-terminal-visibility-34-pg17/*` | disposable PostgreSQL 17 harness (schema/seed/replay/verify/run) |
| `docs/B1-FIVE-SERVICES-TERMINAL-VISIBILITY-MINIMAL-FIX-34-REPORT.md` | this report |

## 2. Reproduction — migrations that terminally set the five codes to true

Ordered writers of `request_types.student_visible` for the five canonical codes
(`enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`,
`file_withdrawal`):

| Order | Migration | Effect |
|---|---|---|
| 1 | `20260727071910_08128c70-f087-4b24-a3d1-67aeca8941e7.sql` | `SET student_visible = true` for the five |
| 2 | `20260727081838_7b86bc78-d7ee-4c3d-892e-f9a093dfe795.sql` | `SET student_visible = false` for the five |
| 3 | `20260727114316_f533371f-4fed-414a-bac3-45b75551cfaa.sql` | `SET student_visible = false WHERE student_visible = true` |
| 4 | `20260727114619_87548ebe-1280-45ae-95a7-f9043382ce97.sql` | `SET student_visible = true WHERE student_visible = false` |
| 5 | `20260727115111_8609ac67-5638-44f5-9c4c-45e389c3ba3a.sql` | **`SET student_visible = true` (terminal true writer)** |

Later migrations (`20260730175527`, `20260731203030`, `20260801021541`) only
**assert** the five remain hidden; they do not correct the terminal true state left by
`20260727115111`. On an ordered replay of the visibility mutation chain without B1-34,
all five end `student_visible=true`.

## 3. Fix migration contract

`20260802070000_b1_34_five_services_terminal_visibility_false.sql`:

- targets exactly the five codes (explicit `IN (...)` lists)
- requires `count(*) = 5` and `count(DISTINCT code) = 5`
- fail-closed: `B1_34_TARGET_COUNT_MISMATCH`, `B1_34_MISSING_TARGET_CODE`,
  `B1_34_DUPLICATE_TARGET_CODE`, `B1_34_UPDATE_COUNT_MISMATCH`,
  `B1_34_POSTCHECK_VISIBLE_REMAINS`
- updates **only** `student_visible = false` and `updated_at = now()`
- no `EXCEPTION WHEN` handler (atomic with the runner transaction)
- idempotent: second apply still matches five rows and leaves them false
- does not touch the certificate request type, unrelated types, `is_active`,
  workflows, or Gate25

## 4. Disposable PostgreSQL 17 verification

Command:

`powershell -File scripts/b1-five-services-terminal-visibility-34-pg17/04-run.ps1`

Environment: Docker `postgres:17` → **17.10**, container removed after run.

| Check | Result |
|---|---|
| Ordered visibility history ends true before fix | PASS (`REPRO` assertion) |
| After B1-34, all five false | PASS |
| Certificate request type unchanged | PASS |
| Unrelated request types unchanged | PASS |
| Second apply safe | PASS |
| Missing target fail-closed | PASS (`B1_34_TARGET_COUNT_MISMATCH`) |
| Duplicate target fail-closed | PASS (`B1_34_TARGET_COUNT_MISMATCH`) |
| Partial failure rolls back | PASS |
| Final banner | `PASS_B1_34_TERMINAL_VISIBILITY_PG17` |

## 5. Tests and build

| Command | Result |
|---|---|
| `bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | 4/4 PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | 201/201 PASS |
| `bun test tests/student-requests` | 1064/1064 PASS |
| `bun test --timeout 30000` | 2406/2406 PASS |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

Note: a single unrelated import template test timed out once under default 5s full-suite
load; it passes in isolation and under `--timeout 30000`. Not caused by this change.

## 6. Assumptions

- Source migration head before this fix is `20260801021541`.
- The five canonical `request_types.code` rows exist as exactly one row each when the
  new migration runs (fail-closed otherwise).
- Production/staging apply of this migration is a separate authorized gate (out of scope).

## 7. Risks

- Applying on an environment missing any of the five codes will abort (intentional).
- Re-apply bumps `updated_at` on the five rows even when already false (visibility
  outcome remains idempotent).
- Does not rewrite historical migrations that set true; relies on the new terminal
  forward migration + source contract test.

## 8. Blockers / obstacles

None for source review. Production apply is intentionally not performed.

## 9. Production impact

**None in this mission.** Source-only. No production connection, no migration apply,
no RPC, no activation, no deploy/publish.

## 10. Forbidden actions confirmed

- No production/staging access or apply
- No Gate25 activation
- No edit of PR #274
- No merge to main
- No cleanup / backfill / delete of existing requests
