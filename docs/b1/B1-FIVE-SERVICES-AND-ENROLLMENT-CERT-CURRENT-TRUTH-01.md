# B1 — Five Services & Enrollment Certificate Current-Truth Report

## Header

| Key | Value |
| --- | --- |
| mission | Verify the source-of-truth contract for the five B1 student-request services and confirm enrollment_certificate regression protection at current HEAD. |
| SOURCE_SHA | `9833269998a68f4ff1b86a57faf897f9b825f654` |
| BRANCH | `fix/b1-go-live-final-drift-d02-closure-01` |
| DEPLOYED_SHA | `UNKNOWN` |
| generated_at | `2026-08-10T11:00:07Z` |

> **Note on SOURCE_SHA drift:** the working summary carried an earlier pin (`38578b6533f20407c02ed775b5af18d11fcb85eb`). The current HEAD resolved by `git rev-parse HEAD` is `9833269998a68f4ff1b86a57faf897f9b825f654`. This report uses the actually-checked HEAD value.

---

## Scope

- **Five B1 services:** `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal`.
- **Enrollment certificate:** `enrollment_certificate` — verify it remains hidden from students (`student_visible = false`), that its document issuance/archive saga is intact, and that no production source logic was modified to expose or alter it.
- **Method:** read-only source inspection; no migrations applied, no production writes, no source-logic changes.

---

## 1. Five B1 Services Verification Matrix

| # | Service | Request-Type Code | Form Registry | Fee Policy | Validation | Runtime Step Auth | Academic Effect | Attachments | Verdict |
| - | ------- | ----------------- | ------------- | ---------- | ---------- | ----------------- | --------------- | ----------- | ------- |
| 1 | `enrollment_suspension` | `enrollment_suspension` canonical code 99 | `src/lib/student-requests/request-form-registry.ts` defines the form schema with `requestType: "enrollment_suspension"`. | `B1_FEE_POLICIES` in `src/lib/student-requests/request-service-adapter.ts` marks it `"free"` (line ~175-181). | Server adapter validates semester/state requirements and guards suspension eligibility (lines ~352-422). | `canActOnB1RuntimeStep` and B1 atomic RPC allowlist (`src/lib/student-requests/b1-ui/b1-rpc.ts` lines 23-47) enforce `act_on_b1_runtime_step`. Database guards `can_current_user_act_on_step`, `is_valid_b1_runtime_step_contract`, `assert_b1_runtime_step_assignee_effective`, and `guard_b1_runtime_step_activation` protect every step transition. | Migration `20260727120100_b1_26_academic_effect_functions_01.sql` defines `apply_b1_enrollment_suspension_effect` (lines 8-193) and it is wired into `act_on_b1_runtime_step` in `20260727120200_b1_27_act_on_academic_effect_integration_01.sql` (lines 66-71, 85-87). | Uses secure-attachment contract (`src/lib/student-requests/secure-attachments-contract.ts`) with private bucket and transfer RPCs (`20260725110000_b1_07_secure_attachments_source_01.sql`, `20260725110500_b1_12_transfer_secure_attachment_05a.sql`). | PASS |
| 2 | `excused_absence` | `excused_absence` canonical code 295 | Form registry entry present in `src/lib/student-requests/request-form-registry.ts`. | `"free"` per `B1_FEE_POLICIES`. | Adapter validates excuse reason and documents; UI validation layer (`src/lib/student-requests/b1-ui/validation.ts`) adds extra client guards. | Same runtime auth stack as above. | `apply_b1_excused_absence_effect` defined and wired. | Requires `excuse_documents` field referencing the secure-attachment contract. | PASS |
| 3 | `department_transfer` | `department_transfer` canonical code 400 | Form registry entry present. | `"free"` per `B1_FEE_POLICIES`. | Adapter validates source/target department and level constraints. | Same runtime auth stack. | `apply_b1_department_transfer_effect` defined and wired. | May reference `secondary_certificate` via `attachment-references.ts`; secure-attachment contract enforced. | PASS |
| 4 | `final_chance` | `final_chance` canonical code 495 | Form registry entry present. | `"free"` per `B1_FEE_POLICIES`. | Adapter validates final-chance academic pre-conditions. | Same runtime auth stack. | `apply_b1_final_chance_effect` defined and wired. | Secure-attachment contract. | PASS |
| 5 | `file_withdrawal` | `file_withdrawal` canonical code 246 | Form registry entry present. | `"free"` per `B1_FEE_POLICIES`. | Adapter validates withdrawal state and clearance constraints. | Same runtime auth stack. | `apply_b1_file_withdrawal_effect` defined and wired. | Secure-attachment contract. | PASS |

### Cross-cutting evidence for the five services

1. **Visibility gate — `student_visible = true`**
   Migration `20260806005924_4229a88b-abae-40c9-b3cc-054b5b011240.sql` (lines 1-31) explicitly sets `student_visible = true` for the five codes and **preserves** `enrollment_certificate` unchanged. The update is guarded by pre- and post-conditions that fail the migration if the wrong rows are touched.

