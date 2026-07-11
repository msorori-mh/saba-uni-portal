# STUDENT-REQUEST-ENROLLMENT-CERTIFICATE-WORKFLOW-FOUNDATION-01A — Report

**Date:** 2026-07-11  
**Branch:** `feature/enrollment-certificate-workflow-foundation-01a`  
**Base:** `origin/main` @ `6933d23f178cbe288b28b2eb4ada19a327bf773d`

## Decision

**PASS_ENROLLMENT_CERTIFICATE_WORKFLOW_FOUNDATION_PR_READY_FOR_REVIEW**

## Summary

Implements configurable workflow save RPC, fee assessment schema adjustments, fee/payment RPCs, TypeScript wiring, admin UI enablement, reusable processing UI components, and dry-run contract tests for the enrollment certificate 7-step path.

## Migration (not applied)

`supabase/migrations/20260711040000_enrollment_certificate_workflow_foundation_01a.sql`

| Object | Purpose |
|--------|---------|
| `admin_save_request_workflow_config` | Validate + persist workflow/steps/transitions; draft/active; retire previous active |
| `assess_student_request_fee` | SA manager assesses fee; conditional transitions |
| `confirm_student_request_fee_payment` | Finance confirms payment; duplicate guard |
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
| RPC / contracts | `src/lib/admin-request-workflow-rpc.ts`, `admin-request-workflow.functions.ts`, `request-workflow-save-contract.ts`, `request-workflow-preview-registry.ts`, `request-workflow-validation.ts`, `request-fee-workflow-contract.ts` |
| Admin UI | `src/components/admin/request-workflow/constants.ts`, `WorkflowStepsEditor.tsx`, `WorkflowTransitionsEditor.tsx`, `src/routes/admin/request-types.$id.workflow.tsx` |
| Processing UI | `StudentRequestFeeAssessmentForm.tsx`, `StudentRequestPaymentConfirmationForm.tsx`, `StudentRequestFeeStatusDisplay.tsx` |
| Tests | `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts` |

## Production writes

**None.** Migration file created only — no `supabase db push`, login, seed, or deploy.

## Test plan

- [x] `bunx tsc --noEmit`
- [x] `bun run build`
- [x] `bun test tests/student-requests/enrollment-certificate-workflow-foundation.test.ts`
- [x] Scenarios 1–12 (dry-run/mocks)

## Follow-up (post-staging apply)

1. Apply migration on staging; verify RPC grants.  
2. Seed processing units/roles and save enrollment_certificate workflow as active.  
3. Wire processing UI forms to live RPCs (currently dry-run only).  
4. Enable workflow activation UI when `admin_publish_request_workflow` lands.
