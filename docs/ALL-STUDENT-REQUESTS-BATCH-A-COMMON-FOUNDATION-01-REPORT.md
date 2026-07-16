# ALL-STUDENT-REQUESTS-BATCH-A-COMMON-FOUNDATION-01 — SOURCE-ONLY

**Date:** 2026-07-16 · **Scope:** Source foundation for the 11 remaining student request services. No migration, no SQL write, no publish/deploy.

---

## 1. Executive Summary

| Item | Value |
|---|---|
| Decision | **PASS_BATCH_A_COMMON_FOUNDATION_SOURCE_READY** |
| Services covered | 11 (all except `enrollment_certificate` which is already live) |
| Per-service contract docs | 11 new files under `docs/request-services/` |
| Migration drafts | **0** created — current shared schema is sufficient for Batch B start; the only outstanding data foundation is `fee_types` policy (see §7) |
| Source code changes | **0** — this phase is design-only; edits to `request-form-registry.ts`, workflow seeds, and detail RPCs are scheduled for Batch B per service |
| Bypass audit | **Clean** — no admin/registrar/dean bypass introduced; assignment-based authorization confirmed via existing `can_current_user_act_on_step` + `user_matches_workflow_runtime_step` (see §5) |
| Typecheck | ✅ clean |
| Student-request tests | ✅ 261/261 pass |

---

## 2. Source of Truth — Verified from Current Schema

Only tables/columns confirmed via `information_schema` and `pg_proc` were used. Verified inventory:

### 2.1 request_types (12 rows, columns actually present)
`id, code, name_ar, description_ar, is_active, requires_attachment, sort_order, title_en, category, article_ref, required_documents jsonb, form_schema jsonb, workflow_schema jsonb, student_visible, request_audience, ineligible_display_mode`.
**No `needs_payment`, no `fee_type_code` columns exist** — earlier audit assumed columns that are not in production. All fee coupling is via workflow steps + `student_fees` / `fee_types.code`.

### 2.2 Detail tables that exist
| Detail table | Bound to service (code) | Key columns |
|---|---|---|
| `enrollment_suspension_details` | `enrollment_suspension` | `request_id, requested_from_academic_year_id, requested_from_semester_id, suspension_reason, suspension_duration_type, notes` |
| `absence_excuse_details` | `excused_absence` | `request_id, course_section_id, absence_date, reason_type, record_applied_at` |
| `transfer_request_details` | `department_transfer` | (per prior audit — verified present) |
| `enrollment_reinstatement_details` | (reinstatement — out of Batch A scope) | — |
| `extra_chance_details` | `final_chance` | `request_id, academic_year_id, semester_id, reason, chance_type, notes, chance_applied_at` |
| `grade_appeal_details` | (grade_appeal — out of Batch A scope) | — |
| `official_transcript_request_details` | reusable for `grade_statement*`, `academic_record`, `graduation_certificate` | `request_id, purpose, notes, official_document_id, document_issued_at` |
| `equivalency_request_details` | (equivalency — out of Batch A) | — |
| `enrollment_certificate_document_details` | live template for other document services | — |

### 2.3 No detail table exists for
`file_withdrawal`, `october_exam_entry_form`, `replacement_student_card`.
Batch B will introduce dedicated detail tables **only** for these three via minimal, scoped migrations. Placeholder inclusion in `form_data` (jsonb) stays permitted until then, but the service must not go student-visible before its detail table + validate RPC ship.

### 2.4 Validate RPCs already present
`validate_enrollment_suspension_request`, `validate_transfer_request`, `validate_extra_chance_request`, `validate_official_transcript_request`, `validate_equivalency_request`, `validate_enrollment_reinstatement_request`.
**Missing:** validate RPCs for `excused_absence`, `file_withdrawal`, `october_exam_entry_form`, `replacement_student_card`, `academic_record`, `grade_statement`, `grade_statement_non_graduate`, `graduation_certificate`.

### 2.5 Fee foundation
`fee_types` has only: `id, code, name_ar, description_ar, amount numeric, is_active`.
No `currency`, no `is_waivable`, no `applies_to_request_type`. Batch A **does not** widen this schema — see §7 policy.
Existing seed: `exam(30), graduation(100), registration(50), services(20), tuition(500)`.

