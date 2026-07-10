# PORTAL-G9-ELIGIBILITY-DATA-READINESS-AUDIT-01 — Report

- **Environment:** Supabase production ref `wpmicqriltrowwonknox` (Lovable-managed). Repo `msorori-mh/saba-uni-portal`.
- **Audit type:** Read-only. No DB writes, no migration, no seed, no wiring, no Publish/Deploy.
- **Prior decisions:** `PASS_G9_POST_APPLY_REVIEW_COMPLETED`, `PASS_G9_TYPES_SYNC_VERIFIED_ON_MAIN_NO_PR_REQUIRED`.
- **Student population:** 503 rows in `public.student_profiles` (all `status='active'`).

---

## 1. Current field state (aggregate)

Query executed on `public.student_profiles`:

| Metric | Value |
|---|---|
| total_students | 503 |
| missing_study_status (NULL) | 503 |
| student_study_status = 'new' | 0 |
| student_study_status = 'repeat' | 0 |
| transferred_current_year = true | 0 |
| transferred_current_year = false | 503 |
| previous_suspension_semesters_count = 0 | 503 |
| previous_suspension_semesters_count > 0 | 0 |
| consecutive_suspension_years_count = 0 | 503 |
| consecutive_suspension_years_count > 0 | 0 |

**Interpretation:** The distribution matches G9 defaults exactly — `student_study_status` NULL (nullable, no default), the three others at their `NOT NULL DEFAULT` values (`false`, `0`, `0`). No backfill, no import, no runtime write has populated any of the four columns. **Defaults must NOT be treated as truth.**

---

## 2. Data sources inspected (read-only)

Related tables discovered in the `public` schema and their row counts:

| Table | Rows | Relevance |
|---|---|---|
| `student_profiles` | 503 | Target of the four eligibility columns |
| `student_academic_status` | 502 | Per-student current enrollment snapshot; columns: `student_profile_id, academic_year_id, semester_id, level_id, enrollment_status` — values: `enrolled` (500), `active` (2). No `status_type`, no suspension states, no historical rows. |
| `student_enrollments` | 0 | Per-section enrollments; empty — no term history available. |
| `enrollment_suspension_details` | 0 | Would carry formal suspension decisions; empty. |
| `enrollment_reinstatement_details` | 0 | Reinstatement decisions; empty. |
| `transfer_request_details` | 1 | Single transfer request record; contains `current_program_id / requested_program_id / current_department_id / requested_department_id` but no transfer year/date field. |
| `student_requests` | 15 | Only two types present: `absence_excuse` (14), `transfer` (1). No historical `enrollment_suspension` requests. |
| `academic_council_decisions` | (present, not queried in detail) | Potential future source for formal decisions — currently unused for these fields. |

**No historical semester-level enrollment ledger exists.** `student_enrollments` is empty and `student_academic_status` carries only a single current row per student without a status_type discriminator for suspension / withdrawal / deferral.

---

## 3. Field-by-field readiness

### 3.1 `student_study_status` (`'new' | 'repeat'`)
- **Direct sources in DB:** none. No `admission_year`, `cohort`, `intake_batch`, or per-term repeat/failure history is stored on `student_profiles` or elsewhere.
- **Indirect derivation:** would require academic year of admission + current academic year + level progression + grade/repeat history. `student_grades`, `student_enrollments`, and prior-year `student_academic_status` snapshots are needed. Current DB has none of them populated with historical rows.
- **Coverage today:** 0 / 503 derivable with confidence.
- **Confidence:** low.
- **Recommended path:** **B — official import file** from Student Affairs (current-term classification per academic number), optionally combined with C once historical enrollments/grades exist.

### 3.2 `transferred_current_year` (boolean)
- **Direct sources in DB:** `transfer_request_details` (1 row) + `student_requests` (`request_type='transfer'`, 1 row). No admission_type field on `student_profiles`. No transfer_date / transfer_academic_year_id field on `transfer_request_details`.
- **Indirect derivation:** possible only for the single existing transfer request, and only if that request's linked `student_requests.status` is a final approval AND the current academic year matches the request's academic year (which is not stored on the detail row).
- **Coverage today:** at most 1 / 503 with medium confidence; 502 / 503 with no evidence either way.
- **Confidence:** low overall.
- **Recommended path:** **B — official import file** (list of academic numbers transferred in the current academic year). Automatic derivation is unsafe because "no transfer request" ≠ "not transferred" — most legacy transfers were never recorded in this system.

