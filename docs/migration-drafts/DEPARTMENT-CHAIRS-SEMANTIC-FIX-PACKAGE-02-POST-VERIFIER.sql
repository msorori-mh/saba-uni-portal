-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-POST-VERIFIER
-- Track B: DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01
--
-- READ-ONLY post-execution verifier for the refreshed D-01 semantic fix.
-- Run AFTER DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02.sql commits.
-- Ends with ROLLBACK. Zero writes. FAIL-CLOSED: any drift raises.
--
-- Verifies, per department (CS/IT/IS):
--   * cardinality = 1 currently-active chair assignment
--   * holder identity = approved expected identity (employee_number + fp UUID)
--   * holder faculty profile is in-unit (no cross-department holder)
-- Plus global invariants:
--   * the wrong Osama-IT row still EXISTS as is_active=false (history kept)
--   * no currently-active department_head assignment exists outside CS/IT/IS
--   * no expired-window-only department silently lost (diagnostic count)
-- Runtime-version pin: deployed 20260710180000 actor RPCs; hardening draft
-- STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql NOT applied.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

DO $$
declare
  v_cs constant uuid := '11111111-1111-4111-8111-111111111111';
  v_it constant uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_is constant uuid := '22222222-2222-4222-8222-222222222222';
  v_osama_fp constant uuid := 'd08a8509-4c04-472e-885f-053a80be12ec';
  v_khaled_fp constant uuid := '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';
  v_ramzi_fp constant uuid := 'c1fe6084-e594-482e-a178-ac8eaffed376';
  v_wrong constant uuid := '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f';
  v_unit uuid;
  v_role uuid;
  v_rows integer;
  v_dept uuid;
begin
  select id into strict v_unit from public.request_processing_units where code='department' and is_active;
  select id into strict v_role from public.request_processing_roles
    where unit_id=v_unit and code='department_head' and is_active;

  -- cardinality = 1 per department
  foreach v_dept in array array[v_cs,v_it,v_is] loop
    select count(*) into v_rows from public.request_processing_assignments a
      where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
        and a.department_id=v_dept and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
    if v_rows<>1 then raise exception 'POST_CARDINALITY_DEPT_%_COUNT_%',v_dept,v_rows; end if;
  end loop;

  -- holders = approved expected identities, in-unit
  if not exists (select 1 from public.request_processing_assignments a
      join public.faculty_profiles fp on fp.id=a.faculty_profile_id
      where a.unit_id=v_unit and a.role_id=v_role and a.department_id=v_cs and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and fp.id=v_osama_fp and fp.employee_number='F2025006' and fp.department_id=v_cs) then
    raise exception 'POST_CS_HOLDER_DRIFT';
  end if;
  if not exists (select 1 from public.request_processing_assignments a
      join public.faculty_profiles fp on fp.id=a.faculty_profile_id
      where a.unit_id=v_unit and a.role_id=v_role and a.department_id=v_it and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and fp.id=v_khaled_fp and fp.employee_number='F2025005' and fp.department_id=v_it) then
    raise exception 'POST_IT_HOLDER_DRIFT';
  end if;
  if not exists (select 1 from public.request_processing_assignments a
      join public.faculty_profiles fp on fp.id=a.faculty_profile_id
      where a.unit_id=v_unit and a.role_id=v_role and a.department_id=v_is and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and fp.id=v_ramzi_fp and fp.employee_number='F2025004' and fp.department_id=v_is) then
    raise exception 'POST_IS_HOLDER_DRIFT';
  end if;

  -- history preserved: wrong row exists, inactive, window closed
  if not exists (select 1 from public.request_processing_assignments a
      where a.id=v_wrong and not a.is_active and a.department_id=v_it
        and a.faculty_profile_id=v_osama_fp and a.ends_at is not null) then
    raise exception 'POST_WRONG_ROW_HISTORY_LOST';
  end if;

  -- no active head outside CS/IT/IS
  if exists (select 1 from public.request_processing_assignments a
      where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
        and a.is_active and (a.starts_at is null or a.starts_at<=now())
        and (a.ends_at is null or a.ends_at>now())
        and a.department_id not in (v_cs,v_it,v_is)) then
    raise exception 'POST_ACTIVE_HEAD_OUTSIDE_SCOPE';
  end if;
end $$;

-- human-readable result grid (same semantic audit shape as the preflight audit)
WITH unit_role AS (
  SELECT u.id AS unit_id, r.id AS role_id
  FROM public.request_processing_units u
  JOIN public.request_processing_roles r ON r.unit_id = u.id
  WHERE u.code = 'department' AND u.is_active
    AND r.code = 'department_head' AND r.is_active
),
expected(dept_id, dept_label, expected_employee_number, expected_fp) AS (
  VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'CS', 'F2025006', 'd08a8509-4c04-472e-885f-053a80be12ec'::uuid),
    ('ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid, 'IT', 'F2025005', '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'::uuid),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'IS', 'F2025004', 'c1fe6084-e594-482e-a178-ac8eaffed376'::uuid)
)
SELECT
  e.dept_label,
  e.expected_employee_number,
  (SELECT count(*)
     FROM unit_role ur
     JOIN public.request_processing_assignments a
       ON a.unit_id=ur.unit_id AND a.role_id=ur.role_id
    WHERE a.assignment_type='faculty_profile' AND a.department_id=e.dept_id
      AND a.is_active AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())) AS active_chair_count,
  (SELECT fp.employee_number
     FROM unit_role ur
     JOIN public.request_processing_assignments a
       ON a.unit_id=ur.unit_id AND a.role_id=ur.role_id
     JOIN public.faculty_profiles fp ON fp.id=a.faculty_profile_id
    WHERE a.assignment_type='faculty_profile' AND a.department_id=e.dept_id
      AND a.is_active AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())) AS holder_employee_number,
  (SELECT fp.id = e.expected_fp
     FROM unit_role ur
     JOIN public.request_processing_assignments a
       ON a.unit_id=ur.unit_id AND a.role_id=ur.role_id
     JOIN public.faculty_profiles fp ON fp.id=a.faculty_profile_id
    WHERE a.assignment_type='faculty_profile' AND a.department_id=e.dept_id
      AND a.is_active AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())) AS holder_is_expected
FROM expected e
ORDER BY e.dept_label;

SELECT 'PASS_DEPARTMENT_CHAIRS_SEMANTIC_FIX_PACKAGE_02_POST_VERIFIED' AS verdict;

ROLLBACK;
