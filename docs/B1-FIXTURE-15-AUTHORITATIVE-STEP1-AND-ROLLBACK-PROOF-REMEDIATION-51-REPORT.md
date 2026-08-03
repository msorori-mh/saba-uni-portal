# PORTAL B1 PR #279 AUTHORITATIVE STEP-1 KEY AND ROLLBACK PROOF REMEDIATION REPORT

**MISSION ID**: `PORTAL-B1-PR279-AUTHORITATIVE-STEP1-KEY-AND-ROLLBACK-PROOF-REMEDIATION-51`
**PR NUMBER**: `#279`
**BRANCH**: `fix/b1-fixture-15-forward-only-reissue-44`
**BASE HEAD**: `bf2c8a218417a80bc2279ea956c6d3c3e7c49206`
**FINAL OUTPUT TOKEN**: `PASS_B1_PR279_AUTHORITATIVE_STEP1_AND_ROLLBACK_PROOF_READY_FOR_REVIEW`

---

## 1. Executive Summary

Corrected the Fixture-15 seven-step contract so runtime step `f1300001-0000-4000-8000-000015000001` uses the authoritative key `student_affairs_intake` (not the incorrect `student_affairs_reception`). Strengthened migration postconditions and drift rollback proofs with complete seven-row fingerprints so rejected applies leave zero evidence and no partial mutation.

---

## 2. Confirmed blocker

The production migration previously expected `student_affairs_reception` for step 1. Authoritative sources require `student_affairs_intake`:

- applied workflow: `supabase/migrations/20260725110900_b1_16_free_service_workflows_08.sql`
- MATRIX pin `SR-20260801-13000015|archive` predecessor order 1
- positive MANIFEST case 15 archive pin with the same predecessor chain

A production Fixture-15 restore would therefore fail-closed on a healthy row.

---

## 3. Fixes applied

### 3.1 Step-1 key correction

Replaced `student_affairs_reception` → `student_affairs_intake` in:

- `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`
- `scripts/b1-fixture-15-reissue-44-pg17/01-seed.sql`
- `scripts/b1-fixture-15-reissue-44-pg17/02-verify.sql`
- `tests/b1-fixture-15-forward-only-reissue-44.test.ts`
- prior remediation report table (doc sync)

### 3.2 Source-contract key alignment test

Added a Bun source-contract test that derives the seven keys from MATRIX `step_state_pins["SR-20260801-13000015|archive"]` + applied workflow SQL + MANIFEST case 15, then fails if the migration contract differs (including any regression to `student_affairs_reception`).

### 3.3 Stronger migration postconditions

Post-restore loop now re-proves for all seven steps:

- exact runtime step UUID
- exact `step_key` / `step_order`
- exact `workflow_id` and `workflow_step_id`
- processing unit / role codes
- action type
- singular direct assignee (staff only)
- expected final status (`completed` for 1–6, `active` for archive)
- completed_at presence for completed steps; cleared completion fields for active archive

### 3.4 Drift rollback fingerprint proof

Every drift case now:

1. resets Fixture 15 to authoritative consumed state (evidence count 0)
2. captures baseline seven-step fingerprint
3. applies one drift mutation and proves fingerprint changed
4. applies migration expecting fail-closed
5. proves seven-step fingerprint unchanged after reject
6. proves request fingerprint unchanged
7. proves workflow-events fingerprint unchanged
8. proves zero evidence rows inserted

Fingerprint fields include id, student_request_id, workflow_id, workflow_step_id, step_key, step_order, status, processing_unit_id, processing_role_id, action_type, all assignment identity columns, decision, completed_by, completed_at, entered_at, and comment.

---

## 4. Scope

### Modified

- `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`
- `scripts/b1-fixture-15-reissue-44-pg17/01-seed.sql`
- `scripts/b1-fixture-15-reissue-44-pg17/02-verify.sql`
- `tests/b1-fixture-15-forward-only-reissue-44.test.ts`
- `docs/B1-FIXTURE-15-EXACT-SEVEN-STEP-CONTRACT-REMEDIATION-49-REPORT.md` (key correction only)
- `docs/B1-FIXTURE-15-AUTHORITATIVE-STEP1-AND-ROLLBACK-PROOF-REMEDIATION-51-REPORT.md`

### Untouched

- other 18 Fixtures
- real requests
- `request_types` / visibility
- `enrollment_certificate`
- Auth / Storage
- application runtime

---

## 5. Verification

| Command | Result |
|---|---|
| `bun test tests/b1-fixture-15-forward-only-reissue-44.test.ts` | PASS |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS |
| `bun test tests/student-requests/b1-five-services-terminal-visibility-34.test.ts` | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

---

## 6. Assumptions / Risks / Production impact

- **Assumptions**: MATRIX `step_state_pins` and the applied free-workflow migration remain the authoritative step-key source.
- **Risks**: Low. Correcting the key unblocks restore of healthy Fixture-15 rows; drift still fails closed.
- **Production impact**: SOURCE-ONLY. No migration apply. No deploy. PR remains Draft.

---

## 7. Decision

**PASS** — `PASS_B1_PR279_AUTHORITATIVE_STEP1_AND_ROLLBACK_PROOF_READY_FOR_REVIEW`
