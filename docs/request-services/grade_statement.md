# Contract — `grade_statement` (شهادة تقديرات — للخريجين)

Source: `request_types.code='grade_statement'`. Reuses `official_transcript_request_details`. Validate RPC to create in Batch B: `validate_grade_statement_request` (or reuse `validate_official_transcript_request` with graduate-specific rules).

## Form fields → binding
| Form field | Column / storage |
|---|---|
| `purpose` (textarea, required) | `official_transcript_request_details.purpose` |
| `copies_count` (select 1–5) | `student_requests.form_data.copies_count` |
| `recipient` (text) | `student_requests.form_data.recipient` |
| `language` (select: `ar`, `en`, `both`) | `student_requests.form_data.language` |
| `include_gpa` (checkbox) | `student_requests.form_data.include_gpa` |

## Attachments
None.

## Eligibility
- Student `status='graduated'` (this service is graduate-facing; `grade_statement_non_graduate` covers active students).
- Full transcript available in `student_grades`.

## Classification
- **Type:** document.
- **Fee:** `fee_configuration_pending`.
- **document_type:** `grade_statement` (distinct).

## Operational steps
Same 7-step shape as `academic_record` (with dean signature). Since this service is graduate-only, `initial_review` and `document_issuance` bind to `graduate_affairs / graduate_affairs_specialist` (صالح علي), with `graduate_affairs_manager` (محمد شوقي) as the managerial surface. All other steps unchanged.

## Transitions
Standard forward + return + reject.

## Completion condition
`official_documents` row with `document_type='grade_statement'`, `status='archived'`, `verification_code`.

## Final notification
«تم إصدار شهادة التقديرات — الرقم …» (no link).

## Audit / archive
Per §6 parent report.

## Bypass check
Dean scoped via `is_current_user_dean_for_student`; no shortcut.

## Blockers
PDF template + fee (report §8 rows 1, 5).
