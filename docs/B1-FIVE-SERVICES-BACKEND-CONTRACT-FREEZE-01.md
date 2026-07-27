# PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 — Contract Freeze

Status: **FROZEN**  
Branch: `feat/b1-five-services-backend-01`  
Base: `origin/main@7e499ddf67396d985e5db787f6719be6db43f539`  
Scope: `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal`  
Policy: SOURCE-ONLY. No Production Migration apply. No Deploy/Publish. No `student_visible` change. No activation.

## Freeze rules

1. RPC signatures, allowlisted `form_data` keys, success jsonb shapes, and exception strings below are authoritative for this PR.
2. Revenue confirmation is an ordinary `confirm_payment` workflow action for the exact finance assignee. It records **actor + timestamp + optional note** only.
3. Forbidden in revenue confirmation: amount, currency, invoice, payment gateway, fee type, payment reference, internal balance, client-supplied status, and any rejection-for-non-payment path.
4. Workflows created by this track remain `status='draft'` and `is_active=false` until a separate activation gate.
5. Adapters stay `runtimeAvailable: false` until post-apply activation evidence.

## Canonical ↔ stored codes

| Canonical | Stored `request_type` | Detail table |
|---|---|---|
| `enrollment_suspension` | `enrollment_suspension` | `enrollment_suspension_details` |
| `excused_absence` | `absence_excuse` | `absence_excuse_details` |
| `department_transfer` | `transfer` | `transfer_request_details` |
| `final_chance` | `extra_chance` | `extra_chance_details` |
| `file_withdrawal` | `file_withdrawal` | `file_withdrawal_details` |

## Authenticated RPCs

### `submit_b1_student_request_atomic(uuid, text, jsonb, timestamptz, uuid[] DEFAULT '{}') → jsonb`

| | |
|---|---|
| **Inputs** | `p_request_id`, `p_canonical_code` ∈ five codes, `p_form_data`, `p_expected_updated_at`, `p_attachment_ids` |
| **Success** | `{ success:true, request_id, workflow }` |
| **Errors** | `AUTHENTICATION_REQUIRED`, `ACTIVE_STUDENT_PROFILE_REQUIRED`, `B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED`, `B1_STALE_REQUEST_VERSION`, `B1_ACTIVE_REQUEST_TYPE_REQUIRED`, plus dispatcher / workflow / attachment errors |
| **Grants** | `authenticated` EXECUTE; revoke PUBLIC/anon |

### `act_on_b1_student_request_step_atomic(uuid, text, text DEFAULT NULL, jsonb DEFAULT '{}') → jsonb`

| | |
|---|---|
| **Inputs** | `p_step_id`, `p_action` ∈ `{review,approve,clear,apply_decision,archive,reject,return}`, `p_comment`, `p_payload` must be `{}` |
| **Forbidden actions** | `confirm_payment`, `issue_document`, `sign` → `B1_SPECIALIZED_ACTION_RPC_REQUIRED` |
| **Success** | `{ success:true, step_id, action_result, next_step_id, transition_applied:true }` |
| **Errors** | `AUTHENTICATION_REQUIRED`, `B1_ACTIVE_STEP_REQUIRED`, `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`, `B1_ACTION_TYPE_MISMATCH`, `B1_PREDECESSOR_INCOMPLETE`, `B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN`, `B1_ACTION_NOT_SUPPORTED`, `B1_COMMENT_REQUIRED`, transition/invariant failures |
| **Grants** | `authenticated` EXECUTE; revoke PUBLIC/anon |

### `record_external_university_payment_confirmation(uuid, text DEFAULT NULL) → jsonb`

Simplified revenue step. **No amount/currency/invoice/gateway.**

