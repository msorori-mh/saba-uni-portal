# PORTAL B1 PR #277 UBUNTU CI AND HARNESS FINAL REMEDIATION REPORT

**MISSION ID**: `PORTAL-B1-PR277-UBUNTU-CI-AND-HARNESS-FINAL-REMEDIATION-42`
**PR NUMBER**: `#277`
**BRANCH**: `feat/b1-positive-fixture-matrix-19-36`
**BASE HEAD (pre-fix)**: `58242aeb50aefac23d83d431c9f878329c55610c`
**CONFIRMED HOLD RESOLVED**: `HOLD_B1_PR277_REAL_PG17_HARNESS_DELTA_UBUNTU_CI_POWERSHELL_NOT_FOUND`
**INTERNAL COMPLETION TOKEN**: `PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19`
**FINAL OUTPUT TOKEN**: `PASS_B1_PR277_UBUNTU_CI_AND_HARNESS_FINAL_REMEDIATION_READY_FOR_CI`

---

## 1. Executive Summary

This mission fixed only the four confirmed blockers on the existing PR #277 branch without redesigning the package or modifying application runtime. The disposable PostgreSQL 17 harness now waits for readiness with cross-platform `Bun.sleep`, proves real stale/replay rejection after every successful Fixture RPC, and expands zero-mutation proof to row-identity plus content fingerprints across the required unrelated surfaces. `src/routeTree.gen.ts` remains identical to `origin/main` and is not part of this remediation delta.

---

## 2. Required Fixes Applied

### 2.1 Ubuntu CI compatibility

Replaced Windows-only:

`powershell -Command Start-Sleep -Milliseconds 500`

with:

`await Bun.sleep(500)`

inside an `async` Bun test. The PG17 readiness loop now runs on Windows and GitHub Ubuntu without PowerShell.

### 2.2 Generated runtime drift

`src/routeTree.gen.ts` was checked out from `origin/main`. It was already byte-identical to `origin/main` and is **not** modified or committed by this remediation.

### 2.3 Real stale-replay verification

For every successful Fixture RPC case the SQL harness now:

1. Re-invokes the same RPC with the same principal/action/arguments
2. Requires rejection (exception) or a documented idempotent success (`idempotent=true`)
3. Fails if replay returns a fresh non-idempotent success
4. Proves no second workflow event
5. Proves no second successor activation (`active` step count unchanged)
6. Proves no duplicate business effect for terminal cases 5 and 7

### 2.4 Expanded zero-mutation proof

Before and after every case, the harness captures and compares content fingerprints (count + ordered full-row `md5`) for unrelated state covering:

- `student_requests` (excluding current request)
- `student_request_workflow_steps` (excluding current request)
- `student_request_workflow_events` (excluding current request)
- payment-related rows (`student_request_fee_assessments`, `payment_receipts`)
- academic-effect rows unrelated to the shared fixture student
- document rows (`official_documents`, `enrollment_certificate_document_details`)
- notification rows (`notifications`)

`enrollment_certificate` fingerprint is captured at harness start and must remain unchanged after every case and at final verification.

### 2.5 Whitespace

Trailing whitespace removed from `docs/B1-PR277-REAL-PG17-RPC-HARNESS-REMEDIATION-40-REPORT.md`. `git diff --check` passes.

---

## 3. CI Contract

The TypeScript harness:

- launches `postgres:17-alpine`
- waits for readiness cross-platform (`Bun.sleep` + `pg_isready`)
- loads the required schema/migrations
- executes the real SQL RPC harness
- proves exactly 19 successful authoritative RPC cases
- proves wrong actor, wrong action, and stale replay rejection
- always tears down the container in `finally` / `afterAll`
- emits `PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19`

---

## 4. Verification Commands Run & Results

| Command | Result |
| :--- | :--- |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | **PASS** (14/14), token emitted |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **PASS** (201/201) |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |

---

## 5. Files Modified

- `tests/b1-authoritative-positive-fixture-matrix-19/pg17-disposable-harness.test.ts`
- `tests/b1-authoritative-positive-fixture-matrix-19/pg17-disposable-harness.sql`
- `docs/B1-PR277-REAL-PG17-RPC-HARNESS-REMEDIATION-40-REPORT.md` (trailing whitespace only)
- `docs/B1-PR277-UBUNTU-CI-AND-HARNESS-FINAL-REMEDIATION-42-REPORT.md` (this report)

**Not modified:** application runtime, migrations, authorization grants, `src/routeTree.gen.ts`, PR #276 / PR #274 packages.

---

## 6. Assumptions

- Stale replay of completed steps raises (or returns documented idempotent success) and must not create a second workflow event or successor activation.
- Unrelated academic fingerprints exclude the shared fixture student `b1e20002-...`, who may receive intentional terminal effects that are reset before compare.
- Minimal stub tables for `notifications` and `payment_receipts` are created in the disposable container when absent so content fingerprints remain evaluable.

## 7. Risks

- Low: GitHub Ubuntu CI still depends on Docker availability for `postgres:17-alpine` (same as prior harness contract).
- Low: If a future RPC begins writing global notification/payment rows during positive acts, the expanded fingerprint will correctly fail closed.

## 8. Obstacles

- None remaining for the four confirmed blockers. Local harness emitted `PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19`.

## 9. Production Impact

- **None.** SOURCE-ONLY test/docs remediation. No production access, no migration apply, no deploy/publish, no service activation, no authorization grant.

## 10. AGENTS.md Compliance

- [x] SOURCE-ONLY
- [x] Branch isolation (`feat/b1-positive-fixture-matrix-19-36`)
- [x] No production writes
- [x] `enrollment_certificate` fingerprint preserved
- [x] Required verification commands executed
- [x] No new PR created; no merge performed

---

**Decision**: **PASS**

**Final Token**: `PASS_B1_PR277_UBUNTU_CI_AND_HARNESS_FINAL_REMEDIATION_READY_FOR_CI`
