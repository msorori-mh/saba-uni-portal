# STUDENT-REQUESTS-8-SERVICES-COMMON-FOUNDATION-EXECUTION-PREFLIGHT-01

Read-only preflight audit. **No SQL writes, no migration apply, no storage/auth changes, no deploy/publish, no request-type activation, and the E2E pilot request was not touched.** All findings below come from `supabase--read_query`-class SELECTs and file reads against commit `2c4e1dfb06d4522d3d43a1e4d8ac8d36a02a8420`.

- Project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase: `wpmicqriltrowwonknox`
- Repo: `msorori-mh/saba-uni-portal` @ `main`

---

## 1) Eight-Service Matrix

| # | code | name_ar | audience | is_active | student_visible | ineligible_display_mode | requires_attachment | Typed details table | Workflow rows | Ready % |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `enrollment_suspension` | وقف قيد | active_student | ✅ | ❌ | hidden | ❌ | `enrollment_suspension_details` ✅ | — | 55% |
| 2 | `grade_statement_non_graduate` | شهادة تقديرات لغير الخريجين | active_student | ✅ | ❌ | hidden | ❌ | ❌ (none — uses `form_data`) | — | 35% |
| 3 | `enrollment_certificate` | شهادة قيد | active_student | ❌ (E2E closed) | ❌ | hidden | ❌ | n/a (document-only) | v1 draft + v2 active ✅ | 90% (blocked by E2E policy) |
| 4 | `department_transfer` | التحويل من قسم إلى قسم آخر | active_student | ✅ | ❌ | hidden | ✅ | `transfer_request_details` ✅ | — | 50% |
| 5 | `file_withdrawal` | سحب ملف | active_student | ✅ | ❌ | hidden | ❌ | ❌ | — | 25% |
| 6 | `october_exam_entry_form` | استمارة دخول دور أكتوبر | active_student | ✅ | ❌ | hidden | ❌ | ❌ (needs course-list children) | — | 20% |
| 7 | `excused_absence` | غياب بعذر | active_student | ✅ | ❌ | hidden | ✅ | `absence_excuse_details` ✅ | — | 60% |
| 8 | `grade_appeal` (التظلم) | — | **NOT PRESENT** in `request_types` | — | — | — | — | `grade_appeal_details` ✅ (orphan) | — | 15% |

Notes:
- Only `enrollment_certificate` has any `request_type_workflows` rows. All other seven services need workflow authoring end-to-end.
- التظلم has typed table `grade_appeal_details` but no matching `request_types.code`. Provisionally use `grade_appeal` in this preflight; do not create in this phase.

---

## 2) Runtime Contract (verified from live constraints)

### `request_type_workflow_steps.action_type` (CHECK)
`review`, `approve`, `reject`, `comment`, `return_to_student`, `request_attachment`, `request_payment`, `assess_fee`, `confirm_payment`, `sign`, `archive`, `issue_document`, `complete`

### `request_type_workflow_transitions.action_result` (CHECK)
`submit`, `approve`, `reject`, `return`, `request_attachment`, `request_payment`, `fee_not_required`, `payment_required`, `payment_confirmed`, `signed`, `issued`, `archived`, `skip`, `complete`, `cancel`

### Assignment strategies (CHECK)
`role_pool`, `specific_user`, `department_position`, `college_position`, `requester_department_head`, `dean`, `manual`

### Step flags
`can_return_to_student`, `can_reject`, `can_skip`, `requires_attachment`, `requires_payment`, `produces_document`, `visible_to_student`, `notify_on_enter`, `notify_on_complete`, `form_schema`, `config`.

**Confirmed:** `reject` and `return` are first-class transitions AND action_types — the earlier concern that they were absent is not correct on this main.

### SQL functions currently owning runtime
`create_student_request`, `submit_student_request`, `initialize_student_request_workflow`, `apply_student_request_workflow_transition`, `act_on_student_request_step`, `assess_student_request_fee`, `confirm_student_request_fee_payment`, `get_student_request_detail_for_actor`, `get_my_student_requests`, `check_student_request_basic_eligibility`, `student_request_type_is_eligible`, `student_request_ineligible_status_message`, `get_student_request_eligibility_context`, `notify_student_request_decision`, `protect_student_request`, `admin_get_request_workflow_config`, `admin_save_request_workflow_config`, `assert_can_activate_request_workflow`.

