# PORTAL-B1-FINAL-BACKEND-STACK-TO-UI-INTEGRATION-01

## Decision

**PASS_B1_FINAL_BACKEND_UI_CONTRACT_INTEGRATION_READY**

UI stack (PR #221 tip `8c6e092`) merged with final Backend stack (PR #227 HEAD `4131195`) on branch `integration/b1-final-backend-ui-contracts-01`. Live B1 UI adapter now calls Secure Read + Secure Draft contracts. Five services remain hidden (`studentVisible` / `runtimeAvailable` fail-closed without activation).

No Production/Staging apply, Deploy/Publish, migration apply, activation, or `student_visible` mutation.

## Baseline

| Ref | Value |
|---|---|
| PR #227 HEAD | `41311950872672a8e326b1712dd1f16475cc4877` |
| PR #221 tip | `8c6e092c591be3d10bdfa159e86f61bc30ad0d05` (`feat/b1-five-services-ui-kimi-01`) |
| Integration branch | `integration/b1-final-backend-ui-contracts-01` |
| Stacked PR base | `feat/b1-five-services-ui-kimi-01` |

## Contract wiring (Live adapter)

| Adapter method | Backend contract |
|---|---|
| `getB1RuntimeCapability` | `get_b1_secure_read_runtime_capability` |
| `getAvailableB1RequestTypes` | available-types RPC + capability (visibility/readiness) |
| `getB1RequestFormOptions` | `get_b1_request_form_options` |
| `createB1RequestDraft` | `create_b1_request_draft_for_student` |
| `getB1RequestDraft` | `get_b1_request_draft_for_student` |
| `saveB1RequestDraft` | `save_b1_request_draft_for_student` (**required** `expectedUpdatedAt`) |
| `listB1StudentRequests` | `list_b1_requests_for_student` |
| `getB1RequestDetails` | `get_b1_request_details_for_student` |
| `getAssignedB1Requests` | `get_b1_assigned_inbox_for_actor` |
| `getAssignedB1RequestDetails` | `get_b1_assigned_request_details_for_actor` |
| `downloadB1RequestAttachment` | authorize → signed URL (server-only; browser sends `attachmentId`) |
| `submitB1Request` | `submit_b1_student_request_atomic` |
| `actOnB1RequestStep` | `act_on_b1_student_request_step_atomic` (no `confirm_payment`) |
| `confirmB1RevenueReceipt` | `record_external_university_payment_confirmation` (`stepId` + optional `note`) |
| attachments upload/remove | existing secure-attachment RPCs |

## Security conditions (verified)

- No hardcoded `runtimeAvailable=true` — derived from capability readiness.
- `studentVisible` only from backend available-types inclusion.
- `expectedUpdatedAt` required on save (types, mock, live, form).
- No optimistic status/timestamps in staff UI after actions.
- No viewer identity in DTOs; no bucket/path/object_key in public adapter types.
- Payment: `stepId` + optional note only.
- No direct Supabase imports in React B1 components.
- Mock only when `DEV && VITE_B1_UI_MOCK=1`.

## Verification

| Check | Result |
|---|---|
| Secure Read PG17 | **PASS** (25 rows) |
| Secure Draft PG17 | **PASS** (35 rows) |
| Integrated Runtime E2E | **PASS** 5/5, `fail_rows=0` |
| `bun test tests/student-requests/b1-ui` | **159 pass** |
| `bun test tests/student-requests` | **816 pass** |
| `bun test tests/b1-rpc-matrix` | **22 pass** |
| `bun test tests` | **1753 pass** |
| `bunx tsc --noEmit` | PASS |
| eslint (owned files) | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Containers | removed (`--rm`) |

## Files (primary)

- `src/lib/student-requests/b1-ui/adapter.live.ts`
- `src/lib/student-requests/b1-ui/adapter.types.ts`
- `src/lib/student-requests/b1-ui/adapter.mock.ts`
- `src/lib/student-requests/b1-ui/availability.ts`
- `src/lib/student-requests/b1-secure-read/contracts.ts` / `rpc.ts` (capability writes)
- `src/components/student-requests/b1/B1StudentRequestForm.tsx`
- `src/components/student-requests/b1/B1StaffWorkspace.tsx`
- B1 UI / journey / scenario tests

## Assumptions / risks

- Services stay hidden until a separate activation gate sets `student_visible` and workflows active; capability then opens `runtimeAvailable`.
- Attachment runtime may still fail-closed if `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE` is false.
- Kimi/Codex/Cursor UI + prior bridge + PR #227 backend stack are preserved via merge-from-221 + semantic merge of #227 + adapter wiring.

## Production impact

None. SOURCE-ONLY. No merge to main.
