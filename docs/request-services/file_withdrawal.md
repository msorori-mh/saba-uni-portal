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

| # | step_key | unit | role | action_type | assignee (after DOMAINS-EXPANSION-01) |
|---|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` | هيثم الشبلي |
| 2 | `library_clearance` | `library` | `library_officer` | `clear` | ناجي الروقي |
| 3 | `labs_clearance` | `labs` | `labs_manager` | `clear` | محمد حيدر |
| 4 | `activities_clearance` | `student_affairs` | `student_affairs_manager` | `clear` | ياسمين الولص *(interim — no `student_activities` unit is created; activities clearance rides on student_affairs_manager)* |
| 5 | `finance_clearance` | `finance` | `revenue_finance_officer` | `clear` | فارس اليوسفي |
| 6 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` | عبدالله طعيمان |

**Unblocked by** `docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql` (adds `library` + `labs` units and their roles/assignments). The `student_activities` unit is intentionally NOT created — activities clearance is handled by `student_affairs_manager` under the existing `student_affairs` unit until a dedicated activities office is provisioned with real staff.


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
