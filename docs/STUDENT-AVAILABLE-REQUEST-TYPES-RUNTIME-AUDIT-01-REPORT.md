# STUDENT-AVAILABLE-REQUEST-TYPES-RUNTIME-AUDIT-01 — Report

Read-only. No writes performed (no UPDATE / INSERT / DELETE / migration / deploy / publish).

## G1 — request_types inventory

Total rows: **12**. All rows have `request_audience = active_student`, `ineligible_display_mode = hidden`.

| code | is_active | student_visible | requires_attachment | classification |
|---|---:|---:|---:|---|
| academic_record | ✅ | ❌ | ❌ | Active but hidden |
| department_transfer | ✅ | ❌ | ✅ | Active but hidden |
| enrollment_certificate | ❌ | ❌ | ❌ | Inactive (E2E window closed) |
| enrollment_suspension | ✅ | ❌ | ❌ | Active but hidden |
| excused_absence | ✅ | ❌ | ✅ | Active but hidden |
| file_withdrawal | ✅ | ❌ | ❌ | Active but hidden |
| final_chance | ✅ | ❌ | ❌ | Active but hidden |
| grade_statement | ✅ | ❌ | ❌ | Active but hidden |
| grade_statement_non_graduate | ✅ | ❌ | ❌ | Active but hidden |
| graduation_certificate | ✅ | ❌ | ❌ | Active but hidden |
| october_exam_entry_form | ✅ | ❌ | ❌ | Active but hidden |
| replacement_student_card | ✅ | ❌ | ❌ | Active but hidden |

- Active: **11**
- Student-visible: **0**
- Active AND student-visible: **0**

`request_types` has no `fee`/monetary column at row level (fees are handled via runtime `student_request_fee_assessments`).

## G2 — RPC audit (`get_available_request_types_for_current_student`)

Live student session (`wadeh@usr.edu.ye`) not exercised in this turn (current preview holds an admin session; per stage rules Service Role impersonation is forbidden). The RPC's SQL body was inspected via `pg_get_functiondef` and is deterministic:

- Rejects `auth.uid() IS NULL` → 28000.
- Loads profile via `current_student_profile_for_auth()`; if null → returns empty.
- If `profile_status NOT IN ('active','graduated')` → returns rows filtered by `rt.is_active=true AND rt.student_visible=true` with `is_eligible=false, is_disabled=true`.
- Otherwise → returns rows filtered by `rt.is_active=true AND rt.student_visible=true` and evaluates eligibility per row.

Because **every** `student_visible` is `false`, the RPC returns **0 rows** for `wadeh` (profile `95713a18-22c6-4f15-a825-ab0c2e373c4f`, status `active`, study_status `new`, study_system `regular`, program IT) regardless of eligibility. The call itself succeeds (no error). No `is_eligible=true` row is possible.

## G3 — per-type outcome vs RPC

| code | active | visible | audience | eligible (would-be) | workflow active | RPC result | Reason not shown |
|---|---:|---:|---|---:|---:|---|---|
| academic_record | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| department_transfer | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| enrollment_certificate | ❌ | ❌ | active_student | n/a | ✅ (v2 active) | absent | `is_active=false` AND `student_visible=false` (intentional; E2E window closed) |
| enrollment_suspension | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| excused_absence | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| file_withdrawal | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| final_chance | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| grade_statement | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| grade_statement_non_graduate | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| graduation_certificate | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| october_exam_entry_form | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |
| replacement_student_card | ✅ | ❌ | active_student | n/a | ❌ | absent | `student_visible=false` |

The visibility filter alone excludes 100% of rows — eligibility, audience, and workflow checks never fire.

## G4 — Student eligibility (read-only)

`wadeh@usr.edu.ye` (`4a0ce655-8e23-4ea4-bf14-1c4d3234619c`):

- profile id: `95713a18-22c6-4f15-a825-ab0c2e373c4f`
- status: `active`
- student_study_status: `new`
- study_system: `regular`
- program_id: `97638001-87cd-4df0-abe9-63c829504072` (IT)
- department_id: `ce485c67-5f7c-498d-b120-4b1130a86ae8`
- transferred_current_year: `false`
- previous_suspension_semesters_count: `0`
- consecutive_suspension_years_count: `0`

No modifications performed. Profile matches the expected baseline.

## G5 — Workflows

Only `enrollment_certificate` has a Workflow row (draft `8a0ef6b8-…` + active v2 `7e06dfe1-…`). All other 11 active types have **no workflow** at all.

- Missing workflow does **not** affect visibility in the RPC — it only blocks `submit_student_request` (runtime initializer). So visibility is decoupled from workflow presence.
- The new-request page reads the RPC output only; it does not additionally hide rows for missing workflow.

## G6 — enrollment_certificate

Confirmed: `is_active=false`, `student_visible=false`, `updated_at=2026-07-13 18:04:41Z` (from the emergency close). Still absent from student catalog as required until PR #124 / PDF+Storage path lands. Not modified.

## G7 — UI check (read-only)

`src/routes/student.requests.new.tsx` + `src/routes/mobile.student.requests.tsx` both:

- Call `getStudentRequestTypesForStudent` → `rpc_get_available_request_types`.
- Render loading / error / empty states distinctly.
- On RPC error → surface the message (not silently emptied).
- Empty state only when the RPC returns `[]`.
- Downstream filter `filterStudentRequestTypesForDisplay` only strips known deprecated codes; it does **not** re-filter on `is_eligible`/`student_visible` in a way that would drop currently-visible rows.

No UI-side over-filtering detected. When the RPC returns 0 rows (current state), the page correctly shows the empty state.

## G8 — Summary

- Total request types: **12**
- Active: **11**
- Student-visible: **0**
- RPC result for `wadeh`: **0 rows, no error** (derived from function body; visibility filter is unconditional).
- Root cause of "no request types available": **data configuration** — every `request_types.student_visible` is `false`. Eligibility, workflow, RPC, and UI filters are not the cause.
- Workflows: only `enrollment_certificate` has one; other active types would still need workflows before submit, but this does not affect visibility.
- No writes executed. `enrollment_certificate` remains `is_active=false, student_visible=false`. Target request `93807768-…` untouched.

## Decision

**PASS_AUDIT — NO_AVAILABLE_REQUEST_TYPES_CONFIGURED — NEEDS_OWNER_CONFIGURATION**

Owner action required: flip `student_visible=true` on the request types intended to be exposed to students (and ensure each has an active workflow before enabling submission).
