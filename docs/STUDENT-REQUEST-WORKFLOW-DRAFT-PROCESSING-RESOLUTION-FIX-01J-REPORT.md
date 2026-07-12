# STUDENT-REQUEST-WORKFLOW-DRAFT-PROCESSING-RESOLUTION-FIX-01J — Report

**Date:** 2026-07-12  
**Repo:** `msorori-mh/saba-uni-portal`  
**Branch:** `fix/workflow-draft-processing-resolution-01j`  
**Base:** latest `origin/main` after PR #119  

## Decision

**PASS_STUDENT_REQUEST_WORKFLOW_DRAFT_PROCESSING_RESOLUTION_PR_READY_FOR_REVIEW**

## Root cause

`buildWorkflowSaveInputFromDraft` treated `step_order === 1` as a student step and forced `roleKey = null` for every draft step, ignoring `processing_unit_id` / `processing_role_id` chosen by the admin.

### Impact

| Symptom | Effect |
|---------|--------|
| `initial_review` at order 1 | Misclassified as `actorType: student` |
| All staff steps | `roleKey = null` → `missing_role_key` errors |
| Dry Run | `INVALID` despite complete unit/role selection |
| Draft save | Failed server-side validation before/around RPC |
| Flags | `requires_payment` / `produces_document` not consistently normalized into save payload |

## Fix summary

1. **Student classification** only when `step_key === "student"` and both processing IDs are empty (never by `step_order`).
2. **Server resolution** (`resolveDraftWorkflowProcessingReferences`): read-only selects from `request_processing_units` / `request_processing_roles` by UUID; validate active + unit membership + approved role code; map UUID → trusted `role.code`.
3. **Same resolution** used in `prepareStudentRequestWorkflowSave` (draft source) and `saveAdminRequestWorkflowConfig` before `validateWorkflowSaveInput` / RPC.
4. **Flag normalization** (`normalizeDraftWorkflowStepFlags`): `requires_payment` for `assess_fee` / `request_payment`; `produces_document` for `issue_document`.
5. **Final approval** for `enrollment_certificate`: `dean_signature` only (preview + draft builders share `inferWorkflowStepIsFinalApproval`).
6. **Canonical local load** sets payment/document flags; unit/role IDs remain null until admin selects them.
7. **RPC transitions**: all nine transitions retained (including null start/end endpoints).

## Trusted roleKey mapping (enrollment_certificate)

| Step | roleKey |
|------|---------|
| initial_review | student_affairs_specialist |
| fee_assessment | student_affairs_manager |
| payment_confirmation | revenue_finance_officer |
| registrar_signature | registrar_general |
| dean_signature | dean |
| document_issuance | student_affairs_specialist |
| archive | archive_officer |

## Dry Run (full path, unit-tested)

- Steps: 7  
- Transitions: 9 (includes `payment_required`, `fee_not_required`, `payment_confirmed`)  
- Result: **VALID** (`valid: true`, no error/warning issues)  
- Preview path also **VALID** after final-approval fix  

## Verification

| Command | Result |
|---------|--------|
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `workflow-draft-processing-resolution.test.ts` | **14 PASS** |
| `enrollment-certificate-workflow-foundation.test.ts` | **55 PASS** |
| `request-workflow-route-unnest.test.ts` | **6 PASS** |
| Focused total | **75 PASS** |
| `git diff --check` | PASS |

Local UI: no production draft save pressed; no DB writes. Dry-run correctness covered by pure resolution + validation tests (mocked unit/role rows).

## Files changed

- `src/lib/student-requests/request-workflow-save-contract.ts`
- `src/lib/admin-request-workflow.functions.ts`
- `src/routes/admin/request-types_.$id.workflow.tsx`
- `tests/student-requests/workflow-draft-processing-resolution.test.ts` (new)
- `tests/student-requests/enrollment-certificate-workflow-foundation.test.ts`
- `docs/STUDENT-REQUEST-WORKFLOW-DRAFT-PROCESSING-RESOLUTION-FIX-01J-REPORT.md`

## Security Review

- Migrations / RLS / RPCs schema: **no**
- DB writes: **no** (read-only unit/role selects on dry-run/save prep)
- Auth: existing `assertAnyRole` + `requireSupabaseAuth` retained
- Browser-supplied role codes: **not trusted** — codes come from DB UUIDs only
- Production risk: **low**
- Ready for merge: **yes** (pending review)
- Ready for deploy: **yes** after merge (not performed)

## Confirmations

- No migrations / SQL apply  
- No Supabase writes / seed / workflow create / type activation  
- No Publish/Deploy  
- No `types.ts` edits  

## Recommended next step

Review PR → authenticated staging dry-run with real processing units/roles → optional draft save on staging only.
