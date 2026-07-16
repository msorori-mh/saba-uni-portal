# Contract — `enrollment_suspension` (وقف قيد)

Source: `request_types.code='enrollment_suspension'`, detail table `enrollment_suspension_details`, validate RPC `validate_enrollment_suspension_request` (all present in production).

## Form fields → detail binding
| Form field | Column in `enrollment_suspension_details` |
|---|---|
| `target_academic_year` (select from `academic_years`) | `requested_from_academic_year_id` |
| `target_semester` (select from `semesters`, filtered by year) | `requested_from_semester_id` |
| `suspension_reason` (textarea, required) | `suspension_reason` |
| `suspension_duration_type` (select: `one_semester`, `full_year`) | `suspension_duration_type` |
| `notes` (textarea, optional) | `notes` |
| `terms_acknowledgment` (checkbox, required, form_data only) | — (not persisted) |

Placeholder options must be removed; year/semester lists come from `academic_years` + `semesters` reference tables.

## Attachments
None required. `requires_attachment=false`.

## Eligibility (server-side, in `validate_enrollment_suspension_request`)
- Student `status='active'`.
- Requested semester is current or upcoming (not past).
- No overlapping approved suspension for the same period.
- Max prior suspensions per policy — decision pending (see report §8).

## Classification
- **Type:** status decision, no document.
- **Fee:** none.
- **Outcome:** update `student_academic_status` on approval.

## Operational steps
| # | step_key | unit | role | action_type | status_on_enter |
|---|---|---|---|---|---|
| 1 | `initial_review` | `student_affairs` | `student_affairs_specialist` | `review` | `in_review` |
| 2 | `manager_approval` | `student_affairs` | `student_affairs_manager` | `approve` | `manager_review` |
| 3 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` | `finalizing` |

## Transitions
- 1 → 2 approve; 1 → student return; 1 → reject.
- 2 → 3 approve; 2 → 1 return; 2 → reject.
- 3 → completed (`status='completed'`, `student_academic_status` row inserted/updated).

## Completion condition
`student_academic_status` reflects suspended state for the requested period AND `student_requests.status='completed'`.

## Final notification
`student_request_completed`, message: «تمت الموافقة على وقف قيدك للفصل …» (or rejection notification with reason).

## Audit / archive
No document. Archive step: NONE (no artifact to store). Rely on `student_request_workflow_events` full trail.

## Bypass check
Every step uses `can_current_user_act_on_step`. No admin/registrar/dean role-wide bypass; step 3 is scoped to the assigned registrar_general user only.
