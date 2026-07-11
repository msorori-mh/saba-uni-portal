# STUDENT-REQUEST-ENROLLMENT-CERTIFICATE-WORKFLOW-FOUNDATION-01A — Report

**Date:** 2026-07-11  
**Branch:** `feature/enrollment-certificate-workflow-foundation-01a`  
**Base:** `origin/main` @ `6933d23f178cbe288b28b2eb4ada19a327bf773d`

## Decision

**PASS_PR115_REMEDIATION_READY_FOR_REREVIEW**

## Summary

Implements configurable workflow save RPC, fee assessment schema adjustments, fee/payment RPCs, TypeScript wiring, admin UI enablement, reusable processing UI components, and dry-run contract tests for the enrollment certificate 7-step path.

## Remediation (PR #115)

| Issue | Fix |
|-------|-----|
| Destructive in-place step/transition DELETE on save-by-id | Removed; always create a new version (or reuse identical latest draft) |
| `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = true` | Set to `false` until migration applied; save buttons stay disabled |
| Incorrect cast of draft steps to camelCase save input | `saveAdminRequestWorkflowConfig` builds via `buildWorkflowSaveInputFromDraft` then maps snake_case RPC payload |
| Untyped `NULL` in `log_audit` | All calls use 7-arg typed overload (`NULL::jsonb`, `v_uid::uuid`) |
| Fee RPCs missing `create_notification` | Assess (amount>0) and confirm now notify student via `student_requests` → `student_profiles.user_id` |
| Fee forms dry-run only | Wired to `assessStudentRequestFee` / `confirmStudentRequestFeePayment` server fns |
| Single save button + empty `workflow: {}` | Two buttons: حفظ كمسودة / حفظ وتفعيل; full workflow object with code/name_ar/status/is_active |
| One-active uniqueness | Partial unique index `idx_request_type_workflows_one_active_per_type` + advisory lock |
| Role/unit mismatch | SQL validates `processing_role_id` belongs to `processing_unit_id`; TS helper for tests |

## Migration (not applied)

`supabase/migrations/20260711040000_enrollment_certificate_workflow_foundation_01a.sql`

| Object | Purpose |
|--------|---------|
| `admin_save_request_workflow_config` | Non-destructive versioning; idempotent identical draft; activate retires previous |
| `assess_student_request_fee` | SA manager assesses fee; conditional transitions; notify when amount>0 |
| `confirm_student_request_fee_payment` | Finance confirms payment; duplicate guard; notify student |
| Fee schema | `payment_status` extended; `payment_reference`; unique active assessment index |
| CHECK extensions | `assess_fee`, `confirm_payment`, `sign`; transition results for fee/sign/issue |

## enrollment_certificate canonical path (7 steps)

1. `initial_review` — student_affairs_specialist — review  
2. `fee_assessment` — student_affairs_manager — assess_fee  
3. `payment_confirmation` — revenue_finance_officer — confirm_payment (conditional)  
4. `registrar_signature` — registrar_general — sign  
5. `dean_signature` — dean — sign  
6. `document_issuance` — student_affairs_specialist — issue_document  
7. `archive` — archive_officer — archive  

**Fee branches:** `fee_not_required` → registrar_signature; `payment_required` → payment_confirmation → `payment_confirmed` → registrar_signature.

## Files changed

| Area | Files |
|------|-------|
| Migration | `supabase/migrations/20260711040000_enrollment_certificate_workflow_foundation_01a.sql` |
| RPC / contracts | `src/lib/admin-request-workflow-rpc.ts`, `admin-request-workflow.functions.ts`, `student-request-fee.functions.ts`, `request-workflow-save-contract.ts`, `workflow-save-versioning-policy.ts`, `request-fee-workflow-contract.ts` |
| Admin UI | `src/routes/admin/request-types.$id.workflow.tsx` |
| Processing UI | `StudentRequestFeeAssessmentForm.tsx`, `StudentRequestPaymentConfirmationForm.tsx` |
| Tests | `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` |

## Production writes

**None.** Migration file created/updated only — no `supabase db push`, login, seed, or deploy.

## Test plan

- [x] `bunx tsc --noEmit`
- [x] `bun run build`
- [x] `bun test tests/student-requests/enrollment-certificate-workflow-foundation.test.ts`
- [x] Scenarios 1–15 (dry-run/mocks + versioning policy)

## Follow-up (post-staging apply)

1. Apply migration on staging; verify RPC grants and unique active index.
2. Seed processing units/roles and save enrollment_certificate workflow as active.
3. Flip `ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE` to `true` after apply.
4. Re-verify fee notification delivery for amount>0 and confirm paths.
