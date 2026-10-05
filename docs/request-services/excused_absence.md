# Contract — `excused_absence` (غياب بعذر)

Source: `request_types.code='excused_absence'`, detail table `absence_excuse_details` (one row per absence date/section). No validate RPC yet — Batch B must create `validate_excused_absence_request`.

## Form fields → detail binding
Repeatable rows in `absence_excuse_details`:
| Form field | Column |
|---|---|
| `course_section_id` (select from student's `student_enrollments` for the active term) | `course_section_id` |
| `absence_date` (date within service window) | `absence_date` |
| `reason_type` (select: `medical`, `family_emergency`, `official`, `other`) | `reason_type` |
| `absence_reason_detail` (textarea) | — persisted to `student_requests.form_data` |

Placeholder course list removed; sourced from `student_enrollments` JOIN `course_sections` filtered to caller.

## Attachments
Required: `excuse_documents` (at least 1). `requires_attachment=true` already set.

## Eligibility
- Student `status='active'`.
- Absence date within `student_request_service_windows` for `excused_absence`.
- Student is enrolled in the referenced `course_section_id`.
- No duplicate accepted excused_absence for the same `(course_section_id, absence_date)`.
- The student MUST have a department (`student_profiles.department_id`): the form is signed by the head of the student's own department. Missing department → student-facing `B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED` (client notice before submit, server refusal at submit). A department without exactly one effective head fails closed with the staff-facing `B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED`.

## Classification
- **Type:** status decision, updates attendance record on approval.
- **Fee:** decided per request by the college registrar — `REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT`. Exactly two outcomes: `FEE_REQUIRED` (the student pays in the university's main system; the revenue officer confirms manually in `payment_confirmation`) or `FEE_NOT_REQUIRED` with a mandatory reason (`FREE_SERVICE` / `EXEMPTION`), which skips `payment_confirmation`. The decision is recorded only through `record_excused_absence_fee_decision`, only by the registrar step's direct assignee, and is immutable. No amount, currency, invoice or gateway inside the portal.

## Operational steps
Target cycle `excused_absence_external_payment_workflow` (EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — source/draft only until the migration draft is promoted and applied; see `docs/reviews/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.md`).

| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `dean_review` | `dean` | `dean` | `review` |
| 2 | `registrar_fee_referral` | `registrar` | `registrar_general` | `review` (via the fee-decision RPC only) |
| 3 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` (skipped when `FEE_NOT_REQUIRED`) |
| 4 | `department_head_signature` | `department` | `department_head` (student's own department) | `approve` |
| 5 | `dean_signature` | `dean` | `dean` | `approve` |
| 6 | `student_affairs_manager_signature` | `student_affairs` | `student_affairs_manager` | `approve` |
| 7 | `record_apply` | `registrar` | `registrar_general` | `apply_decision` (`REGISTER_EXCUSED_ABSENCE`) |
| 8 | `archive` | `archive` | `archive_officer` | `archive` |

Signatures are `approve` steps: the B1 atomic executor has no `sign` action and a signature creates no document, PDF or storage artifact.

### Retired cycle (in-flight requests only)
`excused_absence_free_workflow` v1/v2 — requests submitted before the cut-over finish on their own snapshot, with no payment and no signatures.

| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `manager_review` | `student_affairs` | `student_affairs_manager` | `approve` |
| 3 | `record_apply` | `student_affairs` | `student_affairs_specialist` | `apply_decision` |

## Transitions
17 transitions: the linear chain 1→2→3→4→5→6→7→8→completed, one conditional branch 2→4 (`EXCUSED_ABSENCE_FEE_NOT_REQUIRED`, payment step marked `skipped`), five reject exits and two return exits.

| step | reject | return to student |
|---|---|---|
| `dean_review`, `registrar_fee_referral` | yes | yes |
| `department_head_signature`, `dean_signature`, `student_affairs_manager_signature` | yes | no |
| `payment_confirmation`, `record_apply`, `archive` | no | no |

Reject / return exist for this service's new cycle only, need a reason (5–2000 chars) and are authorized exactly like acting on the step. Reject → `rejected` (terminal, immutable, no resubmission). Return → `returned_for_completion`; resubmission restarts at `dean_review` on the same workflow version. The other B1 services and the retired cycle still expose no return/reject.

## Notifications
One notification to the request's student, through `create_notification`: at the fee decision (pay in the main system / no payment needed + reason), at return (with the reason) and at reject (existing trigger, with the reason).

## Completion condition
`absence_excuse_details.record_applied_at` is set for every included row (written at `record_apply`) AND request `status='completed'` (reached at `archive`).

## Final notification
«تم قبول عذر الغياب لتاريخ …»؛ رفض مع السبب («تم رفض طلب غياب بعذر» / «سبب الرفض: …»).

## Audit / archive
No document. Attachments persist in `student_request_attachments` (immutable after submit unless `returned`).

## Bypass check
No admin / registrar / dean override. Each step is acted on only by its single direct assignee holding the step's exact unit and role; the department-head signature belongs to the head of the student's own department only.