E2E-scoped (must NOT touch pre-merge): `_assert_enrollment_certificate_e2e_processing_assignments`, `_enrollment_certificate_e2e_load_hidden_type`, `admin_create_enrollment_certificate_e2e_draft`, `admin_set_enrollment_certificate_e2e_submit_window`, `assert_can_admin_enrollment_certificate_e2e`.

### PR #124 expected overlap (per prior planning)
Modifies: `act_on_student_request_step`, `apply_student_request_workflow_transition`, `admin_save_request_workflow_config`, `initialize_student_request_workflow`, plus new columns on `request_type_workflow_steps` (parallel group hooks). **Do not edit these functions in the same PR; land PR #124 first.**

Safe to author independently:
- `request_types` catalog rows and typed-details schemas.
- New typed-details tables (e.g., `file_withdrawal_details`, `october_exam_entry_details` + child rows, `grade_statement_request_details`).
- Seed data for `request_processing_units`/`roles`/`assignments` (missing roles below).
- Row-level `check_student_request_basic_eligibility` per-type branches (additive).
- Workflow authoring via `admin_save_request_workflow_config` post-merge.

---

## 3) Roles & Assignments Matrix (current state)

| Required actor | Unit present | Role present | Active assignment | Contextual (dept-scoped)? | Gap / Action |
|---|---|---|---|---|---|
| مختص شؤون الطلاب | `student_affairs` ✅ | `student_affairs_specialist` ✅ | ✅ (staff_profile, unscoped) | ❌ | OK |
| مدير شؤون الطلاب | `student_affairs` ✅ | `student_affairs_manager` ✅ | ✅ | ❌ | OK |
| موظف الإيرادات | `finance` ✅ | `revenue_finance_officer` ✅ | ✅ | ❌ | OK |
| المسجل العام | `registrar` ✅ | `registrar_general` ✅ | ✅ | ❌ | OK |
| عميد الكلية | `dean` ✅ | `dean` ✅ | ✅ (faculty_profile) | ❌ | OK |
| موظف الأرشيف | `archive` ✅ | `archive_officer` ✅ | ✅ | ❌ | OK |
| رئيس القسم (بحسب قسم الطالب) | ❌ | ❌ | ❌ | required ✅ | **CREATE unit `department_head_office` + role `department_head` + department-scoped assignments** (use step strategy `requester_department_head` or `department_position`) |
| مسجل الكلية | ❌ | ❌ | ❌ | — | Missing. Owner decision: reuse `registrar_general`, or add role `college_registrar` under new unit. Blocks `department_transfer` step. |
| مدير شؤون الخريجين | ❌ | ❌ | ❌ | — | Not needed for the eight (graduate-only flows). Defer. |
| موظف المكتبة | ❌ | ❌ | ❌ | required for `file_withdrawal` parallel | **CREATE** unit `library` + role `library_officer`. |
| مسؤول المعامل | ❌ | ❌ | ❌ | required for `file_withdrawal` parallel | **CREATE** unit `labs` + role `labs_officer`. |
| مسؤول الأنشطة الطلابية | ❌ | ❌ | ❌ | required for `file_withdrawal` parallel | **CREATE** unit `student_activities` + role `student_activities_officer`. |

Gap-blocker set (owner decision): `department_head`, `college_registrar`, `library_officer`, `labs_officer`, `student_activities_officer`.

---

## 4) Shared Foundation Design (per-service common controls)

