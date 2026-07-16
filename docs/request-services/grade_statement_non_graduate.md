# Contract — `grade_statement_non_graduate` (شهادة تقديرات لغير الخريجين)

Source: `request_types.code='grade_statement_non_graduate'`. Reuses `official_transcript_request_details` (columns: `purpose, notes, official_document_id, document_issued_at`) — no new detail table required. Validate RPC: reuse `validate_official_transcript_request` (present).

## Form fields → binding
| Form field | Column |
|---|---|
| `purpose` (textarea, required) | `official_transcript_request_details.purpose` |
| `copies_count` (select 1–5) | `student_requests.form_data.copies_count` |
| `recipient` (text) | `student_requests.form_data.recipient` |
| `include_up_to_semester_id` (select from `semesters` up to current) | `student_requests.form_data.include_up_to_semester_id` |

## Attachments
None. `requires_attachment=false`.

## Eligibility
- Student `status='active'` AND NOT `graduated`.
- Has at least one `student_grades` row.

## Classification
- **Type:** document.
- **Fee:** pending approval (see report §7, §8).
- **document_type:** `grade_statement_non_grad` (distinct code — never reuse `enrollment_certificate`).

## Operational steps
| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `initial_review` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `fee_assessment` | `finance` | `revenue_finance_officer` | `assess_fee` |
| 3 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
| 4 | `registrar_signature` | `registrar` | `registrar_general` | `sign` |
| 5 | `document_issuance` | `student_affairs` | `student_affairs_specialist` | `issue_document` |
| 6 | `archive` | `archive` | `archive_officer` | `archive` |

## Transitions
Standard forward + return-to-student from step 1 + reject at step 1, 2, or 4. Steps 2/3 skipped only if fee policy = free (post fee approval).

## Completion condition
`official_documents` row exists with `document_type='grade_statement_non_grad'`, `status='archived'`, `verification_code` present.

## Final notification
«تم إصدار شهادة التقديرات (غير خريج) بالرقم …» (no link — matches enrollment-certificate correction contract).

## Audit / archive
Follows §6 of parent report (idempotent issuance, ON CONFLICT, no delete on cancel).

## Bypass check
No admin/registrar/dean bypass; each step is assignee-scoped.

## Blockers
Official PDF template + approved fee (report §8 rows 1, 5).
