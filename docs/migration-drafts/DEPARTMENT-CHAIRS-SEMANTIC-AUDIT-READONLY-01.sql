-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01
-- Track B: DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01
-- Base: main @ 45148e0939d6e2d8f2baba792df4ca79907df8ac
--
-- READ-ONLY semantic audit of department chairs for CS / IT / IS.
-- Runs inside a READ ONLY transaction and ends with ROLLBACK. Zero writes.
--
-- SEMANTIC definition of a department chair (recon SCHEMA-INVENTORY §11):
--   an active, currently-effective row in request_processing_assignments with
--     unit  request_processing_units.code = 'department'      (is_active)
--     role  request_processing_roles.code = 'department_head' (is_active)
--     assignment_type = 'faculty_profile'
--     department_id   = the audited department
--   whose identity resolves faculty_profile_id -> faculty_profiles.id
--   -> (employee_number, user_id, department_id).
-- NO reliance on role naming: no substring matching on role codes, no
-- position_title parsing, no CMS faculty.admin_position. The official codes
-- are exactly 'department' + 'department_head' (recon §11: no role code
-- contains the chair substring anywhere in the schema).
--
-- Detection layers (per department):
--   1. identity   : faculty_profiles.employee_number = expected academic number
--   2. unit/dept  : assignment.department_id vs linked profile.department_id
--   3. window     : is_active + starts_at/ends_at (current / future / expired)
--   4. duplicates : >1 concurrently active chair assignments
--   5. wrong-unit : active assignment whose holder profile belongs to another dept
--
-- Final classification per department (deterministic priority order):
--   AMBIGUOUS       matched profile count > 1, or the single active assignment
--                   has an unresolvable identity (NULL/missing faculty_profile_id)
--   DUPLICATE       > 1 concurrently active chair assignments
--   WRONG_UNIT      exactly 1 active assignment, holder profile.department_id
--                   <> audited department
--   WRONG_IDENTITY  exactly 1 active assignment, holder in-unit but
--                   holder employee_number <> expected academic number
--   MATCHED         exactly 1 active assignment, holder employee_number =
--                   expected, holder profile in-unit
--   INACTIVE        0 active; >= 1 chair row with is_active = false (history kept)
--   EXPIRED         0 active; >= 1 chair row flagged active but outside the
--                   effective window (ends_at <= now() or starts_at > now())
--   MISSING         no chair assignment rows at all for the department
--
-- Runtime-version pin (recon §7 / D01-CURRENT-STATE §4.5): this audit targets
-- the DEPLOYED workflow actor functions of migration
-- 20260710180000_student_request_actor_rpc_rls.sql
-- (user_matches_workflow_runtime_step with the registrar/admin fast-path and
-- the is_department_head_of-based fallback). The strict-binding rewrite
-- docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql
-- is an UNAPPLIED draft and is NOT what this audit measures.
--
-- search_path note: 'b_chairs' is the local PG17 harness schema; it does not
-- exist in production and is ignored there, so names resolve to public.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO b_chairs, public;

