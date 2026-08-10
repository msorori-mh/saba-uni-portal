-- PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01
-- Specialist department-scope remediation (DRY RUN default).
--
-- Production finding (2026-08-10 read-only, reconfirmed):
--   active graduate_affairs_specialist assignment exists
--   staff_profile_id = aa4f5c16-c993-4af6-a6d4-59d9542c1a7f
--   name_ar = صالح علي / email = saleh@usr.edu.ye / employee_number = S2026008
--   staff_profiles.department_id = NULL
--   staff_profiles.department_scope = 'all' (NOT AUTH-04 scope)
--   staff_profile_departments rows for that profile = 0
--   college-wide staff_profile_departments rows = 0
--   active staff with unique department_id = 0
--
-- AUTH-04 binds specialist scope ONLY via staff_profile_departments of the
-- authorizing staff_profile. Empty scope => DENY all specialist record access.
--
-- Deterministic resolution:
--   AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE for aa4f5c16-…
--   SAFE candidate = TEST_ONLY single-dept fixture (not executed here)
--   docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md
--   docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql
--
-- DO NOT INSERT SPD rows for aa4f5c16 against production.
-- DO NOT grant all-department access.

\set ON_ERROR_STOP on

-- =====================================================================
-- A) Diagnosis (always safe / read-only)
-- =====================================================================
SELECT
  r.code AS role_code,
  a.id AS assignment_id,
  a.staff_profile_id,
  sp.user_id AS profile_user_id,
  sp.status AS profile_status,
  sp.full_name_ar,
  sp.email,
  sp.employee_number,
  sp.department_id AS profile_department_id,
  sp.department_scope AS profile_department_scope_text,
  a.assignment_type,
  (
    SELECT count(*)
    FROM public.staff_profile_departments spd
    WHERE spd.staff_profile_id = a.staff_profile_id
  ) AS department_scope_count
FROM public.request_processing_assignments a
JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
JOIN public.request_processing_roles r ON r.id = a.role_id
JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
WHERE a.is_active
ORDER BY r.code;

SELECT
  count(*) AS active_staff,
  count(*) FILTER (WHERE department_id IS NOT NULL) AS with_profile_department_id,
  (SELECT count(*) FROM public.staff_profile_departments) AS spd_rows_total,
  (
    SELECT count(*) FROM (
      SELECT staff_profile_id
      FROM public.staff_profile_departments
      GROUP BY staff_profile_id
      HAVING count(*) = 1
    ) s
  ) AS staff_with_exactly_one_spd
FROM public.staff_profiles
WHERE status = 'active';

SELECT id, name_ar, name_en, is_active, sort_order
FROM public.departments
WHERE is_active IS DISTINCT FROM false
ORDER BY sort_order NULLS LAST, name_ar;

-- =====================================================================
-- B) Remediation for aa4f5c16 — FORBIDDEN in this plan
-- =====================================================================
-- No INSERT template for aa4f5c16. Marked AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE.
-- Operational E2E actor is the TEST_ONLY package (dry-run default):
--   docs/production-test-fixtures/GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql
-- SAFE_SPECIALIST_CANDIDATE=a6e30100-0000-4000-a300-000000000001
-- SAFE_SPECIALIST_DEPARTMENT=11111111-1111-4111-8111-111111111111

SELECT
  'SPECIALIST_SCOPE_REMEDIATION_DRY_RUN_ONLY' AS status,
  'No writes executed' AS note,
  'AMBIGUOUS_SPECIALIST_DO_NOT_SCOPE' AS gate,
  'aa4f5c16-c993-4af6-a6d4-59d9542c1a7f' AS ambiguous_specialist,
  'a6e30100-0000-4000-a300-000000000001' AS safe_specialist_candidate,
  '11111111-1111-4111-8111-111111111111' AS safe_specialist_department,
  'TEST_ONLY_GA_SPECIALIST_E2E_01' AS safe_specialist_kind;