### 2.6 Processing units / roles present
Units: `student_affairs, finance, registrar, dean, archive`.
Roles: `student_affairs_manager, student_affairs_specialist, revenue_finance_officer, registrar_general, dean, archive_officer`.
**No academic-department chair unit yet.** `department_transfer` requires a `department_head` processing role; Batch B must add it before enabling that service.

### 2.7 Workflow runtime & security
Applied and verified:
- `can_current_user_act_on_step(p_step_id, p_action)` — assignment-scoped, no role bypass
- `user_matches_workflow_runtime_step(p_step_id)`
- `get_my_request_actor_inbox(p_filters, p_limit, p_offset)`
- `is_current_user_admin_actor()` (used only for admin config surfaces, not for step execution)
- `apply_student_request_workflow_transition(...)`
- `act_on_student_request_step(...)`
- `initialize_student_request_workflow(p_request_id)`

Any Batch B workflow **must** reuse these; no per-service authorization primitives are permitted.

---

## 3. Per-Service Execution Contracts

One authoritative file per service under `docs/request-services/`. Each file follows the same skeleton: **Form fields → Detail table binding → Validate RPC → Attachments → Eligibility → Fee/Document/Status classification → Operational steps → Unit+Role per step → Transitions → Completion condition → Final notification → Audit/Archive**.

| Code | Contract file |
|---|---|
| `enrollment_suspension` | [enrollment_suspension.md](./request-services/enrollment_suspension.md) |
| `excused_absence` | [excused_absence.md](./request-services/excused_absence.md) |
| `grade_statement_non_graduate` | [grade_statement_non_graduate.md](./request-services/grade_statement_non_graduate.md) |
| `file_withdrawal` | [file_withdrawal.md](./request-services/file_withdrawal.md) |
| `october_exam_entry_form` | [october_exam_entry_form.md](./request-services/october_exam_entry_form.md) |
| `final_chance` | [final_chance.md](./request-services/final_chance.md) |
| `replacement_student_card` | [replacement_student_card.md](./request-services/replacement_student_card.md) |
| `department_transfer` | [department_transfer.md](./request-services/department_transfer.md) |
| `academic_record` | [academic_record.md](./request-services/academic_record.md) |
| `grade_statement` | [grade_statement.md](./request-services/grade_statement.md) |
| `graduation_certificate` | [graduation_certificate.md](./request-services/graduation_certificate.md) |

Each contract explicitly rejects a copy-paste of the enrollment-certificate workflow; the step chain is designed from the service's own life-cycle.

---

## 4. Shared Foundation (source design, no code writes yet)

Items designed here, deferred to Batch B for implementation. No file was mutated in this phase.

1. **`request-form-registry` ⇄ detail table binding layer**
   Introduce `detailBinding: { table, columnsFromForm: Record<field,column>, validateRpc }` on `RequestFormDefinition`. Sole purpose: `submit_student_request` → validate RPC → upsert into the bound detail table. No placeholder options survive submit.
