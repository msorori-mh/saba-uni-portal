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
- **Fee:** none.

## Operational steps
| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `manager_review` | `student_affairs` | `student_affairs_manager` | `approve` |
| 3 | `record_apply` | `student_affairs` | `student_affairs_specialist` | `apply_decision` |

## Transitions
Approve chain 1→2→3→completed. Return/reject at 1 and 2.

## Completion condition
`absence_excuse_details.record_applied_at` is set for every included row AND request `status='completed'`.

## Final notification
«تم قبول عذر الغياب لتاريخ …»؛ رفض مع السبب.

## Audit / archive
No document. Attachments persist in `student_request_attachments` (immutable after submit unless `returned`).

## Bypass check
No academic-role override; only assigned student-affairs users can act.
