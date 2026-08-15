# PORTAL_OFFICIAL_GRADING_SCALE_NO_GPA_AND_P1_FINAL_PIN_04

BASE: `PORTAL_ACADEMIC_PASS_THRESHOLD_48_AND_P1_FINAL_PREFLIGHT_03` (tip `4146eebd02b2ee2c82087d972e7a2c7d2c690c8d`)

MODE: SOURCE_ONLY — MIGRATION_APPLY=DENY, PRODUCTION_WRITE=DENY, DEPLOY=DENY, PUBLISH=DENY.

## 1. Approved policy (single source of truth)

`src/lib/academic/grading-scale.ts`:

| RAW | Official result | Arabic grade |
|---|---|---|
| < 48 | raw (unchanged) | ضعيف |
| 48 ≤ raw < 50 | 50 | مقبول |
| 50 ≤ official < 65 | official | مقبول |
| 65 ≤ official < 80 | official | جيد |
| 80 ≤ official < 90 | official | جيد جدًا |
| 90 ≤ official ≤ 100 | official | ممتاز |

Pass mark stays `COURSE_PASS_PERCENT = 48` (`src/lib/academic/pass-threshold.ts`).
Aggregates use `officialWeightedAverage` — a credit-weighted OFFICIAL PERCENTAGE. **There is no GPA, no 4.0 scale, and no grade points anywhere.**

## 2. GPA removal (source)

- `src/lib/academic-status.functions.ts`: `pctToGpa`, `PROBATION_GPA`, `WARNING_GPA`, `GOOD_GPA` and the GPA aggregation removed. DTO now exposes `current_official_average` / `cumulative_official_average` plus per-course `official_result` and `grade_label`. Standing, eligibility, at-risk and graduation-candidate rules re-derived on the percentage scale (probation < 48% or ≥ 3 failed courses; warning < 65%).
- KPI payload key renamed `avgGpa` → `avgOfficialPercentage` (server fn and fast RPC reader).
- UI: `ProgressSummary.tsx`, `mobile.student.academic-record.tsx`, `mobile.student.grades.tsx`, `student.index.tsx`, `UnofficialTranscript.tsx`, `DocumentTemplates.tsx` (official transcript), `admin/executive-dashboard.lazy.tsx`, `admin/student-progress.tsx`, `admin/at-risk-students.tsx`, `admin/graduation-candidates.tsx`, `admin/pilot-center.tsx` — all show النتيجة الرسمية + التقدير; no «معدل تراكمي/GPA» anywhere.
- `src/lib/admin-reports.functions.ts`: averages computed on normalized official results; the contradictory `< 60` at-risk cut replaced by the approved 48 pass mark.

## 3. Migration draft (NOT applied)

`docs/migration-drafts/p1/P1-05-PASS-THRESHOLD-48.sql` (rev. 04):
- `get_admin_progress_kpis`: `course_gpa`/`per_student_gpa` replaced by `course_official`/`per_student_official`; returns `avgOfficialPercentage`; eligibility uses `official_average >= 48`; at-risk `< 65`.
- `get_admin_dashboard_kpis`: success rate on `>= 48` (unchanged from rev. 03).
- `student_unofficial_transcript` VIEW: `official_result` and `grade_label` **appended at the end** of the select list (CREATE OR REPLACE VIEW legality); 48→50 normalization and the Arabic bands duplicated in SQL.

Runtime note: until P1-05 is applied, `getAdminProgressKpisFast` reads `avgOfficialPercentage` from the RPC and therefore reports `0` rather than surfacing a legacy GPA value — fail-safe by design.

## 4. Verification

- `bunx tsgo --noEmit` — clean.
- `bun test tests/student-requests` — **1093 pass / 0 fail** (101 files).
- `bunx vitest run tests/academic` — 23 pass (16 pass-threshold + 7 new grading-scale cases: boundaries 47.99 / 48 / 49.9 / 50 / 65 / 80 / 90 / 100, weighted aggregate, no-GPA source scan, P1-05 draft parity).
- `scripts/p1-source-closure-02-pg17/run.sh` — **P1_PG17_REHEARSAL_PASS** (P1-01..P1-04, applied twice for idempotency).

## 5. Decision

`PASS_PORTAL_OFFICIAL_GRADING_SCALE_NO_GPA_AND_P1_FINAL_PIN_04` — source-only; no migration applied, no production write, no deploy, no publish.
