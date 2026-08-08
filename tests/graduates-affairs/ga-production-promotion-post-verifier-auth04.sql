-- PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
-- Post-verifier for AUTH04 migration.
-- Run after: 20260808210200_ga_authorization_04.sql
-- Read-only and fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_funcs text[] := ARRAY[
    'graduate_affairs_audit',
    'graduate_affairs_resolve_authorized_staff_profile_id',
    'graduate_affairs_resolve_caller_authorized_staff_profile_id',
    'graduate_affairs_is_manager',
    'graduate_affairs_is_specialist',
    'graduate_affairs_specialist_department_ids',
    'graduate_is_self',
    'graduate_is_current_self',
    'graduate_require_approved_record_locked',
    'graduate_affairs_user_is_active_staff',
    'graduate_affairs_user_specialist_department_ids',
    'graduate_affairs_can_access_record',
    'graduate_audience_matches',
    'graduate_self_matches_audience',
    'graduate_update_own_profile',
    'graduate_grant_consent',
    'graduate_withdraw_consent',
    'graduate_add_contact_point',
    'graduate_revoke_contact_point',
    'graduate_my_contact_points',
    'graduate_report_employment',
    'graduate_submit_survey_response',
    'graduate_withdraw_survey_response',
    'graduate_register_for_event',
    'graduate_cancel_event_registration',
    'graduate_list_visible_opportunities',
    'graduate_list_visible_events',
    'graduate_affairs_get_graduate_file',
    'graduate_affairs_search_records',
    'graduate_affairs_create_followup',
    'graduate_affairs_transition_followup',
    'graduate_affairs_moderate_opportunity',
    'graduate_affairs_set_employer_verification',
    'graduate_affairs_cohort_employment_report',
    'graduate_affairs_resolve_self_context',
    'graduate_affairs_resolve_staff_record_access'
  ];
  v_missing_funcs text[];
  v_bad_func record;
  v_policy_count integer;
  v_expected_policies text[] := ARRAY[
    'graduate_profiles_select_self',
    'graduate_consents_select_self',
    'graduate_survey_responses_select_self',
    'graduate_event_registrations_select_self',
    'graduate_employment_events_select_self',
    'graduate_opportunities_select_audience',
    'graduate_events_select_audience'
  ];
  v_missing_policies text[];
  v_extra_policies text[];
  v_internal_funcs text[] := ARRAY[
    'graduate_affairs_audit',
    'graduate_affairs_resolve_authorized_staff_profile_id',
    'graduate_affairs_resolve_caller_authorized_staff_profile_id',
    'graduate_affairs_is_manager',
    'graduate_affairs_is_specialist',
    'graduate_affairs_specialist_department_ids',
    'graduate_affairs_can_access_record',
    'graduate_require_approved_record_locked',
    'graduate_affairs_user_is_active_staff',
    'graduate_affairs_user_specialist_department_ids',
    'graduate_is_self'
  ];
  v_granted_internal text[];
BEGIN
  SELECT array_agg(f) INTO v_missing_funcs
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: missing functions: %', array_to_string(v_missing_funcs, ', ');
  END IF;

  -- All auth functions must be SECURITY DEFINER with pinned search_path.
  FOR v_bad_func IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'graduate_%'
  LOOP
    IF NOT (
      SELECT prosecdef FROM pg_proc WHERE proname = v_bad_func.proname AND pronamespace = 'public'::regnamespace
    ) THEN
      RAISE EXCEPTION 'AUTH04 verifier HOLD: % is not SECURITY DEFINER', v_bad_func.proname;
    END IF;
    IF NOT (
      SELECT proconfig::text[] @> ARRAY['search_path=public, pg_temp']
      FROM pg_proc
      WHERE proname = v_bad_func.proname AND pronamespace = 'public'::regnamespace
    ) THEN
      RAISE EXCEPTION 'AUTH04 verifier HOLD: % does not set search_path = public, pg_temp', v_bad_func.proname;
    END IF;
  END LOOP;

  -- Internal helpers revoked from all client roles.
  SELECT array_agg(p.proname) INTO v_granted_internal
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_internal_funcs)
    AND EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proacl, ARRAY[]::aclitem[])) acl
      WHERE acl::text LIKE 'authenticated=%'
         OR acl::text LIKE 'anon=%'
         OR acl::text LIKE '=%'
    );
  IF v_granted_internal IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: internal helpers granted to client roles: %', array_to_string(v_granted_internal, ', ');
  END IF;

  -- Exactly 7 SELECT policies on expected tables.
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('graduate_profiles','graduate_consents','graduate_survey_responses','graduate_event_registrations','graduate_employment_events','graduate_opportunities','graduate_events');
  IF v_policy_count <> 7 THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: expected 7 GA SELECT policies, found %', v_policy_count;
  END IF;

  SELECT array_agg(polname) INTO v_missing_policies
  FROM unnest(v_expected_policies) polname
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = polname
  );
  IF v_missing_policies IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: missing policies: %', array_to_string(v_missing_policies, ', ');
  END IF;

  SELECT array_agg(policyname) INTO v_extra_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('graduate_profiles','graduate_consents','graduate_survey_responses','graduate_event_registrations','graduate_employment_events','graduate_opportunities','graduate_events')
    AND policyname <> ALL(v_expected_policies);
  IF v_extra_policies IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: unexpected extra policies: %', array_to_string(v_extra_policies, ', ');
  END IF;

  -- No INSERT/UPDATE/DELETE/ALL policies.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'graduate_%'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: mutating policies exist on GA tables';
  END IF;

  -- Moderation authority is manager-only.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'graduate_affairs_moderate_opportunity' AND pronamespace = 'public'::regnamespace)
     NOT LIKE '%graduate_affairs_is_manager()%'
  THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: moderate_opportunity does not gate on manager';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'graduate_affairs_set_employer_verification' AND pronamespace = 'public'::regnamespace)
     NOT LIKE '%graduate_affairs_is_manager()%'
  THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: set_employer_verification does not gate on manager';
  END IF;

  -- Context RPCs exist.
  IF to_regprocedure('public.graduate_affairs_resolve_self_context(text)') IS NULL THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: graduate_affairs_resolve_self_context missing';
  END IF;
  IF to_regprocedure('public.graduate_affairs_resolve_staff_record_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: graduate_affairs_resolve_staff_record_access missing';
  END IF;

  -- Row-version conflict contract in update_own_profile.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'graduate_update_own_profile' AND pronamespace = 'public'::regnamespace)
     NOT LIKE '%GRADUATE_PROFILE_VERSION_CONFLICT%'
  THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: update_own_profile missing row-version conflict contract';
  END IF;

  -- Self-read/self-write revocation semantics: list RPCs gate on current-self.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'graduate_list_visible_opportunities' AND pronamespace = 'public'::regnamespace)
     NOT LIKE '%graduate_is_current_self%'
  THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: list_visible_opportunities missing current-self gate';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'graduate_list_visible_events' AND pronamespace = 'public'::regnamespace)
     NOT LIKE '%graduate_is_current_self%'
  THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: list_visible_events missing current-self gate';
  END IF;

  -- Specialist scope binds only to authorizing profile.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'graduate_affairs_specialist_department_ids' AND pronamespace = 'public'::regnamespace)
     NOT LIKE '%spd.staff_profile_id = v_profile_id%'
  THEN
    RAISE EXCEPTION 'AUTH04 verifier HOLD: specialist_department_ids scope binding incorrect';
  END IF;

  RAISE NOTICE 'AUTH04_POST_VERIFIER_PASS';
END $$;

SELECT 'AUTH04_POST_VERIFIER_PASS' AS status;
