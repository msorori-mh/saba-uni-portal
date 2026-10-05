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

## Classification
- **Type:** status decision, updates attendance record on approval.
- **Fee:** paid — `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`. The student pays in the university's main system after the registrar's referral; the revenue officer confirms manually in `payment_confirmation`. No amount, currency, invoice or gateway inside the portal.

## Operational steps
Target cycle `excused_absence_external_payment_workflow` (EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — source/draft only until the migration draft is promoted and applied; see `docs/reviews/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.md`).

| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `dean_review` | `dean` | `dean` | `review` |
| 2 | `registrar_fee_referral` | `registrar` | `registrar_general` | `review` |
| 3 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
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
Single unconditional chain 1→2→3→4→5→6→7→8→completed (`reviewed`, `reviewed`, `payment_confirmed`, `approved`, `approved`, `approved`, `applied`, `archived`). No fee branch. The deployed B1 executor exposes no return/reject action on any step.

## Completion condition
`absence_excuse_details.record_applied_at` is set for every included row (written at `record_apply`) AND request `status='completed'` (reached at `archive`).

## Final notification
«تم قبول عذر الغياب لتاريخ …»؛ رفض مع السبب.

## Audit / archive
No document. Attachments persist in `student_request_attachments` (immutable after submit unless `returned`).

## Bypass check
No admin / registrar / dean override. Each step is acted on only by its single direct assignee holding the step's exact unit and role; the department-head signature belongs to the head of the student's own department only.