### 3.3 `previous_suspension_semesters_count` (integer ≥ 0)
- **Direct sources in DB:** `enrollment_suspension_details` (0 rows), `enrollment_reinstatement_details` (0 rows), `student_requests` where `request_type='enrollment_suspension'` (0 rows), `student_academic_status` has no suspension state, `academic_council_decisions` is not linked to per-student suspension counts.
- **Indirect derivation:** impossible without a per-term enrollment ledger AND explicit formal decisions. "Semester with no enrollment" **must not** be treated as suspension per §7 rules (could be withdrawal, deferral, cancellation, or missing data).
- **Coverage today:** 0 / 503 with reliable evidence.
- **Confidence:** none from DB alone.
- **Recommended path:** **B — official import file** (academic number → integer) from Student Affairs' paper/spreadsheet decision archive; long-term **C** once suspension requests flow through the portal.

### 3.4 `consecutive_suspension_years_count` (integer ≥ 0)
- **Direct sources in DB:** same as 3.3 — none.
- **Indirect derivation:** requires ordered per-year formal suspension decisions; DB has none.
- **Coverage today:** 0 / 503.
- **Confidence:** none.
- **Recommended path:** **B — official import file**; long-term **C**.

---

## 4. Readiness matrix

| Field | Probable source | DB coverage | Confidence | Proposed fill method |
|---|---|---|---|---|
| `student_study_status` | Student Affairs classification file | 0/503 | Low | Import (B) |
| `transferred_current_year` | Admissions/Registrar list of current-year transfers | ~0–1/503 | Low | Import (B) |
| `previous_suspension_semesters_count` | Student Affairs suspension decision archive | 0/503 | None | Import (B) → later C |
| `consecutive_suspension_years_count` | Same archive as above | 0/503 | None | Import (B) → later C |

---

## 5. Student readiness cohorts (aggregate)

| Cohort | Count |
|---|---|
| All four fields derivable from DB with confidence | 0 |
| Some fields derivable (transfer flag only, ≤1 case) | ≤ 1 |
| Requires official file from Student Affairs / Registrar | ~ 502–503 |
| Requires per-student manual review | remainder after (B) covers what it covers |
| No historical data of any kind available in DB | 503 for suspension counts; 502 for study status |

No individual identifiers, academic numbers, names, or UUIDs are included in this report.

---

## 6. Ambiguous / edge cases identified

- Suspension decision spanning two semesters (single record → two-semester count?).
- Decision dated without an explicit semester binding.
- Summer semester — should it count toward `previous_suspension_semesters_count`?
- Rejected, cancelled, or incomplete suspension requests → must be excluded.
- Historical decisions predating the portal → not in DB.
- Transfer without stored `transfer_academic_year_id` → cannot tell if it belongs to the current year.
- `study_system` NULL for 123 students — unrelated to the four fields but signals general legacy data gaps.

---

## 7. Impact on importer & template (analysis only, no changes)

- `src/lib/imports/` currently has **no** field mappings, validators, or template columns for the four new columns (grep returned no hits).
- Adding them will require:
  - Extending the students CSV template with 4 optional columns.
  - Adding validators (`student_study_status ∈ {new, repeat}`; boolean parser for `transferred_current_year`; non-negative integer parsers for the two counts, matching G9 CHECK constraints).
  - Extending the students upsert path to include the four columns.
- No importer or template change is performed in this task.

---

## 8. Wiring gate (unchanged)

The three G9 `SECURITY DEFINER` functions —
`assert_can_read_student_eligibility_context`, `get_student_request_eligibility_context`, `check_student_request_basic_eligibility` —
remain **NOT wired** into `create_student_request` / `submit_student_request` / any UI submit path. This audit confirms wiring must stay deferred until:

1. The four columns are populated from an authorised source.
2. Each field's source is formally approved.
3. Import validators are implemented and exercised.
4. A safe sample review is completed.
5. An independent backfill/import report is approved.

---

## 9. Recommended path per field

| Field | Recommended path |
|---|---|
| `student_study_status` | **B — official import file** from Student Affairs |
| `transferred_current_year` | **B — official import file** from Admissions/Registrar |
| `previous_suspension_semesters_count` | **B — official import file**, later **C** once portal-generated suspension requests accumulate |
| `consecutive_suspension_years_count` | **B — official import file**, later **C** |

Automatic derivation (path A) is **not safe** for any of the four fields given current DB contents.

---

## 10. No-write assurance

Confirmed **NOT performed** in this task:
- No `INSERT` / `UPDATE` / `DELETE` / `UPSERT`.
- No migration, no schema change, no constraint or RLS change, no grants change.
- No seed data, no test data.
- No modification to `student_requests`, importers, or templates.
- No wiring of eligibility functions into `create_student_request` or `submit_student_request`.
- No `Publish`, no `Deploy`.
- Only `SELECT` and `information_schema` reads were executed.

---

## 11. Decision

**`PASS_WITH_NOTES_G9_ELIGIBILITY_DATA_NEEDS_USER_INPUT`**

Reason: DB contains no historical suspension, transfer-year, or study-status evidence for the 503-student population. All four G9 eligibility columns currently sit at defaults (or NULL) and cannot be safely populated from existing tables. Progress requires authoritative files from Student Affairs / Registrar plus an importer/template extension (planned, not executed).
