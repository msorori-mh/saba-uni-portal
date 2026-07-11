# STUDENT-REQUEST-ENROLLMENT-CERTIFICATE-WORKFLOW-FOUNDATION-01A — Report

**Date:** 2026-07-11  
**Branch:** `feature/enrollment-certificate-workflow-foundation-01a`  
**PR:** https://github.com/msorori-mh/saba-uni-portal/pull/115

## Decision

**PASS_PR115_REMEDIATION_ROUND_2_READY_FOR_REREVIEW**

## Summary

Implements configurable workflow save RPC, fee assessment schema adjustments, fee/payment RPCs, TypeScript wiring, admin UI enablement, reusable processing UI components, and dry-run contract tests for the enrollment certificate 7-step path.

## Remediation Round 2 (PR #115)

| Issue | Fix |
|-------|-----|
| Fingerprint omitted saved fields (names, flags, labels, workflow meta) | Expanded SQL + TS fingerprint to include all persisted step/transition/workflow fields; draft reuse only on full match |
| `assertAnyRole` false-denied processing assignments | Fee server fns use `requireSupabaseAuth` only; RPC is final authority |
| `finance_officer` blocked on confirm | SQL `assert_can_confirm_*` accepts `finance_officer` and `revenue_finance_officer` (app role or processing assignment) |
| Fee forms not mounted in processing UI | Integrated into `StaffRequestDetailPanel` by `action_type` + active step + `canExecuteCurrentStep` |
| No fee/step read API for UI | Added `get_student_request_fee_processing_context` RPC + `getStudentRequestFeeProcessingContext` server fn |

### Fingerprint fields (must all match to reuse draft)

**Step:** `step_key`, `step_name_ar`, `step_order`, `processing_unit_id`, `processing_role_id`, `action_type`, `is_required`, `visible_to_student`, `notify_on_enter`, `notify_on_complete`, `can_return_to_student`, `can_reject`, `can_skip`, `requires_payment`, `produces_document`, `assignment_strategy`

**Transition:** `from_step_key`, `to_step_key`, `action_result`, `label_ar`, `is_default`, `condition_config` (from `condition_schema`)

**Workflow:** `code`, `name_ar`, `name_en`, `description_ar`

### Fee authorization (RPC)

| Action | Allowed | Denied |
|--------|---------|--------|
| Assess | admin / system_admin / student_affairs_manager (app or processing assignment) | student_affairs specialist |
| Confirm | admin / system_admin / revenue_finance_officer / finance_officer | student_affairs_manager; finance cannot change amount (assess path only) |

## Remediation Round 1 (retained)

| Issue | Fix |
|-------|-----|
| Destructive in-place step/transition DELETE on save-by-id | Removed; always create a new version (or reuse identical latest draft) |
| `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = true` | Remains `false` until migration applied |
| Untyped `NULL` in `log_audit` | Typed 7-arg overload |
| Fee RPCs missing `create_notification` | Assess (amount>0) and confirm notify student |
| One-active uniqueness | Partial unique index + advisory lock |

## Migration (not applied)

`supabase/migrations/20260711040000_enrollment_certificate_workflow_foundation_01a.sql`

| Object | Purpose |
|--------|---------|
| `admin_save_request_workflow_config` | Full-fingerprint non-destructive versioning |
| `assess_student_request_fee` | SA manager assesses fee; conditional transitions |
| `confirm_student_request_fee_payment` | Finance confirms payment |
| `get_student_request_fee_processing_context` | Read-only fee + current step for authorized processors |
| Fee schema | `payment_status` extended; `payment_reference`; unique active assessment |

## enrollment_certificate canonical path (7 steps)

1. `initial_review` — student_affairs_specialist — review  
2. `fee_assessment` — student_affairs_manager — assess_fee  
3. `payment_confirmation` — revenue_finance_officer — confirm_payment (conditional)  
4. `registrar_signature` — registrar_general — sign  
5. `dean_signature` — dean — sign  
6. `document_issuance` — student_affairs_specialist — issue_document  
7. `archive` — archive_officer — archive  

**Fee branches:** `fee_not_required` → registrar_signature; `payment_required` → payment_confirmation → `payment_confirmed` → registrar_signature.

## UI states

| State | Display | Forms |
|-------|---------|-------|
| amount = 0 / not_required | «لا رسوم مطلوبة» | No finance form |
| amount > 0 / pending_payment | Amount YER + «بانتظار السداد» | Confirm form for authorized actor only |
| paid | «تم تأكيد السداد» + reference | No confirm again |

## Files changed (round 2)

| Area | Files |
|------|-------|
| Migration | `supabase/migrations/20260711040000_enrollment_certificate_workflow_foundation_01a.sql` |
| Fingerprint / fee auth | `workflow-save-versioning-policy.ts`, `fee-processing-ui-policy.ts`, `student-request-fee.functions.ts`, `admin-request-workflow-rpc.ts` |
| Processing UI | `StaffRequestDetailPanel.tsx`, fee form/status components |
| Tests | `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` |
| Report | this file |

## Production writes

**None.** Migration file updated only — no `supabase db push`, login, seed, deploy, or merge.

## Test plan

- [x] `bunx tsc --noEmit`
- [x] `bun run build`
- [x] `git diff --check`
- [x] `bun test tests/student-requests/enrollment-certificate-workflow-foundation.test.ts`
- [x] Fingerprint field-change → new version
- [x] Processing assignment assess/confirm without false-deny
- [x] UI visibility by action_type / authorization / amount / paid

## Follow-up (post-staging apply)

1. Apply migration on staging; verify RPC grants and unique active index.
2. Seed processing units/roles and save enrollment_certificate workflow as active.
3. Flip `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE` to `true` after apply.
4. Smoke fee assess/confirm on a staging request (no production data).
