-- PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
-- Operational configuration scripts (DRY RUN defaults).
-- DO NOT RUN AGAINST PRODUCTION automatically. Set dry_run := false only
-- inside a governed operational window after explicit approval.
--
-- Required inputs (replace NULLs with real UUIDs before any live run):
--   :manager_staff_profile_id
--   :specialist_staff_profile_id
--   :specialist_department_id
--   :continuity_decided_by_user_id

\set ON_ERROR_STOP on

-- Default to DRY RUN. Pass -v dry_run=false to psql to execute.
-- Required inputs (provide as psql -v name=value):
--   manager_staff_profile_id
--   specialist_staff_profile_id
--   specialist_department_id
--   continuity_decided_by_user_id

\if :{?dry_run}
\else
\set dry_run true
\endif
\if :{?manager_staff_profile_id}
\else
\set manager_staff_profile_id ''
\endif
\if :{?specialist_staff_profile_id}
\else
\set specialist_staff_profile_id ''
\endif
\if :{?specialist_department_id}
\else
\set specialist_department_id ''
\endif
\if :{?continuity_decided_by_user_id}
\else
\set continuity_decided_by_user_id ''
\endif

SET ga_config.dry_run = :'dry_run';
SET ga_config.manager_staff_profile_id = :'manager_staff_profile_id';
SET ga_config.specialist_staff_profile_id = :'specialist_staff_profile_id';
SET ga_config.specialist_department_id = :'specialist_department_id';
SET ga_config.continuity_decided_by_user_id = :'continuity_decided_by_user_id';

DO $$
DECLARE
  v_dry_run boolean := coalesce(current_setting('ga_config.dry_run', true), 'true')::boolean;
  v_manager_profile_id uuid := NULLIF(current_setting('ga_config.manager_staff_profile_id', true), '')::uuid;
  v_specialist_profile_id uuid := NULLIF(current_setting('ga_config.specialist_staff_profile_id', true), '')::uuid;
  v_specialist_department_id uuid := NULLIF(current_setting('ga_config.specialist_department_id', true), '')::uuid;
  v_continuity_decided_by uuid := NULLIF(current_setting('ga_config.continuity_decided_by_user_id', true), '')::uuid;
  v_manager_role_id uuid;
  v_specialist_role_id uuid;
  v_unit_id uuid;
  v_manager_user_id uuid;
  v_specialist_user_id uuid;
  v_existing_policy_count integer;
  v_existing_assignment_count integer;
