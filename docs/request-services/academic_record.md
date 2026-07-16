# Contract — `academic_record` (السجل الأكاديمي)

Source: `request_types.code='academic_record'`. Reuses `official_transcript_request_details`. No dedicated validate RPC — Batch B creates `validate_academic_record_request` or reuses `validate_official_transcript_request`.

## Form fields → binding
| Form field | Column / storage |
|---|---|
| `purpose` (textarea, required) | `official_transcript_request_details.purpose` |
| `copies_count` (select 1–5) | `student_requests.form_data.copies_count` |
| `recipient` (text) | `student_requests.form_data.recipient` |
| `language` (select: `ar`, `en`, `both`) | `student_requests.form_data.language` |

## Attachments
None.

## Eligibility
- Student `status IN ('active','graduated')`.
- At least one completed semester with recorded grades.

## Classification
- **Type:** document.
- **Fee:** `fee_configuration_pending`.
- **document_type:** `academic_record` (distinct).

## Operational steps
Routing splits by the student's status at request time:
- **`status='active'`** → intake + issuance on `student_affairs / student_affairs_specialist` (هيثم الشبلي).
- **`status='graduated'`** → intake + issuance on `graduate_affairs / graduate_affairs_specialist` (صالح علي), with `graduate_affairs_manager` (محمد شوقي) as the managerial fallback surface in the same unit.

1. `initial_review` — `student_affairs / student_affairs_specialist` **OR** `graduate_affairs / graduate_affairs_specialist` (per rule above)
2. `fee_assessment` — `finance / revenue_finance_officer`
3. `payment_confirmation` — `finance / revenue_finance_officer`
4. `registrar_signature` — `registrar / registrar_general`
5. `dean_signature` — `dean / dean` *(required for academic_record; distinguishes from grade_statement_non_graduate)*
6. `document_issuance` — same unit as step 1
7. `archive` — `archive / archive_officer`

## Transitions
Standard forward + return-to-student from 1 + reject at 1/2/4/5. Fee steps guard-skipped if fee=0.

## Completion condition
`official_documents` row with `document_type='academic_record'`, `status='archived'`, `verification_code`.

## Final notification
«تم إصدار سجلك الأكاديمي — الرقم …» (no link).

## Audit / archive
Per §6 of parent report (idempotent, cancel = soft, storage kept).

## Bypass check
Dean signature step scoped to the dean of the student's college — resolved via `is_current_user_dean_for_student`; no admin shortcut.

## Blockers
PDF template + fee decision (report §8 rows 1, 5).
