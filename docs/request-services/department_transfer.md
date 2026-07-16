# Contract — `department_transfer` (تحويل من قسم إلى قسم)

Source: `request_types.code='department_transfer'`, detail table `transfer_request_details`, validate RPC `validate_transfer_request` (all exist).

## Form fields → binding
| Form field | Column |
|---|---|
| `current_department_id` (readonly, from student profile) | — |
| `current_program_id` (readonly) | — |
| `target_department_id` (select from `departments`) | `transfer_request_details.target_department_id` (verify column presence in Batch B) |
| `target_program_id` (select from `programs` filtered by target dept) | `transfer_request_details.target_program_id` |
| `transfer_reason` (textarea, required) | `transfer_request_details.transfer_reason` |
| `notes` | `transfer_request_details.notes` |

Placeholder department/program lists removed; sourced from `departments` + `programs` reference tables.

## Attachments
Required: `secondary_certificate`. `requires_attachment=true` already set.

## Eligibility
- Student `status='active'`.
- Target department/program `is_active=true`.
- Not the same as current department + program.
- Cumulative GPA meets target program threshold (rule to encode in `validate_transfer_request`).

## Classification
- **Type:** academic decision, no PDF.
- **Fee:** `fee_configuration_pending` (report §8 row 1).
- **Outcome:** on approval, update `student_profiles.department_id/program_id` + create equivalency records (via `equivalency_courses` — separate follow-up).

## Operational steps
| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `source_department_head_approval` | *(pending unit `department`, role `department_head`)* | — | `approve` |
| 3 | `target_department_head_approval` | *(pending unit `department`, role `department_head`)* | — | `approve` |
| 4 | `dean_approval` | `dean` | `dean` | `approve` |
| 5 | `fee_assessment` | `finance` | `revenue_finance_officer` | `assess_fee` |
| 6 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
| 7 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` |

**Blocker:** the `department` processing unit and `department_head` role do not yet exist (report §8 row 2). Steps 2 and 3 cannot be assigned until Batch B adds them.

## Transitions
Return/reject at steps 1, 2, 3, 4. Fee steps guard-skipped when fee=0.

## Completion condition
`student_profiles` reflects new department/program AND request completed AND equivalency review record initialized.

## Final notification
«تمت الموافقة على تحويلك إلى قسم …».

## Bypass check
No admin/registrar bypass on academic approval steps; each department_head step is scoped to the specific assigned chair for the source/target department (assignment_type = `department_position`).