| | |
|---|---|
| **Inputs** | `p_step_id`, optional `p_note` (≤ 2000) |
| **Legacy** | 3-arg `(uuid,text,text)` overload **dropped** — no client status |
| **Success** | `{ success:true, status:'payment_confirmed', request_id, step_id, next_step_id, transition_applied:true }` |
| **Services** | `department_transfer`/`transfer`, `final_chance`/`extra_chance` |
| **Runtime gate** | active `payment_confirmation` + `finance`/`revenue_finance_officer` + `confirm_payment` + exactly one direct assignee + exact processing binding + all prior runtime steps `completed` or `skipped` |
| **Errors** | `AUTH_REQUIRED`, `PAYMENT_CONFIRMATION_NOTE_TOO_LONG`, `PAYMENT_CONFIRMATION_STEP_NOT_FOUND`, `PAYMENT_CONFIRMATION_REQUEST_NOT_FOUND`, `REQUEST_TYPE_NOT_EXTERNAL_PAYMENT_SERVICE`, `INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP`, `PAYMENT_CONFIRMATION_ACTION_MISMATCH`, `EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED`, `DIRECT_PAYMENT_ASSIGNEE_REQUIRED`, `EXACT_FINANCE_PROCESSING_BINDING_REQUIRED`, `B1_PREDECESSOR_INCOMPLETE`, `EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED`, `PAYMENT_CONFIRMED_TRANSITION_REQUIRED`, `NEXT_PAYMENT_WORKFLOW_STEP_NOT_READY` |
| **Auth order** | assignee + exact finance binding first; then predecessor guard (`B1_PREDECESSOR_INCOMPLETE`); then transition resolution / mutations. Non-assignees and wrong-binding actors must not learn predecessor state. |
| **Forward-only fix** | `B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01` / `supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql` — `CREATE OR REPLACE` only; does **not** change signature, success shape, grants, or simplified revenue contract; does **not** edit historical `20260725002135_*`. |
| **Non-path** | No `payment_not_confirmed`; inaction leaves the step active |
| **Grants** | `authenticated` EXECUTE; revoke PUBLIC/anon |

### Secure attachment RPCs

| RPC | Args | Success | Primary errors |
|---|---|---|---|
| `create_student_request_attachment_upload_intent` | `(uuid,text,text,text,bigint,text DEFAULT NULL)` | `{ attachment_id }` | `ATTACHMENT_ACCESS_DENIED`, `ATTACHMENT_REQUEST_NOT_OWNED`, `ATTACHMENT_REQUEST_NOT_EDITABLE`, `ATTACHMENT_FIELD_NOT_ALLOWED`, `ATTACHMENT_MIME_NOT_ALLOWED`, `ATTACHMENT_SIZE_EXCEEDED`, `ATTACHMENT_COUNT_EXCEEDED` |
| `complete_student_request_attachment_upload` | `(uuid)` | attachment metadata jsonb (`status=attached`) | `ATTACHMENT_UPLOAD_NOT_COMPLETED`, `ATTACHMENT_OBJECT_MISMATCH` |
| `list_my_student_request_attachments` | `(uuid)` | `SETOF student_request_attachment_uploads` | empty if unauthorized |
| `get_owned_student_request_attachment_upload` | `(uuid)` | pending owned row set | empty if unauthorized |
| `reject_student_request_attachment` | `(uuid,text)` | `true` | `ATTACHMENT_ACCESS_DENIED` |
| `authorize_student_request_attachment_download` | `(uuid)` | `{ storage_bucket, storage_object_path }` | `ATTACHMENT_ACCESS_DENIED`, `ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED` |

**Field keys:** `excuse_documents` (`excused_absence`), `secondary_certificate` (`department_transfer`). MIME `{pdf,jpeg,png}`; size 1…5 MiB; count 1…3. Bucket `student-request-secure-attachments` (`public=false`). No public URLs.

## Internal RPCs (no authenticated GRANT)

| RPC | Role |
|---|---|
| `persist_validated_b1_request_details(uuid,text,jsonb,uuid[])` | Five-service dispatcher (replaces stub `B1_SERVICE_PERSISTENCE_NOT_INSTALLED`) |
| `assert_b1_academic_period_reference(uuid,uuid)` | → `B1_TRUSTED_ACADEMIC_PERIOD_REQUIRED` |
| `assert_b1_active_course_enrollment(uuid,uuid)` | → `B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED` |
| `assert_b1_target_program_department(uuid,uuid)` | → `B1_TARGET_PROGRAM_DEPARTMENT_REQUIRED` |
| `assert_required_student_request_attachments(uuid,uuid[])` | attachment cardinality/ownership/field |
| `apply_b1_detail_rpc_write_boundaries()` | ACL cutover primitive for three legacy detail tables |

## Per-service `form_data` allowlists

