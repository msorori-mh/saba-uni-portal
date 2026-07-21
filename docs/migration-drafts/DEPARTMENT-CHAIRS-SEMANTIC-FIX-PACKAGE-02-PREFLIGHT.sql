-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-PREFLIGHT
-- Track B: DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01
-- Base: main @ 45148e0939d6e2d8f2baba792df4ca79907df8ac
--
-- READ-ONLY preflight for the refreshed D-01 semantic fix package.
-- Ends with ROLLBACK. Zero writes. Run BEFORE
-- DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02.sql and archive its output.
--
-- Emits one row per check: (check_name, detail, ok). Every ok=false row is a
-- STOP condition for the main package.
--
-- Runtime-version pin (recon §7): audit/fix target the DEPLOYED actor RPCs of
-- 20260710180000_student_request_actor_rpc_rls.sql. The strict-binding draft
-- STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql is NOT applied.
--
-- Protected identities (must never be modified by the package):
--   chairs:  CS د. أسامة عبدالجليل أحمد سيف F2025006 / IT د. خالد قاسم محمد
--            البراحي F2025005 / IS د. رمزي حميد الجابري F2025004
--   records: SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8,
--            USR-2026-000001, USR-2026-000002
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH constants AS (
  SELECT
    '11111111-1111-4111-8111-111111111111'::uuid AS cs_dept,
    'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid AS it_dept,
    '22222222-2222-4222-8222-222222222222'::uuid AS is_dept,
    'd08a8509-4c04-472e-885f-053a80be12ec'::uuid AS osama_fp,
    '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'::uuid AS khaled_fp,
    'c1fe6084-e594-482e-a178-ac8eaffed376'::uuid AS ramzi_fp,
    '97acbe02-c59c-409c-8d51-7d4ef72e6db7'::uuid AS osama_user,
    'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e'::uuid AS khaled_user,
    'f602b62c-194b-4591-8e9c-956e5cbb347d'::uuid AS ramzi_user,
    '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f'::uuid AS wrong_osama_it_assignment,
    '912bdb96-3fb9-494c-8caa-7778c7d0d402'::uuid AS khaled_it_assignment,
    '4d0f434e-57ab-40b2-8a6f-5f27f330db97'::uuid AS ramzi_is_assignment
),
unit_role AS (
  SELECT u.id AS unit_id, r.id AS role_id
  FROM public.request_processing_units u
  JOIN public.request_processing_roles r ON r.unit_id = u.id
  WHERE u.code = 'department' AND u.is_active
    AND r.code = 'department_head' AND r.is_active
),
active_heads AS (
  SELECT a.id, a.department_id, a.faculty_profile_id
  FROM public.request_processing_assignments a
  JOIN unit_role ur ON ur.unit_id = a.unit_id AND ur.role_id = a.role_id
  WHERE a.assignment_type = 'faculty_profile'
    AND a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
),
checks(check_name, detail, ok) AS (
  SELECT 'DEPARTMENT_ANCHORS_PRESENT',
         'count=' || (SELECT count(*) FROM public.departments d, constants c
                      WHERE d.id IN (c.cs_dept, c.it_dept, c.is_dept)),
         (SELECT count(*) FROM public.departments d, constants c
          WHERE d.id IN (c.cs_dept, c.it_dept, c.is_dept)) = 3
  UNION ALL
  SELECT 'UNIT_ROLE_RESOLUTION_UNIQUE',
         'unit_role_pairs=' || (SELECT count(*) FROM unit_role),
         (SELECT count(*) FROM unit_role) = 1
  UNION ALL
  SELECT 'OSAMA_IDENTITY_CS_F2025006',
         'employee_number=F2025006 fp=d08a8509-... user=97acbe02-...',
         EXISTS (SELECT 1 FROM public.faculty_profiles fp, constants c
                 WHERE fp.id = c.osama_fp AND fp.user_id = c.osama_user
                   AND fp.employee_number = 'F2025006' AND fp.status = 'active'
                   AND fp.department_id IN (c.it_dept, c.cs_dept))
  UNION ALL
  SELECT 'KHALED_IDENTITY_IT_F2025005',
         'employee_number=F2025005 fp=6f9f004d-... user=d4aaa5c9-...',
         EXISTS (SELECT 1 FROM public.faculty_profiles fp, constants c
                 WHERE fp.id = c.khaled_fp AND fp.user_id = c.khaled_user
                   AND fp.employee_number = 'F2025005' AND fp.status = 'active'
                   AND fp.department_id = c.it_dept)
  UNION ALL
  SELECT 'RAMZI_IDENTITY_IS_F2025004',
         'employee_number=F2025004 fp=c1fe6084-... user=f602b62c-...',
         EXISTS (SELECT 1 FROM public.faculty_profiles fp, constants c
                 WHERE fp.id = c.ramzi_fp AND fp.user_id = c.ramzi_user
                   AND fp.employee_number = 'F2025004' AND fp.status = 'active'
                   AND fp.department_id = c.is_dept)
  UNION ALL
  SELECT 'WRONG_OSAMA_IT_ASSIGNMENT_STATE',
         'id=7ab0b14f-... expected active-or-already-corrected',
         EXISTS (SELECT 1 FROM public.request_processing_assignments a, constants c, unit_role ur
                 WHERE a.id = c.wrong_osama_it_assignment
                   AND a.unit_id = ur.unit_id AND a.role_id = ur.role_id
                   AND a.assignment_type = 'faculty_profile'
                   AND a.faculty_profile_id = c.osama_fp
                   AND a.department_id = c.it_dept)
  UNION ALL
  SELECT 'KHALED_IT_ASSIGNMENT_ACTIVE',
         'id=912bdb96-... expected active',
         EXISTS (SELECT 1 FROM active_heads a, constants c
                 WHERE a.id = c.khaled_it_assignment
                   AND a.department_id = c.it_dept
                   AND a.faculty_profile_id = c.khaled_fp)
  UNION ALL
  SELECT 'RAMZI_IS_ASSIGNMENT_ACTIVE',
         'id=4d0f434e-... expected active',
         EXISTS (SELECT 1 FROM active_heads a, constants c
                 WHERE a.id = c.ramzi_is_assignment
                   AND a.department_id = c.is_dept
                   AND a.faculty_profile_id = c.ramzi_fp)
  UNION ALL
  SELECT 'IT_DUPLICATE_PRESTATE_MEMBERSHIP',
         'IT active heads must be exactly {khaled, wrong-osama} (known defect)',
         (SELECT count(*) FROM active_heads a, constants c WHERE a.department_id = c.it_dept) = 2
         AND NOT EXISTS (SELECT 1 FROM active_heads a, constants c
                         WHERE a.department_id = c.it_dept
                           AND a.id NOT IN (c.khaled_it_assignment, c.wrong_osama_it_assignment))
  UNION ALL
  SELECT 'CS_ACTIVE_HEAD_COUNT_AT_MOST_ONE',
         'CS active heads = ' || (SELECT count(*) FROM active_heads a, constants c
                                  WHERE a.department_id = c.cs_dept),
         (SELECT count(*) FROM active_heads a, constants c WHERE a.department_id = c.cs_dept) <= 1
  UNION ALL
  SELECT 'IS_ACTIVE_HEAD_COUNT_EXACTLY_ONE',
         'IS active heads = ' || (SELECT count(*) FROM active_heads a, constants c
                                  WHERE a.department_id = c.is_dept),
         (SELECT count(*) FROM active_heads a, constants c WHERE a.department_id = c.is_dept) = 1
  UNION ALL
  SELECT 'NO_ACTIVE_HEADS_OUTSIDE_CS_IT_IS',
         'out_of_scope=' || (SELECT count(*) FROM active_heads a, constants c
                             WHERE a.department_id NOT IN (c.cs_dept, c.it_dept, c.is_dept)),
         (SELECT count(*) FROM active_heads a, constants c
          WHERE a.department_id NOT IN (c.cs_dept, c.it_dept, c.is_dept)) = 0
  UNION ALL
  SELECT 'OSAMA_CS_INACTIVE_CANDIDATES_AT_MOST_ONE',
         'inactive CS rows for Osama = ' ||
           (SELECT count(*) FROM public.request_processing_assignments a, constants c, unit_role ur
            WHERE a.unit_id = ur.unit_id AND a.role_id = ur.role_id
              AND a.assignment_type = 'faculty_profile'
              AND a.faculty_profile_id = c.osama_fp
              AND a.department_id = c.cs_dept AND NOT a.is_active),
         (SELECT count(*) FROM public.request_processing_assignments a, constants c, unit_role ur
          WHERE a.unit_id = ur.unit_id AND a.role_id = ur.role_id
            AND a.assignment_type = 'faculty_profile'
            AND a.faculty_profile_id = c.osama_fp
            AND a.department_id = c.cs_dept AND NOT a.is_active) <= 1
  UNION ALL
  SELECT 'RUNTIME_VERSION_PIN',
         'targets deployed 20260710180000 actor RPCs; hardening draft NOT applied',
         true
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

ROLLBACK;
