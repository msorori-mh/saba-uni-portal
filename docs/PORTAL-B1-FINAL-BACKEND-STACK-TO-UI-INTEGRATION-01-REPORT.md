# PORTAL-B1-FINAL-BACKEND-STACK-TO-UI-INTEGRATION-01

## Decision

**PASS_B1_FINAL_BACKEND_UI_CONTRACT_INTEGRATION_READY**

UI stack (PR #221 tip `8c6e092`) merged with final Backend stack (PR #227 HEAD `4131195`) on branch `integration/b1-final-backend-ui-contracts-01`. Live B1 UI adapter now calls Secure Read + Secure Draft contracts. Five services remain hidden (`studentVisible` / `runtimeAvailable` fail-closed without activation).

No Production/Staging apply, Deploy/Publish, migration apply, activation, or `student_visible` mutation.

## Final RC refresh (post PR #239)

| Field | Value |
|---|---|
| PR | [#238](https://github.com/msorori-mh/saba-uni-portal/pull/238) |
| Post-#239 merge pin | `e656b8259ce43fe320c20b086b7ea45ef403a472` |
| RC tip | PR #238 `headRefOid` (docs-only refresh commits after the pin above) |
| Prior integration tip | `a8d6f639f3e89c70253d6fbd85561e5ea8563edd` |
| Merged prep PR | [#239](https://github.com/msorori-mh/saba-uni-portal/pull/239) → merge commit `e656b825…` |
| Base | `feat/b1-five-services-ui-kimi-01` (`8c6e092…`) |
| Apply package | `docs/PORTAL-B1-PRODUCTION-SEQUENTIAL-APPLY-FINAL-PACKAGE-01-REPORT.md` (seq **21–25**) |
| Package mode | **READ-ONLY / PREPARATION-ONLY** — no Production/Staging write, no migration apply, no Deploy/Publish, no activation, no `student_visible` |
| Five services | Still hidden (fail-closed) |
| Next gate | PR #238 still requires an **independent Codex review** before any merge into PR #221 |

Delta proof `a8d6f639…` → `e656b825…`: **one docs file only**
`docs/PORTAL-B1-PRODUCTION-SEQUENTIAL-APPLY-FINAL-PACKAGE-01-REPORT.md` (+375).
Subsequent RC refresh commits after `e656b825…` update this integration report / PR description only.
No `src/`, SQL, migration, or runtime-contract byte changes vs `a8d6f639…`. Prior PG17 Secure Read 25/25, Secure Draft 35/35, and Integrated Runtime 5/5 remain applicable byte-for-byte to code/SQL at the RC tip.

## Baseline

| Ref | Value |
|---|---|
| Final RC tip (PR #238) | current `headRefOid` on `integration/b1-final-backend-ui-contracts-01` |
| Post-#239 merge pin | `e656b8259ce43fe320c20b086b7ea45ef403a472` |
| PR #227 HEAD | `41311950872672a8e326b1712dd1f16475cc4877` |
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

## Verification

| Check | Result |
|---|---|
| Secure Read PG17 | **PASS** (25 rows) — code/SQL unchanged since `a8d6f639…`; still applicable at RC |
| Secure Draft PG17 | **PASS** (35 rows) — same |
| Integrated Runtime E2E | **PASS** 5/5, `fail_rows=0` — same |
| `bun test tests/b1-manifest` (RC refresh) | **20 pass** |
| `bun test tests/student-requests/b1-ui` (RC refresh) | **159 pass** |
| `bun test tests/student-requests` (RC refresh) | **816 pass** |
| `bun test tests/b1-rpc-matrix` (RC refresh) | **22 pass** |
| `bun test tests` (RC refresh) | **1753 pass** |
| `bunx tsc --noEmit` (RC refresh) | PASS |
| eslint (owned files) (RC refresh) | PASS |
| `bun run build` (RC refresh) | PASS |
| `git diff --check` (RC refresh) | PASS |
| Containers | removed (`--rm`) in integration cycle; not recreated for docs-only RC refresh |

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

## RC refresh decision

**PASS_PR238_POST_PR239_FINAL_RC_REFRESH** (documentation refresh after post-#239 pin `e656b825…`; independent Codex review of PR #238 remains outstanding before merge into #221).
