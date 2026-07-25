# PORTAL-B1-FINAL-BACKEND-STACK-TO-UI-INTEGRATION-01

## Decision

**PASS_B1_FINAL_BACKEND_UI_CONTRACT_INTEGRATION_READY**
**PASS_PR238_FINAL_BACKEND_REVIEW_GUARDS_SYNCED**

UI stack (PR #221 tip `8c6e092`) merged with final Backend stack on branch `integration/b1-final-backend-ui-contracts-01`. Live B1 UI adapter now calls Secure Read + Secure Draft contracts. Five services remain hidden (`studentVisible` / `runtimeAvailable` fail-closed without activation).

No Production/Staging apply, Deploy/Publish, migration apply, activation, or `student_visible` mutation.

## Final backend review guards sync (post PR #241 → #227)

| Field | Value |
|---|---|
| PR | [#238](https://github.com/msorori-mh/saba-uni-portal/pull/238) |
| PR #227 final HEAD | `1c085a97b6a1ad6f6da99f2ad09120bafaef4468` |
| PR #241 | MERGED into #227 (`1c085a9…`) — independent Codex review of unified backend |
| Codex decision | `PASS_PR227_FINAL_UNIFIED_BACKEND_STACK_REVIEW` |
| Sync merge commit | `4d15edf74fe9fa45e425e633c2ef8d0803d2bedb` (`merge(b1): sync final PR227 Codex review guards into UI RC`) |
| Prior #238 tip before sync | `2254fe88febeca902c12c44a63810da462f1f1f0` |
| Base | `feat/b1-five-services-ui-kimi-01` (`8c6e092…`) |
| Apply package | seq **21–25** READ-ONLY / PREPARATION-ONLY (PR #239) |
| Five services | Still hidden (fail-closed) |
| Next gate | PR #238 still requires an **independent Codex review of Backend/UI integration** before any merge into PR #221 |

### Sync scope proof (`2254fe8…` → sync merge)

Files brought from PR #241 / #227 tip only:

- `docs/PORTAL-PR227-FINAL-UNIFIED-BACKEND-STACK-INDEPENDENT-REVIEW-01-REPORT.md`
- `tests/student-requests/b1-final-unified-backend-stack-independent-review-01.test.ts` (seq 21–25 / pin guards)
- `tests/b1-rpc-matrix/pg/40-verifier.sql` (harness open-draft compatibility)
- `tests/b1-rpc-matrix/pg/run-harness.ps1` (position_assignment fixtures for seq 23)

**Unchanged:** `src/` UI contracts, `adapter.live` behavior, SQL runtime functions / migrations, service visibility, activation, `enrollment_certificate` behavior.

## Final RC refresh (post PR #239)

| Field | Value |
|---|---|
| Post-#239 merge pin | `e656b8259ce43fe320c20b086b7ea45ef403a472` |
| Apply package | `docs/PORTAL-B1-PRODUCTION-SEQUENTIAL-APPLY-FINAL-PACKAGE-01-REPORT.md` (seq **21–25**) |
| Package mode | **READ-ONLY / PREPARATION-ONLY** |

Delta proof `a8d6f639…` → `e656b825…`: **one docs file only** (apply-package report).

## Baseline

| Ref | Value |
|---|---|
| Final RC tip (PR #238) | current `headRefOid` on `integration/b1-final-backend-ui-contracts-01` |
| PR #227 final HEAD | `1c085a97b6a1ad6f6da99f2ad09120bafaef4468` |
| Post-#239 merge pin | `e656b8259ce43fe320c20b086b7ea45ef403a472` |
| PR #221 tip | `8c6e092c591be3d10bdfa159e86f61bc30ad0d05` (`feat/b1-five-services-ui-kimi-01`) |
| Integration branch | `integration/b1-final-backend-ui-contracts-01` |
| Stacked PR base | `feat/b1-five-services-ui-kimi-01` |
| Sequential apply package | PR #239 merged; seq 21–25 prep only |

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

## Verification (re-run after #241 sync)

| Check | Result |
|---|---|
| Secure Read PG17 | **PASS** 25/25 (`B1_SECURE_READ_PG17_PASS`) |
| Secure Draft PG17 | **PASS** 35/35 + concurrency (`B1_SECURE_DRAFT_PG17_PASS`, `B1_CONCURRENT_CREATE_ONE_DRAFT_PASS`) |
| RPC matrix PG17 | **PASS** `RESULTS=65\|12\|0` (zero FAIL) |
| Integrated Runtime E2E | **PASS** 5/5, `fail_rows=0` (`B1_INTEGRATED_RUNTIME_E2E_PASS`) |
| `bun test tests/b1-manifest` | **20 pass** |
| `bun test tests/student-requests/b1-ui` | **159 pass** |
| `bun test tests/student-requests` | **821 pass** |
| `bun test tests/b1-rpc-matrix` | **22 pass** |
| `bun test tests` | **1758 pass** |
| `bunx tsc --noEmit` | PASS |
| eslint (owned files) | PASS (LF normalize on synced review test) |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Containers | disposable `--rm` after each PG17 harness |

Spot checks green: `expectedUpdatedAt`, no optimistic state, secure attachment download boundary, exact role/scope auth, transfer position assignment, withdrawal NULL guard, zero mutation, enrollment_certificate regression, five services remain hidden.

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

None. SOURCE-ONLY. No Production/Staging migration apply, Deploy/Publish, activation, or `student_visible` change. No merge of PR #238 into PR #221 or main in this cycle.

## RC decisions

- **PASS_PR238_POST_PR239_FINAL_RC_REFRESH** — docs refresh after post-#239 pin `e656b825…`
- **PASS_PR238_FINAL_BACKEND_REVIEW_GUARDS_SYNCED** — #238 synced to #227 tip `1c085a9…` after #241; Codex `PASS_PR227_FINAL_UNIFIED_BACKEND_STACK_REVIEW`
- Independent Codex review of **Backend/UI integration on PR #238** remains outstanding before any merge into #221
