# PORTAL B1 PR #279 FIXTURE-15 EXACT SEVEN-STEP CONTRACT REMEDIATION REPORT

**MISSION ID**: `PORTAL-B1-PR279-FIXTURE-15-EXACT-SEVEN-STEP-CONTRACT-REMEDIATION-49`
**PR NUMBER**: `#279`
**BRANCH**: `fix/b1-fixture-15-forward-only-reissue-44`
**BASE HEAD**: `647ae0cee40c925f912099a1b4dd1b457a2ec03f`
**FINAL OUTPUT TOKEN**: `PASS_B1_PR279_FIXTURE_15_EXACT_SEVEN_STEP_CONTRACT_READY_FOR_REVIEW`

---

## 1. Executive Summary

Hardened the Fixture-15 forward-only restore migration so it fail-closes on the exact authoritative identity and authorization bindings of all seven runtime steps before and after restoration. Drifted steps 1–6 can no longer survive while archive is reactivated. Restore still mutates only request terminal fields and archive completion fields; bindings are never rewritten.

---

## 2. Authoritative contract sources

Derived only from:

1. Fixture-13 package migration `20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql`
2. `tests/b1-authoritative-positive-fixture-matrix-19/MANIFEST.json` (case 15)
3. `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json` pin `SR-20260801-13000015|archive`
4. Applied `file_withdrawal_free_workflow` (`20260725110900_b1_16_free_service_workflows_08.sql`)

| Order | Runtime step UUID | step_key | unit | role | action | principal |
|--:|---|---|---|---|---|---|
| 1 | `…000015000001` | `student_affairs_reception` | `student_affairs` | `student_affairs_specialist` | `review` | `c8a94548-…` |
| 2 | `…000015000002` | `library_clearance` | `library` | `library_officer` | `clear` | `e7a93314-…` |
| 3 | `…000015000003` | `labs_clearance` | `labs` | `labs_manager` | `clear` | `67b39ee4-…` |
| 4 | `…000015000004` | `activities_clearance` | `student_affairs` | `student_affairs_manager` | `clear` | `aac0e62d-…` |
| 5 | `…000015000005` | `finance_clearance` | `finance` | `revenue_finance_officer` | `clear` | `79783c0f-…` |
| 6 | `…000015000006` | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` | `4c261c1c-…` |
| 7 | `…000015000007` | `archive` | `archive` | `archive_officer` | `archive` | `aec1303e-…` |

Identity kind for all seven: singular `staff_profile` (`assigned_user_id` / faculty / position must be NULL).

---

## 3. Migration hardening

**File**: `supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql`

Before evidence insert or mutation the migration now:

- locks the request and all runtime steps in deterministic `step_order`
- rejects duplicate step order/key/id
- requires exactly seven rows
- resolves exactly one active `file_withdrawal` workflow
- proves for every row: UUID, request id, key, order, workflow/config identity, unit code, role code, `metadata.action_type`, singular staff assignee principal, and predecessor/completion expectations
- consumed path requires request completed, all seven completed, zero active, archive completed by exact actor, exactly one attributable archive event
- idempotent restored path also re-proves the full seven-step contract (not merely 6+1 counts)
- restore updates only request terminal fields + archive completion fields
- postconditions re-prove the complete seven-step restored contract, 19/19 package, visibility false for the five services

---

## 4. PG17 harness expansion

Updated disposable harness under `scripts/b1-fixture-15-reissue-44-pg17/`:

- schema includes units/roles/staff/workflow config needed for binding proofs
- seed materializes exact file_withdrawal seven-step contract for Fixture 15 (consumed)
- verify asserts exact restored seven-step bindings

`tests/b1-fixture-15-forward-only-reissue-44.test.ts` now fail-closes one case for each drift class:

- wrong step UUID
- wrong step key
- wrong step order
- wrong processing unit
- wrong processing role
- wrong configured action
- wrong assignee identity
- multiple identity columns populated
- missing predecessor completion
- duplicate step row

Each drift proves atomic rollback and no evidence row inserted.

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

- **Assumptions**: Production still has exactly one active `file_withdrawal` workflow and Fixture-13 staff principal bindings for the seven roles.
- **Risks**: Low for healthy Fixture-15 rows; any real binding drift now hard-fails instead of silently restoring archive.
- **Production impact**: SOURCE-ONLY. Migration not applied. No deploy. No other Fixture mutation. Visibility and `enrollment_certificate` untouched. PR remains Draft.

---

## 7. Decision

**PASS** — `PASS_B1_PR279_FIXTURE_15_EXACT_SEVEN_STEP_CONTRACT_READY_FOR_REVIEW`
