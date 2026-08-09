-- PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
-- Post-verifier for FOUNDATION migration.
-- Run after: 20260808210000_ga_mvp_foundation_01.sql
-- Read-only and fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_tables text[] := ARRAY[
    'graduate_official_decisions',
    'graduate_records',
    'graduate_profiles',
    'graduate_contact_points',
    'graduate_consents',
    'graduate_employers',
    'graduate_employment_events',
    'graduate_opportunities',
    'graduate_surveys',
    'graduate_survey_versions',
    'graduate_survey_responses',
    'graduate_events',
    'graduate_event_registrations',
    'graduate_domain_events'
  ];
  v_missing text[];
  v_expected_types text[] := ARRAY[
    'graduate_decision_state',
    'graduate_source_kind',
    'graduate_employment_status',
    'graduate_specialization_relationship',
    'graduate_opportunity_state'
  ];
  v_missing_types text[];
  v_expected_funcs text[] := ARRAY[
    'enforce_official_decision_immutability',
    'enforce_graduate_consent_identity_immutability',
    'enforce_published_engagement_scope_immutability',
    'enforce_graduate_record_official_decision',
    'enforce_graduate_record_state_update',
    'propagate_graduate_decision_state',
    'enforce_graduate_survey_consent',
    'enforce_graduate_event_consent',
    'reject_graduate_immutable_mutation',
    'create_graduate_record_from_official_decision'
  ];
  v_missing_funcs text[];
  v_bad_func record;
BEGIN
  SELECT array_agg(t) INTO v_missing
  FROM unnest(v_expected_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: missing tables: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(t) INTO v_missing_types
  FROM unnest(v_expected_types) t
  WHERE to_regtype('public.' || t) IS NULL;
  IF v_missing_types IS NOT NULL THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: missing types: %', array_to_string(v_missing_types, ', ');
  END IF;

  SELECT array_agg(f) INTO v_missing_funcs
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: missing functions: %', array_to_string(v_missing_funcs, ', ');
  END IF;

  -- All GA tables must have RLS enabled.
  SELECT array_agg(c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_expected_tables)
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: RLS not enabled on: %', array_to_string(v_missing, ', ');
  END IF;

  -- No policies should exist yet (Auth04 adds them).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(v_expected_tables)
  ) THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: unexpected policies exist before AUTH04';
  END IF;

  -- SECURITY DEFINER + search_path for all GA functions.
  FOR v_bad_func IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'graduate_%'
  LOOP
    IF NOT (
      SELECT prosecdef FROM pg_proc WHERE proname = v_bad_func.proname AND pronamespace = 'public'::regnamespace
    ) THEN
      RAISE EXCEPTION 'FOUNDATION verifier HOLD: % is not SECURITY DEFINER', v_bad_func.proname;
    END IF;
    IF NOT (
      SELECT proconfig::text[] @> ARRAY['search_path=public, pg_temp']
      FROM pg_proc
      WHERE proname = v_bad_func.proname AND pronamespace = 'public'::regnamespace
    ) THEN
      RAISE EXCEPTION 'FOUNDATION verifier HOLD: % does not set search_path = public, pg_temp', v_bad_func.proname;
    END IF;
  END LOOP;

  -- Unique partial index on graduate_records current award.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'graduate_records'
      AND indexname = 'graduate_records_one_current_award'
  ) THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: graduate_records_one_current_award index missing';
  END IF;

  -- create_graduate_record_from_official_decision must be revoked from clients.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE grantee IN ('PUBLIC','anon','authenticated')
      AND table_schema = 'public'
      AND table_name = 'create_graduate_record_from_official_decision'
  ) THEN
    RAISE EXCEPTION 'FOUNDATION verifier HOLD: create_graduate_record_from_official_decision is granted to a client role';
  END IF;

  RAISE NOTICE 'FOUNDATION_POST_VERIFIER_PASS';
END $$;

SELECT 'FOUNDATION_POST_VERIFIER_PASS' AS status;
