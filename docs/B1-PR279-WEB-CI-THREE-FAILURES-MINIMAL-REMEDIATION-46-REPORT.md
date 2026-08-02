# PORTAL B1 PR #279 WEB CI THREE FAILURES MINIMAL REMEDIATION REPORT

**MISSION ID**: `PORTAL-B1-PR279-THREE-CI-FAILURES-MINIMAL-FIX-46`
**PR NUMBER**: `#279`
**BRANCH**: `fix/b1-fixture-15-forward-only-reissue-44`
**REVIEWED HEAD (pre-mission)**: `dacff05bc4c02dddad52e4163473c9dca0404abd`
**FAILED CI RUN**: `30772069807`
**FINAL OUTPUT TOKEN**: `PASS_B1_PR279_THREE_CI_FAILURES_MINIMAL_FIX_READY_FOR_GREEN_CI`

---

## 1. Executive Summary

Fixed the three confirmed Bun CI failures on PR #279 without changing Fixture-15 migration behavior, application runtime, service visibility, or `enrollment_certificate`. The disposable PG17 harness now launches Docker directly from Bun/TypeScript using `Bun.sleep` + `pg_isready` (no PowerShell). Terminal-visibility tests enforce the real ordered-replay invariant instead of requiring B1-34 to remain the final migration filename.

---

## 2. Failure 1 — Fixture-15 PG17 runner

**File**: `tests/b1-fixture-15-forward-only-reissue-44.test.ts`

**Cause**: The disposable PG17 test invoked Windows-only `powershell -File …/04-run.ps1`. On Ubuntu CI, `spawnSync("powershell", …)` fails with `status=undefined`.

**Fix**: Execute Docker directly from the Bun test, matching the proven pattern in `tests/b1-authoritative-positive-fixture-matrix-19/pg17-disposable-harness.test.ts`:

- launch `postgres:17-alpine`
- wait with `Bun.sleep` + `pg_isready`
- load/execute Fixture-15 harness SQL (`00-schema`, `01-seed`, migration in BEGIN/COMMIT, `02-verify`)
- preserve fingerprint / idempotent / fail-closed markers
- tear down in `finally` and `afterAll`
- fail with spawn error/message when Docker cannot start

Fixture-15 migration SQL is unchanged. An earlier cross-platform `04-run.mjs` helper remains in tree but is no longer required by the Bun test path.

---

## 3. Failures 2 and 3 — Terminal visibility assumptions

**File**: `tests/student-requests/b1-five-services-terminal-visibility-34.test.ts`

**Cause**: Tests required B1-34 to be the final migration file / final visibility writer. Legitimate later migrations exist (`20260802225131` false writer; Fixture-15 repair with no visibility DML).

**Fix**: Enforce:

- B1-34 exists exactly once and is after predecessor `20260801021541`
- for each of the five B1 service codes, the final ordered `student_visible` writer leaves polarity `false`
- migrations after B1-34 may exist only if they do not set any of the five to `student_visible=true`
- Fixture-15 repair is proven not to write `request_types` / `student_visible` / `is_active`
- `enrollment_certificate` remains excluded from mutation

Terminal visibility protection is not weakened.

---

## 4. Scope

### Modified / added by this mission

- `tests/b1-fixture-15-forward-only-reissue-44.test.ts`
- `tests/student-requests/b1-five-services-terminal-visibility-34.test.ts`
- `docs/B1-PR279-WEB-CI-THREE-FAILURES-MINIMAL-REMEDIATION-46-REPORT.md`

### Untouched

- `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`
- application runtime
- Fixture identities / manifest
- service visibility
- `enrollment_certificate`
- production state

---

## 5. Verification

| Command | Result |
|---|---|
| `bun test tests/b1-fixture-15-forward-only-reissue-44.test.ts` | PASS |
| `bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | PASS |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

---

## 6. Assumptions / Risks / Production impact

- **Assumptions**: Ubuntu CI has Docker for disposable PG17 (same as matrix-19). Fixture-15 migration behavior remains unchanged.
- **Risks**: Low. Test/docs only. A future migration that terminally sets any of the five `student_visible=true` still fails.
- **Production impact**: None. SOURCE-ONLY. No migrations applied. No deploy. PR remains Draft.

---

## 7. Decision

**PASS** — `PASS_B1_PR279_THREE_CI_FAILURES_MINIMAL_FIX_READY_FOR_GREEN_CI`