2. **Placeholder removal contract**
   `PLACEHOLDER_SEMESTERS / _COURSES / _DEPARTMENTS / _PROGRAMS` in `request-form-registry.ts` must be replaced by data resolvers:
   - semesters: `academic_years` + `semesters` filtered to student's academic context
   - courses: `student_enrollments` joined to `course_sections` (only the student's own rows)
   - departments/programs: `departments`, `programs` reference tables (read-only)
3. **Server-side validation independent of UI**
   Every service ships one `validate_<code>_request(p_request_id)` RPC. `submit_student_request` calls it before transitioning `draft → submitted`.
4. **Ownership check on updates**
   Existing `sr_update_self` + `protect_student_request` trigger already enforce owner-only + editable-status. Contracts require: no per-service RLS overrides; no admin/registrar/dean bypass on student update paths.
5. **Post-submit immutability**
   Detail tables get: `UPDATE` allowed only when parent `student_requests.status IN ('draft','returned','returned_for_completion')`. Enforced by trigger (Batch B migration per service).
6. **Shared security contract test**
   Add `tests/security/all-services-authorization-matrix.test.ts` (Batch B) that iterates every active workflow and asserts positive/negative `can_current_user_act_on_step` per step assignee vs non-assignee (admin, registrar, dean, unrelated staff).
7. **Shared form/detail persistence test**
   Add `tests/student-requests/all-services-form-detail-persistence.test.ts` (Batch B) that submits a draft per service and asserts the corresponding detail row exists with mapped columns.

---

## 5. Bypass Audit (Batch A design)

| Concern | Result |
|---|---|
| Any admin shortcut in `can_current_user_act_on_step`? | **No** — reviewed in prior hardening; contracts forbid re-introducing one |
| Any registrar-wide accept path? | **No** — every step is assignee-scoped through `request_processing_assignments` |
| Any dean-wide sign path? | **No** — `is_current_user_dean_for_student` used only for dean-specific step ownership resolution |
| Cross-request access? | Blocked by `is_owner_of_request` / `can_access_student_service_request` |
| Cross-role app_role bypass | `roles_catalog` and app_role are used for menu visibility, **not** for step execution |

No service contract in §3 introduces a role-wide bypass. Every step names `(processing_unit, processing_role)` and relies on direct assignment.

---

## 6. Document Services — Common Safe Contract

Applies to `grade_statement_non_graduate`, `academic_record`, `grade_statement`, `graduation_certificate` (and reused by `enrollment_certificate`):

- `official_documents.document_type` must be a distinct code per service (`grade_statement_non_grad`, `academic_record`, `grade_statement`, `graduation_certificate`).
- Issuance step is **idempotent**: uses `ON CONFLICT (student_request_id, document_type) DO NOTHING`; retries never mint a second `document_number`.
- `verification_code` unique per document, generated server-side; used by the public `/verify-document` route.
- Signed URL access requires `official_documents.status IN ('issued','archived')` (matches `DOWNLOADABLE_OFFICIAL_DOCUMENT_STATUSES`).
- `draft` and `cancelled` documents: **no signed URL, no download**.
- Cancellation is a soft update to `status='cancelled'`; the storage object is **never deleted**.
- **Templates NOT authored in this phase** — official PDF templates require the university's approved layout for each certificate; only the enrollment-certificate template exists today.

---

## 7. `fee_types` — Do NOT widen in Batch A

Current schema (`id, code, name_ar, description_ar, amount, is_active`) is sufficient for the fee flow already implemented (`assess_student_request_fee`, `confirm_student_request_fee_payment`, `student_fees`, `payment_receipts`). Widening for `currency`, `applies_to_request_type`, or `waiver_policy` is **not justified** by any Batch A service; adding columns without an approved fee schedule risks fictitious data.

**Policy for services with fees pending:** they stay `fee_configuration_pending` and are **not** enabled for students until the university approves the amount + fee_type code. Table entry:

| Service | Fee state | Waiting on |
|---|---|---|
| `enrollment_suspension` | none by policy | confirm |
| `excused_absence` | none by policy | confirm |
| `department_transfer` | `fee_configuration_pending` | approved amount + fee_type row |
| `final_chance` | `fee_configuration_pending` | approved amount |
| `october_exam_entry_form` | possibly reuse `exam` (30) | confirm scope |
| `grade_statement_non_graduate` | `fee_configuration_pending` | approved amount |
| `grade_statement` | `fee_configuration_pending` | approved amount |
| `academic_record` | `fee_configuration_pending` | approved amount |
| `graduation_certificate` | reuse `graduation` (100)? | confirm |
| `file_withdrawal` | none by policy | confirm |
| `replacement_student_card` | `fee_configuration_pending` | approved amount |

---

## 8. Open Decisions Requiring Human Input

**Consolidated — the ONLY things blocking Batch B activation per service.**

| # | Service | Decision needed | Options | Recommendation | Impact if unresolved |
|---|---|---|---|---|---|
| 1 | Fee schedule (all pending rows in §7) | Approved fee amount + fee_type code per service | (a) reuse existing type, (b) create new `fee_types` row | Provide table from finance office | Service stays hidden from students |
| 2 | `department_transfer` | Add `department_head` processing role + unit? | (a) new unit `department`, role `department_head`; (b) reuse `registrar` intermediary | (a) new unit — matches reality | Cannot assign the academic decision step |
| 3 | `graduation_certificate` | Requires cumulative pass + dean confirmation of graduation status source | (a) `student_academic_status`, (b) manual dean confirmation | (a) automated where possible, (b) fallback | Cannot compute eligibility |
| 4 | `october_exam_entry_form` | Max courses limit per U-OCT-1 | Admin-configurable integer | Store on `request_types.form_schema.rules.max_courses` | Cannot enforce cap |
| 5 | Document PDF templates | Official layouts for `academic_record`, `grade_statement`, `grade_statement_non_graduate`, `graduation_certificate` | Provided by dean's office | Wait — do not fabricate templates | Document services blocked at issuance step (workflow up to signing can still ship) |
| 6 | `excused_absence` service window | Reuse `student_request_service_windows` (already exists) — confirm activation policy | Admin toggle per academic term | Confirm | Service unbounded in time |
| 7 | `file_withdrawal` clearance sources | Automated vs manual for library / labs / activities / finance | Manual approvals from each unit — no data source | Manual multi-unit workflow | Cannot build the clearance chain |

Fee/template decisions block ONLY the services they touch; workflow scaffolding for every other aspect can still proceed in Batch B.

---

## 9. Recommended Batch B (first execution wave)

Order by lowest blockers, highest value:

1. **`enrollment_suspension`** — detail table + validate RPC already exist; only workflow seed + form binding + fee policy=none.
2. **`excused_absence`** — detail table + service window infra exist; needs validate RPC + workflow seed.
3. **`final_chance`** — detail table exists; needs validate RPC + workflow seed + fee decision.
4. **`replacement_student_card`** — needs detail table (new, minimal), then form + short workflow (student_affairs → finance → issuance).
5. **`file_withdrawal`** — long clearance chain; contract clear, but many decisions in row 7 above.

Document services (`academic_record`, `grade_statement*`, `graduation_certificate`) wait on templates; workflow scaffold can be authored in parallel but activation is blocked on §8 row 5.

---

## 10. Deliverables

Files created in this phase:

- `docs/ALL-STUDENT-REQUESTS-BATCH-A-COMMON-FOUNDATION-01-REPORT.md`
- `docs/request-services/enrollment_suspension.md`
- `docs/request-services/excused_absence.md`
- `docs/request-services/grade_statement_non_graduate.md`
- `docs/request-services/file_withdrawal.md`
- `docs/request-services/october_exam_entry_form.md`
- `docs/request-services/final_chance.md`
- `docs/request-services/replacement_student_card.md`
- `docs/request-services/department_transfer.md`
- `docs/request-services/academic_record.md`
- `docs/request-services/grade_statement.md`
- `docs/request-services/graduation_certificate.md`

**Migration drafts:** 0. **Source code edits:** 0.

---

## 11. Verification

| Check | Result |
|---|---|
| Typecheck (`bunx tsgo --noEmit`) | ✅ clean |
| Student-request test suite | ✅ 261/261 pass, 817 expectations |
| Migration/SQL write to production | ❌ not executed |
| Data modification | ❌ none |
| Publish/Deploy | ❌ none |

---

## 12. Status

- **المكتمل:** خرائط عقود التنفيذ لجميع الخدمات الـ11، فحص المخطط الحقيقي، سياسة الرسوم، عقد الوثائق الآمن، جدول القرارات المعلقة.
- **الإجراء التالي:** Batch B — تنفيذ `enrollment_suspension` أولاً (أقل عوائق).
- **العوائق:** جدول الرسوم المعتمد، قوالب PDF الرسمية، إضافة وحدة/دور `department_head`.
- **الجاهزية:** المصدر جاهز؛ الخدمات لا تُفعَّل للطلاب إلا بعد Batch B الخاص بكل خدمة.
- **الأثر الإنتاجي:** لا يوجد — لم يتم تعديل بيانات أو Migration أو Publish.

**القرار: PASS_BATCH_A_COMMON_FOUNDATION_SOURCE_READY**