| Service | Keys | Attachments | Key errors |
|---|---|---|---|
| `enrollment_suspension` | `target_academic_year`, `target_semester`, `suspension_reason`, `suspension_duration_type`, `notes`, `terms_acknowledgment` | none | `B1_SUSPENSION_INPUT_INVALID`, `B1_TRUSTED_ACADEMIC_PERIOD_REQUIRED` |
| `excused_absence` | `course_section_id`, `absence_date`, `reason_type`, `absence_reason_detail`, `excuse_documents` | 1–3 `excuse_documents` | `B1_ABSENCE_INPUT_INVALID`, `B1_ABSENCE_EFFECT_ALREADY_APPLIED`, `B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED` |
| `department_transfer` | `target_department_id`, `target_program_id`, `transfer_reason`, `secondary_certificate_file` | 1–3 `secondary_certificate` | `B1_TRANSFER_INPUT_INVALID`, `B1_TARGET_PROGRAM_DEPARTMENT_REQUIRED` |
| `final_chance` | `target_academic_year`, `target_semester`, `reason`, `chance_type` (`final_chance`) | none | `B1_FINAL_CHANCE_INPUT_INVALID`, `B1_FINAL_CHANCE_EFFECT_ALREADY_APPLIED` |
| `file_withdrawal` | `withdrawal_reason`, `impact_acknowledgment` | none | `B1_WITHDRAWAL_INPUT_INVALID`, `B1_WITHDRAWAL_CLEARANCE_ALREADY_APPLIED` |

Shared dispatcher errors: `B1_CANONICAL_CODE_REQUIRED`, `B1_FORM_OBJECT_REQUIRED`, `B1_REQUEST_NOT_FOUND`, `B1_ACTIVE_REQUEST_OWNER_REQUIRED`, `B1_REQUEST_NOT_WRITABLE`, `B1_REQUEST_TYPE_MISMATCH`, `B1_UNEXPECTED_FORM_FIELD`.

## Workflow drafts (inactive)

| Service | Draft code | Steps | Payment |
|---|---|---:|---|
| `enrollment_suspension` | `enrollment_suspension_free_workflow` | 3 | none (`FREE_NO_PAYMENT`) |
| `excused_absence` | `absence_excuse` free workflow | 3 | none |
| `file_withdrawal` | `file_withdrawal_free_workflow` | 7 | none (`clear` on finance) |
| `department_transfer` | `department_transfer_external_payment_workflow` | 6 | `payment_confirmation` / `confirm_payment` |
| `final_chance` | `final_chance_external_payment_workflow` | 5 | `payment_confirmation` / `confirm_payment` |

Invariants: `status='draft'`, `is_active=false`, exactly one direct assignee per step, no `fee_assessment` / ledger steps on paid B1 drafts.

## Promotion sequence (remaining source files)

Already promoted on base (seq 1–7 / runbook 1–6): log_audit, actor hardening, predecessor guard -02, domains, atomic stub, release stamp, simplified payment.

This PR promotes runbook orders **7–18** with paired preflight + post-verifier SQL (not auto-applied):

| Order | Draft | SHA-256 (LF) |
|---:|---|---|
| 7 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql` | `6034c0de0a7a347f576ef8839b730d5c1f1d281ebe74a7ac312266ac92ee2356` |
| 8 | `REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql` | `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` |
| 9 | `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` | `e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205` |
| 10 | `REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql` | `a94233525724f96959568672744b7466a88b22d338298eaf13a6b75319f97df4` |
| 11 | `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` | `febf7a9bedd9d62f6fefe1533784d7e1f8fa7d995ea90a5fc3b16812a392ca71` |
| 12 | `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | `d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284` |
| 13 | `FINAL-CHANCE-CANONICAL-WRITE-03.sql` | `1378250a44374a782b612198262ca9c3a4afb9e87afe449179f5de28b2a2535a` |
| 14 | `REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql` | `7c53e89a0cfa48545d115ee7aad1d08c3cbd8719620663e80d3df2217e2b06e0` |
| 15 | `REQUEST-B1-SERVICE-DETAILS-05A.sql` | `d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c` |
| 16 | `B1-FREE-SERVICE-WORKFLOWS-08.sql` | `1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c` |
| 17 | `EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql` | `64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250` |
| 18 | `REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql` | `55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383` |

Payment confirmation draft SHA (already promoted): `41ab67a1208f926400799d2c6870dd44015e59fbbb9a7d6adaba4faf9d3b7f84`.

## Out of freeze / separate gates

- Gate 19: per-service workflow activation and `student_visible=true`
- Production `supabase db push` / Deploy / Publish
- Enrollment certificate mutations (except regression protection)
- Six deferred request types
