-- PORTAL-24H-GRADUATES-AFFAIRS-SOURCE-AND-SPECIALIST-SCOPE-FINAL-RC-02
-- Specialist department-scope remediation (DRY RUN default).
--
-- Production finding (2026-08-10 read-only, reconfirmed RC-02):
--   active graduate_affairs_specialist assignment exists
--   staff_profile_id = aa4f5c16-c993-4af6-a6d4-59d9542c1a7f
--   name_ar = صالح علي / email = saleh@usr.edu.ye / employee_number = S2026008
--   staff_profiles.department_id = NULL
--   staff_profiles.department_scope = 'all' (NOT AUTH-04 scope)
--   staff_profile_departments rows for that profile = 0
--   graduation_project_department_coordinators bindings = 0
--
-- AUTH-04 binds specialist scope ONLY via staff_profile_departments of the
-- authorizing staff_profile. Empty scope => DENY all specialist record access.
--
-- Owner decision package (AMBIGUOUS — do not invent department):
--   docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md
--
-- DO NOT execute the INSERT against production without explicit owner approval
-- AND an owner-chosen department_id from the candidate list in that package.
-- Default path is SELECT-only diagnosis + a commented remediation template.

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

SELECT id, name_ar, name_en, is_active, sort_order
FROM public.departments
WHERE is_active IS DISTINCT FROM false
ORDER BY sort_order NULLS LAST, name_ar;

-- =====================================================================
-- B) Remediation template (COMMENTED — owner-gated write)
-- =====================================================================
-- Replace :department_id with an OWNER-CHOSEN UUID from:
--   docs/migration-drafts/GA-PRODUCTION-SPECIALIST-SCOPE-OWNER-DECISION-01.md
-- Proven production specialist profile (read-only observation only):
--   aa4f5c16-c993-4af6-a6d4-59d9542c1a7f
-- Candidate active departments (do not invent; owner must choose):
--   ce485c67-5f7c-498d-b120-4b1130a86ae8  Information Technology
--   11111111-1111-4111-8111-111111111111  Computer Science
--   22222222-2222-4222-8222-222222222222  Computer Information Systems
--
-- BEGIN;
-- INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
-- VALUES (
--   'aa4f5c16-c993-4af6-a6d4-59d9542c1a7f'::uuid,
--   '11111111-1111-4111-8111-111111111111'::uuid  -- OWNER MUST CONFIRM
-- )
-- ON CONFLICT DO NOTHING;
-- -- Re-run diagnosis SELECT; expect department_scope_count >= 1
-- -- Then re-run GA-PRODUCTION-PROMOTION-PREFLIGHT-READONLY-SELECT-01.sql
-- COMMIT;

SELECT
  'SPECIALIST_SCOPE_REMEDIATION_DRY_RUN_ONLY' AS status,
  'No writes executed' AS note,
  'OWNER_DECISION_REQUIRED' AS gate,
  'AMBIGUOUS_NO_SINGLE_AUTHORITATIVE_DEPARTMENT' AS reason;
