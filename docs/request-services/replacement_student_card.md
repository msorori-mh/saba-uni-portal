# Contract — `replacement_student_card` (بدل فاقد بطاقة طالب)

Source: `request_types.code='replacement_student_card'`. **No detail table exists** — Batch B creates `replacement_card_details (request_id, loss_reason text, loss_declaration_ack boolean, previous_card_number text, issued_card_number text, card_issued_at timestamptz)`. Validate RPC: `validate_replacement_student_card_request`.

## Form fields → binding
| Form field | Column |
|---|---|
| `loss_reason` (textarea, required) | `replacement_card_details.loss_reason` |
| `loss_declaration_ack` (checkbox, required) | `replacement_card_details.loss_declaration_ack` |
| `previous_card_number` (text, optional) | `replacement_card_details.previous_card_number` |

## Attachments
Optional: police report / lost declaration.

## Eligibility
- Student `status='active'`.
- No pending replacement request in the last 30 days.

## Classification
- **Type:** physical artifact issuance.
- **Fee:** pending approval (report §8 row 1).
- **Outcome:** new `issued_card_number` stored + student notified to collect the card from student affairs.

## Operational steps
| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_review` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `fee_assessment` | `finance` | `revenue_finance_officer` | `assess_fee` |
| 3 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
| 4 | `card_issuance` | `student_affairs` | `student_affairs_specialist` | `issue_artifact` |

## Transitions
Return/reject at step 1; skip 2/3 only if fee=0.

## Completion condition
`replacement_card_details.card_issued_at IS NOT NULL` AND request completed.

## Final notification
«بطاقتك الجديدة جاهزة — رقم البطاقة: … — يرجى الاستلام من شؤون الطلاب».

## Bypass check
No role-wide bypass; issuance restricted to assigned student-affairs staff.