2. **Submit path**
   `submit_student_request(uuid)` in `supabase/migrations/20260710190000_student_request_workflow_runtime.sql` (lines 271-352) performs eligibility re-check, status guard (`draft`, `returned`, `returned_for_completion`), request-type active check, and then calls `initialize_student_request_workflow`. This is the shared submit path used by B1 services.

3. **Atomic runtime step action**
   `act_on_b1_runtime_step` in `supabase/migrations/20260724061333_abf1bbb5-1bd0-4a7b-a805-866a3b98a61a.sql` (lines 336-471) is the single atomic surface for staff decisions. It validates the step contract, assignment, and transition before persisting any state.

4. **Details dispatcher**
   `persist_validated_b1_request_details` in `20260725110800_b1_15_service_details_dispatcher_05a.sql` (lines 12-117) stores service-specific payload only after validation passes.

5. **Audit & notifications**
   - Audit: `log_audit` (`20260601013349_41b22c03-d622-444a-84b0-d2996d023e7b.sql` lines 61-79).
   - Workflow events: `student_request_workflow_events` (`20260709212936_45460e98-f56c-4fd0-90f3-b824eb6676e2.sql` lines 192-215).
   - Decision notification: `notify_student_request_decision` (`20260621023929_fbad24ae-1c09-4b10-b881-b5f05477126e.sql`).
   - Completion notification + archive: `20260716031605_b5b78c98-9d90-4f8f-ab5b-f9360620b408.sql` and `20260716034114_6e850b89-bb97-4ffd-91c2-74122016b6ab.sql`.

---

## 2. Enrollment Certificate Regression Protection Matrix

| Concern | Evidence | Verdict |
| ------- | -------- | ------- |
| **Student visibility remains false** | `request-form-registry.ts` still registers `enrollment_certificate` but the migration `20260806005924_4229a88b-abae-40c9-b3cc-054b5b011240.sql` deliberately excludes it from the `student_visible = true` update. The hidden E2E helpers in `20260713020000_enrollment_certificate_hidden_e2e_draft_and_submit_window.sql` hard-require `student_visible IS DISTINCT FROM false` (lines 171-174, 510-513). | PASS |
| **Submit path unchanged for general students** | `submit_student_request` does not special-case `enrollment_certificate`; it relies on the same `is_active` / `request_audience` gates. The only controlled submit path is the admin-only E2E submit-window RPC which keeps `student_visible = false`. | PASS |
| **Signature steps required before issuance** | `prepare_enrollment_certificate_document_generation` in `20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql` (lines 227-239) requires both `registrar_signature` and `dean_signature` steps to be `completed` with `decision = 'signed'`. The same check is repeated at archive time (lines 903-915). | PASS |
| **Document issuance only in `document_issuance` step** | The prepare function rejects unless the active step is `step_key = 'document_issuance'` and `action_type = 'issue_document'` (lines 220-225). | PASS |
| **Download restricted to `issued`/`archived`** | `DOWNLOADABLE_OFFICIAL_DOCUMENT_STATUSES = ["issued", "archived"]` in `src/lib/student-requests/enrollment-certificate-pdf-storage-generator-contract.ts` (line 208). Signed URL generation in `enrollment-certificate-pdf-storage-saga.functions.ts` enforces this. | PASS |
| **Storage is private** | Saga uses the private document bucket; `verify_document` public endpoint only exposes non-sensitive verification fields (`20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql` lines 960-1017). | PASS |
| **No financial data invented** | The hidden E2E helpers use `e2e_scenario = 'zero_fee'` and never create a payment gateway, currency, or amount. The fee assessment gate in issuance accepts `not_required`, `paid`, or `waived` (line 244-246), consistent with the "no in-portal payments" rule. | PASS |
| **Source logic not altered** | This report was produced by read-only inspection only. No source files were edited. No `request_types.student_visible` changes were made. | PASS |

---

## 3. Historical SHA Cross-Check

The older pins `0e2d25c9…`, `427b7eb4…`, and `8f229d09…` appear only in historical documentation under `docs/` (e.g. `docs/B1-FIVE-SERVICES-PRODUCTION-ACTIVATION-PREFLIGHT-02-REPORT.md`) and in read-only test/draft evidence files. They were **not found** in any runtime source file under `src/lib/student-requests/` or in any migration under `supabase/migrations/`. Therefore no runtime source currently depends on or advertises those obsolete SHAs.

---

## 4. Open / Not-Verified Items

| Item | Reason | Impact |
| ---- | ------ | ------ |
| `DEPLOYED_SHA` | No access to production deployment metadata or artifact registry. | Cannot claim production parity; report is source-truth only. |
| Live RPC positive/negative matrix | Not run because the task was source-only and no secure test environment was invoked. | The source contracts support the matrix, but runtime execution proof is not included here. |

---

## 5. Decision

**PASS — source-only.**

At `9833269998a68f4ff1b86a57faf897f9b825f654`, the five B1 services are correctly configured in the form registry, service adapter, fee policy, validation, attachment, workflow runtime, and academic-effect layers. `enrollment_certificate` remains hidden from students (`student_visible = false`), its signature/issuance/archive saga is intact, and no source logic was modified during this verification. The only blocker to a full go-live verdict is independent proof of the deployed SHA, which is outside the scope of this source-truth report.
