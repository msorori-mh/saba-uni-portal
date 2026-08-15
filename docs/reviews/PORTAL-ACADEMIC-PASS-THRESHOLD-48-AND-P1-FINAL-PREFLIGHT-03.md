# PORTAL_ACADEMIC_PASS_THRESHOLD_48_AND_P1_FINAL_PREFLIGHT_03

Decision: **PASS_SOURCE_CLOSURE_AND_READONLY_PREFLIGHT — SAFE_TO_APPLY**

Scope: SOURCE-ONLY plus READ-ONLY production reads. Zero migrations applied,
zero production writes, no publish/deploy.

## 1. Approved policy pinned

`COURSE_PASS_MARK = 48 / 100`, single source of truth:
`src/lib/academic/pass-threshold.ts` (`COURSE_PASS_PERCENT`, `COURSE_PASS_RATIO`,
`isCoursePassed`). Rule: `percentage >= 48.00 → PASSED`, `< 48.00 → FAILED`.

Consumers realigned to the constant (no local literals left):

| Surface | File | Was |
| --- | --- | --- |
| Web progress / graduation engine | `src/lib/academic-status.functions.ts` | 60 |
| Mobile grades | `src/routes/mobile.student.grades.tsx` | 60 |
| Admin reports | `src/lib/admin-reports.functions.ts` | 60 |
| October remaining-course recompute | `docs/migration-drafts/p1/P1-02-BACKEND-VALIDATION.sql` | 0.60 |

Unrelated numeric 60 values (durations, timeouts, page sizes, percentages that
are not pass marks) were left untouched; `tests/academic/pass-threshold-48.test.ts`
(16 cases) guards the boundary (47.99 vs 48.00) and forbids reintroducing a
hardcoded academic 60.

## 2. Backend threshold drift package

`docs/migration-drafts/p1/P1-05-PASS-THRESHOLD-48.sql` (forward-only) normalizes:

- `public.get_admin_dashboard_kpis` (was 60)
- `public.get_admin_progress_kpis` (was 60)
- `public.student_unofficial_transcript` — a **VIEW** in production, not a
  function (was 50); replaced with an identical column list/order so
  `CREATE OR REPLACE VIEW` is safe.

## 3. PG17 rehearsal (isolated cluster, never production)

`bash scripts/p1-source-closure-02-pg17/run.sh` → **P1_PG17_REHEARSAL_PASS**.
All four P1 drafts applied twice (idempotency) plus the case suite, now including
the new 48% boundary block:

- 47.99% stays outstanding; exactly 48.00% is passed
- normalized components (95.9/200 vs 96/200) honour the same boundary
- repeated attempts (47% then 52%) count the course as passed exactly once
- no double counting in `p1_passed_course_ids`
- October eligibility recomputed on top of the corrected remaining set

Plus the pre-existing October / transfer / replacement-card / 7-day appeal /
positive+negative authorization matrix / revenue-gate / audited idempotent final
result cases, and the structural workflow assertions (13 bound steps, every step
has unit+role, seeds never flip `student_visible`, legacy proportional
redistribution trigger removed).

## 4. READ-ONLY production preflight

`docs/production-preflight/P1-PASS-THRESHOLD-48-READONLY-PREFLIGHT-03.sql`
— public-schema only (no `auth`/`storage`/`supabase_migrations` reads, which the
managed role cannot access), no DDL/DML/RPC.

| Gate | Result |
| --- | --- |
| G01 P1 detail tables | 0 present → PASS_ABSENT_SAFE_TO_APPLY |
| G02 `p1_*` functions | 0 present → PASS_ABSENT_SAFE_TO_APPLY |
| G03 threshold drift | all 3 objects DRIFT_CONFIRMED_P1_05_REQUIRED |
| G03B object coverage | 3/3 present → PASS |
| G04 impact band (48–59.99) | 0 results reclassified; 44 already passing, 0 failing |
| G05 legacy triggers | 6 observed, P1-04 replaces the redistribution path |
| G06 P1 service visibility | `october_exam_entry_form`=false, `replacement_student_card`=false, `department_transfer`=true (unchanged) |
| G06B `grade_appeal` type | absent → will be seeded hidden by P1-03 |
| G07 protected records | 3/3 intact (SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8) |
| G08 `enrollment_certificate` | present and out of scope |

Correction found by the preflight: `student_unofficial_transcript` is a view and
`grade_appeal` does not yet exist as a request type — both handled above.

## 5. Verification

- `bash scripts/p1-source-closure-02-pg17/run.sh` → PASS (44 cases)
- `bun test tests/student-requests` + `tests/academic` → PASS
- `routeTree` semantic hash re-pinned in the second holder
  (`tests/academic-councils/pr314-rc313-semantic-integration-remediation-03.test.ts`)
  to `6daad828…2a883a`, matching the student-requests pin
- typecheck clean (`tsgo --noEmit`)
- Remaining 21 failures in `tests/academic-councils/*` are the pre-existing
  disposable-PG17 harness cases that throw `docker is required for the PG17
  disposable harness`; they are environment-gated and untouched by this mission

## 6. Risks / notes

- Impact of the threshold change on existing production data is currently nil
  (G04 band empty), so the migration is behaviour-correcting, not data-rewriting.
- No migration was applied; applying P1-01…P1-05 remains a separate, one-at-a-time
  operation with its own post-verifier.