WITH expected_chairs(dept_id, dept_label, expected_employee_number) AS (
  VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'CS', 'F2025006'),
    ('ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid, 'IT', 'F2025005'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'IS', 'F2025004')
),
-- >>SHARED:CLASSIFICATION_BODY>>
chair_scope AS (
  -- semantic anchor: exact unit code + exact role code, both active
  SELECT u.id AS unit_id, r.id AS role_id
  FROM request_processing_units u
  JOIN request_processing_roles r ON r.unit_id = u.id
  WHERE u.code = 'department'
    AND u.is_active
    AND r.code = 'department_head'
    AND r.is_active
),
chair_assignments AS (
  SELECT
    a.id,
    a.department_id,
    a.faculty_profile_id,
    a.is_active,
    (a.is_active
       AND (a.starts_at IS NULL OR a.starts_at <= now())
       AND (a.ends_at   IS NULL OR a.ends_at   >  now())) AS is_current,
    (a.is_active
       AND NOT ((a.starts_at IS NULL OR a.starts_at <= now())
            AND (a.ends_at   IS NULL OR a.ends_at   >  now()))) AS is_window_inactive
  FROM request_processing_assignments a
  JOIN chair_scope cs ON cs.unit_id = a.unit_id AND cs.role_id = a.role_id
  WHERE a.assignment_type = 'faculty_profile'
),
per_dept AS (
  SELECT
    p.dept_label,
    p.dept_id,
    p.expected_employee_number,
    (SELECT count(*) FROM faculty_profiles fp
      WHERE fp.employee_number = p.expected_employee_number) AS matched_profile_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id) AS total_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND ca.is_current) AS active_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND NOT ca.is_active) AS inactive_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND ca.is_window_inactive) AS expired_window_count
  FROM expected_chairs p
),
single_active AS (
  -- populated only when exactly one active assignment exists (cardinality = 1)
  SELECT
    pd.dept_label,
    ca.faculty_profile_id AS holder_fp_id,
    fp.employee_number AS holder_employee_number,
    fp.department_id AS holder_dept_id
  FROM per_dept pd
  LEFT JOIN chair_assignments ca
    ON ca.department_id = pd.dept_id AND ca.is_current
  LEFT JOIN faculty_profiles fp
    ON fp.id = ca.faculty_profile_id
  WHERE pd.active_assignment_count = 1
),
resolved AS (
  SELECT
    pd.*,
    sa.holder_fp_id,
    sa.holder_employee_number,
    sa.holder_dept_id,
    (pd.active_assignment_count = 1
       AND (sa.holder_fp_id IS NULL OR sa.holder_employee_number IS NULL)) AS identity_unresolved,
    (SELECT count(*) FROM chair_assignments ca
      JOIN faculty_profiles fp ON fp.id = ca.faculty_profile_id
      WHERE ca.department_id = pd.dept_id
        AND ca.is_current
        AND fp.department_id IS DISTINCT FROM pd.dept_id) AS wrong_unit_count,
    GREATEST(pd.active_assignment_count - 1, 0) AS duplicate_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.is_current
        AND ca.department_id NOT IN (SELECT dept_id FROM expected_chairs)) AS out_of_scope_active_head_count
  FROM per_dept pd
  LEFT JOIN single_active sa ON sa.dept_label = pd.dept_label
)
SELECT
  dept_label,
  expected_employee_number AS expected_academic_number,
  matched_profile_count,
  active_assignment_count,
  ('request_processing_assignments(unit=department,role=department_head,type=faculty_profile) -> ' ||
    CASE
      WHEN active_assignment_count = 1 AND NOT identity_unresolved
        THEN 'faculty_profile ' || holder_employee_number ||
             ' holder_dept=' || COALESCE(holder_dept_id::text, 'NULL')
      WHEN active_assignment_count = 1
        THEN 'UNRESOLVED_IDENTITY(null_or_missing_faculty_profile_link)'
      WHEN active_assignment_count > 1
        THEN active_assignment_count || '_concurrent_active_assignments'
      ELSE 'no_currently_effective_assignment'
    END) AS semantic_position,
  wrong_unit_count,
  duplicate_count,
  inactive_assignment_count,
  expired_window_count,
  out_of_scope_active_head_count,
  CASE
    WHEN matched_profile_count > 1 THEN 'AMBIGUOUS'
    WHEN active_assignment_count > 1 THEN 'DUPLICATE'
    WHEN active_assignment_count = 1 AND identity_unresolved THEN 'AMBIGUOUS'
    WHEN active_assignment_count = 1
         AND holder_dept_id IS DISTINCT FROM dept_id THEN 'WRONG_UNIT'
    WHEN active_assignment_count = 1
         AND holder_employee_number IS DISTINCT FROM expected_employee_number THEN 'WRONG_IDENTITY'
    WHEN active_assignment_count = 1 THEN 'MATCHED'
    WHEN inactive_assignment_count > 0 THEN 'INACTIVE'
    WHEN expired_window_count > 0 THEN 'EXPIRED'
    ELSE 'MISSING'
  END AS final_classification
FROM resolved
ORDER BY dept_label
-- <<SHARED:CLASSIFICATION_BODY>>
;

ROLLBACK;