1. **Service window** — add `submit_window_opens_at`/`submit_window_closes_at` and `window_status` (open/closed) to `request_types`; enforce in `check_student_request_basic_eligibility` and `create_student_request`.
2. **Audience** — keep `request_audience` (`active_student` / `graduate` / `both`) already present; extend eligibility function to honour `both`.
3. **Disabled vs Hidden** — keep `is_active` + `student_visible` + `ineligible_display_mode`. Add `disabled_reason_ar` column on `request_types` for owner-controlled banner.
4. **Fees & receipts** — reuse existing `assess_student_request_fee` / `confirm_student_request_fee_payment`; add `student_request_fee_assessments.receipt_ref` (owner-approved).
5. **Payment notifications** — reuse `notify_student_request_decision` extended with `payment_required` / `payment_confirmed` events.
6. **Parallel approvals for `file_withdrawal`** — depends on PR #124 parallel-group runtime (`student_request_parallel_groups`, `student_request_parallel_group_members`). Do not author until merge.
7. **Current-semester course picker** — add server fn reading `class_schedule` × `student_enrollments` for the student's current semester (used by `excused_absence`, `october_exam_entry_form`).
8. **Previous-semester course picker** — same fn parameterised by `semester_id` (used by `grade_statement_non_graduate`, `grade_appeal`).
9. **October attempt cap** — enforce at typed-details insert level: unique `(student_profile_id, academic_year_id, semester_id)` and `count(courses) <= config.max_courses` per settings row.
10. **Transfer & equivalency** — link `transfer_request_details.requested_program_id` to `equivalency_request_details` created after دean approval; keep decoupled (owner may run manually first).
11. **Auto-reinstatement after suspension** — add trigger on `enrollment_suspension_details.record_applied_at` to create `enrollment_reinstatement_details` when duration elapses (Batch D).
12. **Aggregated reports** — new server fns for october cohort and appeals cohort (read-only) — Batch D.
13. **Student-visible current unit** — closes the existing `CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP` from `student-request-unit-label.ts`: expose `current_unit_name_ar` from `get_my_student_requests` / detail RPC.

---

## 5) Proposed Migration Batches (no apply)

**Batch A — Runtime & shared roles** (independent of PR #124):
- `add_request_type_service_window_and_disabled_reason.sql`
- `create_processing_units_roles_department_head_library_labs_activities.sql` + seed assignments (owner-provided).
- Post-test: `SELECT` matrix in §3 shows all roles active.
- Stop-on-partial: reject unless all new units + roles inserted transactionally.

**Batch B — Typed details & catalog rows** (independent):
- `create_file_withdrawal_details.sql`
- `create_october_exam_entry_details_and_courses.sql`
- `create_grade_statement_request_details.sql` (holds `semester_id`, `include_all_taken`)
- `insert_request_type_grade_appeal.sql` (owner-decided code).
- Post-test: `\d` shape + `SELECT` catalog list.

**Batch C — Workflows & transitions** (**after PR #124 merged**):
- Author via `admin_save_request_workflow_config` using idempotent seed scripts.
- One migration per request type; each includes steps, transitions, and required strategies (`requester_department_head` for dept-head steps).
- Depends on Batch A roles.

**Batch D — Reports, notifications, schedulers**:
- `create_october_and_appeals_report_views.sql`
- `create_auto_reinstatement_trigger.sql`
- `extend_notify_student_request_decision_payment_events.sql`
- Independent of Batch C but depends on Batch B tables.

Migrations author only — **not applied in this phase**.

---

## 6) Fast Execution Plan (post-merge of PR #124)

**Package 1 — Common foundation & roles** (sequential):
Batch A → Batch B (typed details only) → verify.

**Package 2 — Forms & workflows for the eight** (parallel per service, sequential inside each):
- `enrollment_suspension`, `grade_statement_non_graduate`, `enrollment_certificate` reactivation, `excused_absence` can proceed in parallel.
- `department_transfer` waits for owner decision on `college_registrar`.
- `file_withdrawal` waits for parallel-group runtime from PR #124.
- `october_exam_entry_form` and `grade_appeal` wait on Batch B tables.

**Package 3 — E2E & staged activation** (sequential, one service at a time):
Toggle `is_active`+`student_visible`+`window` per service after E2E green.

---

## 7) Owner-Decision Blockers

- Code + Arabic name for التظلم (`grade_appeal`).
- Whether `college_registrar` is a distinct role or aliases `registrar_general`.
- Whether department-head assignment is via `requester_department_head` strategy (auto) or explicit `department_position` seeding.
- Fee schedules per service (currently 0 for the E2E flow only).
- Which staff members fill the new library/labs/activities roles.

---

## 8) Confirmation

- Zero `INSERT`/`UPDATE`/`DELETE`/`ALTER`/migration applied.
- `enrollment_certificate` remains `is_active=false`, `student_visible=false`; the E2E request row was not read/written by this audit.
- Only SELECT-class queries and file reads performed.

**Decision:** `PASS_STUDENT_REQUESTS_8_SERVICES_COMMON_FOUNDATION_PREFLIGHT_READY_FOR_IMPLEMENTATION`
(subject to owner decisions in §7; `department_transfer` and `file_withdrawal` carry conditional `HOLD` sub-flags until roles + PR #124 land).
