-- =============================================================================
-- GA-SPECIALIST-SINGLE-DEPT-TESTONLY-FIXTURE-01.sql
-- Mission: PORTAL-PR338-GA-FINAL-RC-AND-DETERMINISTIC-SPECIALIST-RESOLUTION-01
-- Marker:  TEST_ONLY_GA_SPECIALIST_E2E_01
--
-- SOURCE-ONLY operator fixture package. NOT a schema migration.
-- DO NOT place under supabase/migrations.
-- DO NOT apply to production without explicit owner runtime grant + lease.
--
-- Default mode: DRY RUN (validates inside a transaction, then ROLLBACK).
-- Execute mode: SET ga.specialist_fixture.execute = 'true'; before running
--               (still requires auth user pre-provisioned when applicable).
--
-- Purpose:
--   Provide ONE operational GA specialist actor with exactly ONE department
--   binding for production E2E after GA3/AUTH04. Never grants all-department
--   access. Never mutates ambiguous specialist aa4f5c16-c993-4af6-a6d4-59d9542c1a7f.
-- =============================================================================

BEGIN;

SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '15s';

DO $provision$
DECLARE
  c_marker            constant text := 'TEST_ONLY_GA_SPECIALIST_E2E_01';
  c_execute           boolean := (coalesce(current_setting('ga.specialist_fixture.execute', true), '') = 'true');
  c_auth_preprov      boolean := (coalesce(current_setting('ga.specialist_fixture.auth_users_preprovisioned', true), '') = 'true');

  -- Existing production department (Computer Science). Not invented.
  c_dept              constant uuid := '11111111-1111-4111-8111-111111111111';

  -- Deterministic TEST_ONLY identities (namespace a6e30100-…)
  c_user_id           constant uuid := 'a6e30100-0000-4000-a100-000000000001';
  c_staff_profile_id  constant uuid := 'a6e30100-0000-4000-a300-000000000001';
  c_assignment_id     constant uuid := 'a6e30100-0000-4000-a500-000000000001';

  v_unit_id           uuid;
  v_role_id           uuid;
  v_ambiguous         constant uuid := 'aa4f5c16-c993-4af6-a6d4-59d9542c1a7f';
  v_spd_count         int;
  v_dept_ok           boolean;
BEGIN
  IF to_regclass('public.staff_profiles') IS NULL
     OR to_regclass('public.staff_profile_departments') IS NULL
     OR to_regclass('public.request_processing_assignments') IS NULL THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_PREFLIGHT_MISSING_BASE_TABLES';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.departments d WHERE d.id = c_dept AND d.is_active IS DISTINCT FROM false)
    INTO v_dept_ok;
  IF NOT v_dept_ok THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_DEPARTMENT_MISSING_OR_INACTIVE:%', c_dept;
  END IF;

  SELECT u.id INTO v_unit_id
  FROM public.request_processing_units u
  WHERE u.code = 'graduate_affairs' AND u.is_active
  LIMIT 1;
  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_UNIT_MISSING:graduate_affairs';
  END IF;

  SELECT r.id INTO v_role_id
  FROM public.request_processing_roles r
  WHERE r.unit_id = v_unit_id AND r.code = 'graduate_affairs_specialist' AND r.is_active
  LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_ROLE_MISSING:graduate_affairs_specialist';
  END IF;

  -- Hard forbid mutating the ambiguous live specialist.
  IF c_staff_profile_id = v_ambiguous THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_REFUSES_AMBIGUOUS_SPECIALIST';
  END IF;

  IF NOT c_execute THEN
    RAISE NOTICE 'DRY_RUN marker=% staff_profile_id=% department_id=% execute=false → ROLLBACK',
      c_marker, c_staff_profile_id, c_dept;
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_DRY_RUN_ABORT';
  END IF;

  IF NOT c_auth_preprov THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_AUTH_USER_PREPROVISION_REQUIRED:%', c_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = c_user_id) THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_AUTH_USER_MISSING:%', c_user_id;
  END IF;

  INSERT INTO public.staff_profiles AS sp (
    id, user_id, employee_number, full_name_ar, full_name_en,
    department_id, job_title, role_type, status, department_scope, email
  ) VALUES (
    c_staff_profile_id,
    c_user_id,
    c_marker || '-SPEC',
    'مختص اختبار شؤون الخريجين - ' || c_marker,
    'TEST_ONLY GA Specialist - ' || c_marker,
    c_dept,
    'مختص شؤون الخريجين (TEST_ONLY)',
    'graduate_affairs_specialist',
    'active',
    'departments',  -- never 'all'
    'test-only-ga-specialist@example.invalid'
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    employee_number = EXCLUDED.employee_number,
    full_name_ar = EXCLUDED.full_name_ar,
    full_name_en = EXCLUDED.full_name_en,
    department_id = EXCLUDED.department_id,
    job_title = EXCLUDED.job_title,
    role_type = EXCLUDED.role_type,
    status = EXCLUDED.status,
    department_scope = EXCLUDED.department_scope,
    email = EXCLUDED.email;

  -- Exactly one department binding (AUTH-04 authoritative).
  DELETE FROM public.staff_profile_departments
  WHERE staff_profile_id = c_staff_profile_id
    AND department_id IS DISTINCT FROM c_dept;

  INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
  VALUES (c_staff_profile_id, c_dept)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_spd_count
  FROM public.staff_profile_departments
  WHERE staff_profile_id = c_staff_profile_id;
  IF v_spd_count <> 1 THEN
    RAISE EXCEPTION 'GA_SPECIALIST_FIXTURE_SPD_NOT_EXACTLY_ONE:%', v_spd_count;
  END IF;

  INSERT INTO public.request_processing_assignments (
    id, unit_id, role_id, assignment_type, staff_profile_id, department_id, is_active, starts_at
  ) VALUES (
    c_assignment_id, v_unit_id, v_role_id, 'staff_profile', c_staff_profile_id, c_dept, true, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    unit_id = EXCLUDED.unit_id,
    role_id = EXCLUDED.role_id,
    assignment_type = EXCLUDED.assignment_type,
    staff_profile_id = EXCLUDED.staff_profile_id,
    department_id = EXCLUDED.department_id,
    is_active = true,
    ends_at = NULL,
    updated_at = now();

  RAISE NOTICE 'EXECUTED marker=% SAFE_SPECIALIST_CANDIDATE=% SAFE_SPECIALIST_DEPARTMENT=% spd_count=1',
    c_marker, c_staff_profile_id, c_dept;
END
$provision$;

-- Default path always aborts (dry-run RAISE or explicit rollback safety).
ROLLBACK;
