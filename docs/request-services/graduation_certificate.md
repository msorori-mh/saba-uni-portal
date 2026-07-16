# Contract — `graduation_certificate` (شهادة تخرج)

Source: `request_types.code='graduation_certificate'`. Reuses `official_transcript_request_details`. Validate RPC to create: `validate_graduation_certificate_request`.

## Form fields → binding
| Form field | Column / storage |
|---|---|
| `purpose` (textarea, required) | `official_transcript_request_details.purpose` |
| `copies_count` (select 1–5) | `student_requests.form_data.copies_count` |
| `language` (select `ar`, `en`, `both`) | `student_requests.form_data.language` |
| `graduation_year` (readonly, from `student_academic_status`) | — |

## Attachments
None.

## Eligibility
- Student `status='graduated'` AND cumulative pass verified via `student_academic_status`.
- No outstanding financial dues (`student_fees.status='paid'` or zero unpaid).

## Classification
- **Type:** document — the most senior document artifact.
- **Fee:** likely reuse `graduation(100)` — confirm (report §8 row 1).
- **document_type:** `graduation_certificate` (distinct).

## Operational steps
1. `initial_review` — `graduate_affairs / graduate_affairs_specialist` (صالح علي)
2. `graduation_verification` — `registrar / registrar_general` *(verifies transcript + cumulative pass)*
3. `fee_assessment` — `finance / revenue_finance_officer`
4. `payment_confirmation` — `finance / revenue_finance_officer`
5. `registrar_signature` — `registrar / registrar_general`
6. `dean_signature` — `dean / dean`
7. `document_issuance` — `graduate_affairs / graduate_affairs_specialist` (with `graduate_affairs_manager` as managerial oversight in the same unit)
8. `archive` — `archive / archive_officer`

## Transitions
Return/reject at 1, 2, 3, 5, 6. Fee steps guard-skipped if waived per policy.

## Completion condition
`official_documents` row with `document_type='graduation_certificate'`, `status='archived'`, `verification_code`.

## Final notification
«تم إصدار شهادة التخرج — الرقم …» (no link).

## Audit / archive
Per §6 parent report — special care: cancellation must never delete the storage object (auditable graduation record).

## Bypass check
Dean scoped via `is_current_user_dean_for_student`; registrar verification step scoped to assigned registrar_general.

## Blockers
PDF template (highest priority — official graduation certificate); confirm fee decision; confirm graduation-status source (report §8 rows 1, 3, 5).
