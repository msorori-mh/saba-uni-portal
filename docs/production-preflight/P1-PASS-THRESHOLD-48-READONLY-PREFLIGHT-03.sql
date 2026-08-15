-- PORTAL_ACADEMIC_PASS_THRESHOLD_48_AND_P1_FINAL_PREFLIGHT_03
-- READ-ONLY production preflight. No DDL, no DML, no RPC side effects.
-- Public schema only: the managed execution role has no USAGE on auth/storage/
-- supabase_migrations, so every gate here stays inside `public` and fails closed
-- with an explicit UNPROVEN code instead of aborting the script.
--
-- Run:  psql -f docs/production-preflight/P1-PASS-THRESHOLD-48-READONLY-PREFLIGHT-03.sql
-- Expected overall verdict: SAFE_TO_APPLY (P1 objects absent, drift confirmed,
-- protected records intact) or HOLD_<gate> otherwise.

\pset pager off

-- G01 — P1 detail models must NOT exist yet (forward-only, no partial apply).
SELECT 'G01_P1_DETAIL_TABLES' AS gate,
       count(*) AS present_count,
       coalesce(string_agg(table_name, ','), '(none)') AS present,
       CASE WHEN count(*) = 0 THEN 'PASS_ABSENT_SAFE_TO_APPLY'
            ELSE 'HOLD_P1_PARTIAL_APPLY_DETECTED' END AS verdict
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('october_exam_entry_details',
                     'replacement_student_card_details',
                     'final_result_appeal_details');

-- G02 — P1 backend validation functions must NOT exist yet.
SELECT 'G02_P1_FUNCTIONS' AS gate,
       count(*) AS present_count,
       coalesce(string_agg(p.proname, ','), '(none)') AS present,
       CASE WHEN count(*) = 0 THEN 'PASS_ABSENT_SAFE_TO_APPLY'
            ELSE 'HOLD_P1_FUNCTIONS_ALREADY_PRESENT' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname LIKE 'p1\_%';

-- G03 — pass-threshold drift. NOTE: in production `student_unofficial_transcript`
-- is a VIEW, the two KPI objects are FUNCTIONS; both kinds are inspected here.
WITH objs AS (
  SELECT p.proname AS object_name, 'function' AS object_kind, pg_get_functiondef(p.oid) AS src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('get_admin_dashboard_kpis', 'get_admin_progress_kpis')
  UNION ALL
  SELECT c.relname, 'view', pg_get_viewdef(c.oid, true)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind IN ('v', 'm') AND c.relname = 'student_unofficial_transcript'
)
SELECT 'G03_PASS_THRESHOLD_DRIFT' AS gate,
       object_name,
       object_kind,
       (src ~ '\m(60|50)\M') AS looks_legacy,
       (src LIKE '%48%') AS has_48,
       CASE WHEN src LIKE '%48%' THEN 'ALREADY_48_NO_CHANGE_NEEDED'
            ELSE 'DRIFT_CONFIRMED_P1_05_REQUIRED' END AS verdict
FROM objs
ORDER BY object_name;

-- G03b — fail closed when an expected object is missing entirely.
WITH objs AS (
  SELECT p.proname AS object_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('get_admin_dashboard_kpis', 'get_admin_progress_kpis')
  UNION ALL
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind IN ('v', 'm') AND c.relname = 'student_unofficial_transcript'
)
SELECT 'G03B_THRESHOLD_OBJECT_COVERAGE' AS gate,
       count(*) AS found,
       CASE WHEN count(*) = 3 THEN 'PASS_ALL_THREE_PRESENT'
            ELSE 'HOLD_THRESHOLD_OBJECT_MISSING_UNPROVEN' END AS verdict
FROM objs;

-- G04 — impact preview: approved results sitting in the 48..59.99 band that the
-- legacy 60 rule mislabels as failed. READ-ONLY count, no rows exposed.
SELECT 'G04_THRESHOLD_IMPACT_BAND' AS gate,
       count(*) FILTER (WHERE pct >= 48 AND pct < 60) AS reclassified_to_passed,
       count(*) FILTER (WHERE pct >= 60) AS unchanged_passed,
       count(*) FILTER (WHERE pct < 48) AS unchanged_failed,
       'INFO_NO_ACTION' AS verdict
FROM (
  SELECT g.student_enrollment_id,
         CASE WHEN sum(c.max_score) > 0
              THEN sum(g.score) / sum(c.max_score) * 100 END AS pct
  FROM public.student_grades g
  JOIN public.grade_components c ON c.id = g.grade_component_id
  WHERE g.status = 'approved'
  GROUP BY g.student_enrollment_id
) t
WHERE pct IS NOT NULL;

-- G05 — legacy proportional-redistribution trigger that P1-04 replaces.
SELECT 'G05_LEGACY_GRADE_APPEAL_TRIGGER' AS gate,
       count(*) AS present_count,
       coalesce(string_agg(tgname, ','), '(none)') AS present,
       'INFO_REPLACED_BY_P1_04' AS verdict
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE NOT t.tgisinternal
  AND c.relname IN ('grade_appeal_details', 'student_grades');

-- G06 — P1 service visibility must stay unchanged by this package.
SELECT 'G06_P1_SERVICE_VISIBILITY' AS gate,
       rt.code,
       rt.student_visible,
       'INFO_MUST_NOT_CHANGE' AS verdict
FROM public.request_types rt
WHERE rt.code IN ('october_exam_entry_form',
                  'replacement_student_card',
                  'grade_appeal',
                  'department_transfer')
ORDER BY rt.code;

-- G06b — `grade_appeal` (final result appeal) is created by P1-03 when absent;
-- its absence here is expected, its presence must already be hidden.
SELECT 'G06B_FINAL_RESULT_APPEAL_TYPE' AS gate,
       count(*) AS existing_rows,
       coalesce(bool_or(student_visible), false) AS any_visible,
       CASE WHEN count(*) = 0 THEN 'PASS_ABSENT_WILL_BE_SEEDED_HIDDEN'
            WHEN bool_or(student_visible) THEN 'HOLD_ALREADY_VISIBLE_TO_STUDENTS'
            ELSE 'PASS_PRESENT_AND_HIDDEN' END AS verdict
FROM public.request_types WHERE code = 'grade_appeal';

-- G07 — protected production records must exist and stay untouched.
SELECT 'G07_PROTECTED_RECORDS' AS gate,
       count(*) AS found,
       CASE WHEN count(*) = 3 THEN 'PASS_PROTECTED_RECORDS_INTACT'
            ELSE 'HOLD_PROTECTED_RECORD_MISSING' END AS verdict
FROM public.student_requests
WHERE request_number IN ('SR-20260713-2DE64041',
                         'SR-20260715-FEDCB3E1',
                         'SR-20260716-26BAD4C8');

-- G08 — enrollment_certificate service must be untouched by P1.
SELECT 'G08_ENROLLMENT_CERTIFICATE_UNAFFECTED' AS gate,
       count(*) AS request_type_rows,
       CASE WHEN count(*) >= 1 THEN 'PASS_PRESENT_AND_OUT_OF_SCOPE'
            ELSE 'HOLD_ENROLLMENT_CERTIFICATE_MISSING' END AS verdict
FROM public.request_types
WHERE code = 'enrollment_certificate';
