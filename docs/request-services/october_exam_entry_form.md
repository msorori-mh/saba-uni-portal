# Contract — `october_exam_entry_form` (استمارة دخول دور أكتوبر)

Source: `request_types.code='october_exam_entry_form'`. **No detail table exists** — Batch B creates `october_exam_entry_details (request_id, academic_year_id, semester_id, selected_course_sections uuid[], limit_ack boolean, approved_list_generated_at timestamptz)`. Validate RPC: `validate_october_exam_entry_request`.

## Form fields → binding
| Form field | Column |
|---|---|
| `academic_year_id` (select) | `october_exam_entry_details.academic_year_id` |
| `semester_id` (select) | `october_exam_entry_details.semester_id` |
| `selected_course_sections` (multi_select from student's failed/pending sections) | `october_exam_entry_details.selected_course_sections` |
| `admin_limit_acknowledgment` (checkbox) | `october_exam_entry_details.limit_ack` |

Courses sourced from `student_grades` where `current_grade_status IN ('failed','incomplete')` for the target term.

## Attachments
None.

## Eligibility
- Student `status='active'`.
- Selected sections count ≤ `request_types.form_schema.rules.max_courses` (admin-configurable — report §8 row 4).
- Only sections the student is actually enrolled in and failed/incomplete.

## Classification
- **Type:** admin-issued list (Kashaf), no student-facing PDF at issuance.
- **Fee:** possibly reuse `exam(30)` × selected count — decision pending.

## Operational steps
| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_review` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `fee_assessment` | `finance` | `revenue_finance_officer` | `assess_fee` |
| 3 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
| 4 | `registrar_final_list` | `registrar` | `registrar_general` | `apply_decision` |

## Transitions
Approve chain 1→2→3→4. Steps 2/3 skipped if final fee policy = 0.

## Completion condition
`october_exam_entry_details.approved_list_generated_at` set; `student_requests.status='completed'`.

## Final notification
«تم اعتماد استمارة دور أكتوبر — عدد المقررات …».

## Bypass check
Each step assignee-scoped.

## Blockers
Max-courses rule + fee decision (report §8 rows 1, 4).
