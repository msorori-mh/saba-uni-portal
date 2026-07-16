# Contract — `final_chance` (فرصة أخيرة)

Source: `request_types.code='final_chance'`. Detail table **exists**: `extra_chance_details (request_id, academic_year_id, semester_id, reason, chance_type, notes, chance_applied_at)`. Validate RPC exists: `validate_extra_chance_request`.

## Form fields → binding
| Form field | Column |
|---|---|
| `academic_year_id` | `extra_chance_details.academic_year_id` |
| `semester_id` | `extra_chance_details.semester_id` |
| `chance_type` (select: `additional_exam`, `grade_recovery`) | `extra_chance_details.chance_type` |
| `reason` (textarea, required) | `extra_chance_details.reason` |
| `notes` (textarea) | `extra_chance_details.notes` |

## Attachments
None mandatory (supporting docs optional).

## Eligibility
- Student `status='active'`.
- Prior recorded failure or specific case matching `validate_extra_chance_request` rules.
- Not already granted a final chance for the same academic period.

## Classification
- **Type:** exceptional academic decision, no PDF.
- **Fee:** pending approval — likely `exam(30)` or dedicated new fee (report §8 row 1).
- **Outcome:** enables extra exam sitting; recorded in `extra_chance_details.chance_applied_at`.

## Operational steps
| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `manager_review` | `student_affairs` | `student_affairs_manager` | `approve` |
| 3 | `dean_decision` | `dean` | `dean` | `approve` |
| 4 | `fee_assessment` | `finance` | `revenue_finance_officer` | `assess_fee` (skipped if fee=0) |
| 5 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` (skipped if fee=0) |
| 6 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` |

## Transitions
Return/reject at steps 1, 2, 3. Fee steps guard-skipped when `student_fees.amount=0`.

## Completion condition
`extra_chance_details.chance_applied_at IS NOT NULL` AND request completed.

## Final notification
«تم منحك فرصة إضافية للفصل … — نوع الفرصة: …».

## Bypass check
Dean step uses `is_current_user_dean_for_student` for step ownership only — not as a shortcut to bypass earlier steps.

## Blockers
Fee decision.
