# Contract — `file_withdrawal` (سحب ملف)

Source: `request_types.code='file_withdrawal'`. **No detail table exists** — Batch B must add `file_withdrawal_details (request_id, withdrawal_reason, impact_ack, library_cleared_at, labs_cleared_at, activities_cleared_at, finance_cleared_at, records_transferred_at, notes)`. Validate RPC to create: `validate_file_withdrawal_request`.

## Form fields → binding
| Form field | Column |
|---|---|
| `withdrawal_reason` (textarea, required) | `file_withdrawal_details.withdrawal_reason` |
| `impact_acknowledgment` (checkbox, required) | `file_withdrawal_details.impact_ack` |

## Attachments
None required initially; clearance evidence attached per clearance step by staff.

## Eligibility
- Student `status IN ('active','suspended')`.
- No pending grade appeal or enrollment_certificate in-flight.

## Classification
- **Type:** status change (student file withdrawn from college).
- **Fee:** none (subject to confirmation).
- **Outcome:** update `student_academic_status` to `withdrawn` on completion.

## Operational steps — clearance chain
Each clearance step gates the next; every step is a distinct approval by a distinct assigned unit.

| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `library_clearance` | **BLOCKED** — no `library` unit in `request_processing_units` (staff exists: ناجي الروقي, role_type=`library_officer`) | — | `clear` |
| 3 | `labs_clearance` | **BLOCKED** — no `labs` unit (staff exists: محمد حيدر, role_type=`labs_manager`) | — | `clear` |
| 4 | `activities_clearance` | **BLOCKED** — no `student_activities` unit and no matching active staff role | — | `clear` |
| 5 | `finance_clearance` | `finance` | `revenue_finance_officer` | `clear` |
| 6 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` |

**Blocker (verified 2026-07-16 preflight):** `request_processing_units` only contains `{archive, dean, finance, registrar, student_affairs}`. Even though `staff_profiles.role_type` values `library_officer` and `labs_manager` exist for real staff (ناجي الروقي, محمد حيدر), they have **no active row in `request_processing_assignments`** and their units are absent from `request_processing_units`/`request_processing_roles`. Batch B must either (a) add `library` + `labs` + `student_activities` units and roles and create assignments for those staff members, or (b) fall back to a single `student_affairs_manager` (ياسمين الولص) multi-checkbox clearance step under the existing `student_affairs` unit. Decision required before Batch B implementation.


## Transitions
Any clearance step may return to student or reject. Steps 2–5 do **not** run in parallel in Batch B v1 — sequential to keep the chain auditable; parallelization is a later enhancement.

## Completion condition
All clearance timestamps set AND `student_academic_status.status='withdrawn'` AND request completed.

## Final notification
«تم سحب ملفك من الكلية بتاريخ …».

## Audit / archive
No document. All clearance actions written to `student_request_workflow_events`.

## Bypass check
No role-wide bypass — each clearance step must be executed by its own assigned staff user.