BEGIN

  -- =====================================================================
  -- 0. Preconditions (always checked, even in dry run)
  -- =====================================================================
  SELECT id INTO v_unit_id
  FROM public.request_processing_units
  WHERE code = 'graduate_affairs' AND is_active;
  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: graduate_affairs unit missing or inactive';
  END IF;

  SELECT r.id INTO v_manager_role_id
  FROM public.request_processing_roles r
  WHERE r.unit_id = v_unit_id AND r.code = 'graduate_affairs_manager' AND r.is_active;
  IF v_manager_role_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: graduate_affairs_manager role missing or inactive';
  END IF;

  SELECT r.id INTO v_specialist_role_id
  FROM public.request_processing_roles r
  WHERE r.unit_id = v_unit_id AND r.code = 'graduate_affairs_specialist' AND r.is_active;
  IF v_specialist_role_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: graduate_affairs_specialist role missing or inactive';
  END IF;

  -- Validate manager profile: exactly one active staff profile.
  IF v_manager_profile_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: manager_staff_profile_id is required';
  END IF;
  SELECT sp.user_id INTO v_manager_user_id
  FROM public.staff_profiles sp
  WHERE sp.id = v_manager_profile_id AND sp.status = 'active';
  IF v_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: manager staff profile % is not active', v_manager_profile_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = v_manager_user_id AND sp.status = 'active' AND sp.id <> v_manager_profile_id
  ) THEN
    RAISE EXCEPTION 'CONFIG HOLD: manager user % owns more than one active staff_profile', v_manager_user_id;
  END IF;

  -- Validate specialist profile: exactly one active staff profile.
  IF v_specialist_profile_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: specialist_staff_profile_id is required';
  END IF;
  SELECT sp.user_id INTO v_specialist_user_id
  FROM public.staff_profiles sp
  WHERE sp.id = v_specialist_profile_id AND sp.status = 'active';
  IF v_specialist_user_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: specialist staff profile % is not active', v_specialist_profile_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = v_specialist_user_id AND sp.status = 'active' AND sp.id <> v_specialist_profile_id
  ) THEN
    RAISE EXCEPTION 'CONFIG HOLD: specialist user % owns more than one active staff_profile', v_specialist_user_id;
  END IF;

  -- Validate specialist department scope.
  IF v_specialist_department_id IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: specialist_department_id is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profile_departments
    WHERE staff_profile_id = v_specialist_profile_id AND department_id = v_specialist_department_id
  ) THEN
    RAISE EXCEPTION 'CONFIG HOLD: specialist profile % is not scoped to department %', v_specialist_profile_id, v_specialist_department_id;
  END IF;

  -- Validate continuity policy provenance.
  IF v_continuity_decided_by IS NULL THEN
    RAISE EXCEPTION 'CONFIG HOLD: continuity_decided_by_user_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_continuity_decided_by) THEN
    RAISE EXCEPTION 'CONFIG HOLD: continuity_decided_by_user_id % does not exist in auth.users', v_continuity_decided_by;
  END IF;

  -- Ensure no existing current continuity policy (exactly one current approved policy rule).
  SELECT count(*) INTO v_existing_policy_count
  FROM public.graduate_account_continuity_policies
  WHERE is_current;
  IF v_existing_policy_count > 0 THEN
    RAISE EXCEPTION 'CONFIG HOLD: a current graduate_account_continuity_policies row already exists (count=%). Use supersession, do not insert a second current row.', v_existing_policy_count;
  END IF;

  -- =====================================================================
  -- 1. Manager assignment (revocable; staff_profile typed)
  -- =====================================================================
  SELECT count(*) INTO v_existing_assignment_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_unit_id
    AND a.role_id = v_manager_role_id
    AND a.assignment_type = 'staff_profile'
    AND a.staff_profile_id = v_manager_profile_id;

  IF v_dry_run THEN
    RAISE NOTICE 'DRY RUN: would ensure manager assignment (unit=graduate_affairs, role=graduate_affairs_manager, staff_profile_id=%, user_id=%); existing=%',
      v_manager_profile_id, v_manager_user_id, v_existing_assignment_count;
  ELSE
    IF v_existing_assignment_count = 0 THEN
      INSERT INTO public.request_processing_assignments
        (unit_id, role_id, assignment_type, staff_profile_id, is_active, starts_at, ends_at)
      VALUES
        (v_unit_id, v_manager_role_id, 'staff_profile', v_manager_profile_id, true, now(), NULL);
      RAISE NOTICE 'LIVE: created manager assignment for staff_profile_id=%', v_manager_profile_id;
    ELSE
      UPDATE public.request_processing_assignments
      SET is_active = true,
          starts_at = coalesce(starts_at, now()),
          ends_at = NULL
      WHERE unit_id = v_unit_id
        AND role_id = v_manager_role_id
        AND assignment_type = 'staff_profile'
        AND staff_profile_id = v_manager_profile_id;
      RAISE NOTICE 'LIVE: reconciled existing manager assignment for staff_profile_id=%', v_manager_profile_id;
    END IF;
  END IF;

  -- =====================================================================
  -- 2. Specialist assignment (revocable; staff_profile typed)
  -- =====================================================================
  SELECT count(*) INTO v_existing_assignment_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_unit_id
    AND a.role_id = v_specialist_role_id
    AND a.assignment_type = 'staff_profile'
    AND a.staff_profile_id = v_specialist_profile_id;

  IF v_dry_run THEN
    RAISE NOTICE 'DRY RUN: would ensure specialist assignment (unit=graduate_affairs, role=graduate_affairs_specialist, staff_profile_id=%, user_id=%, department_id=%); existing=%',
      v_specialist_profile_id, v_specialist_user_id, v_specialist_department_id, v_existing_assignment_count;
  ELSE
    IF v_existing_assignment_count = 0 THEN
      INSERT INTO public.request_processing_assignments
        (unit_id, role_id, assignment_type, staff_profile_id, department_id, is_active, starts_at, ends_at)
      VALUES
        (v_unit_id, v_specialist_role_id, 'staff_profile', v_specialist_profile_id, v_specialist_department_id, true, now(), NULL);
      RAISE NOTICE 'LIVE: created specialist assignment for staff_profile_id=%', v_specialist_profile_id;
    ELSE
      UPDATE public.request_processing_assignments
      SET is_active = true,
          department_id = v_specialist_department_id,
          starts_at = coalesce(starts_at, now()),
          ends_at = NULL
      WHERE unit_id = v_unit_id
        AND role_id = v_specialist_role_id
        AND assignment_type = 'staff_profile'
        AND staff_profile_id = v_specialist_profile_id;
      RAISE NOTICE 'LIVE: reconciled existing specialist assignment for staff_profile_id=%', v_specialist_profile_id;
    END IF;
  END IF;

  -- =====================================================================
  -- 3. Continuity policy: exactly one current approved policy
  -- =====================================================================
  IF v_dry_run THEN
    RAISE NOTICE 'DRY RUN: would insert current approved continuity policy (policy_code=graduate-account-continuity, decided_by=%, allow_portal_sign_in=true, allow_university_email_reuse=false, capabilities=[portal_sign_in, profile_self_service_non_academic, graduate_survey_participation, notification_receive_non_sensitive])',
      v_continuity_decided_by;
  ELSE
    INSERT INTO public.graduate_account_continuity_policies (
      policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse,
      allowed_capabilities, decided_by, decided_at, is_current
    ) VALUES (
      'graduate-account-continuity',
      'approved',
      true,
      false,
      '["portal_sign_in", "profile_self_service_non_academic", "graduate_survey_participation", "notification_receive_non_sensitive"]'::jsonb,
      v_continuity_decided_by,
      now(),
      true
    );
    RAISE NOTICE 'LIVE: created current approved continuity policy';
  END IF;

  RAISE NOTICE 'CONFIG_PACKAGE_DRY_RUN_COMPLETE: dry_run=%', v_dry_run;
END $$;
