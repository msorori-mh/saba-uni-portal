-- PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
-- Post-verifier for COMPLETION migration.
-- Run after: 20260808210100_ga_mvp_completion_01.sql
-- Read-only and fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_tables text[] := ARRAY[
    'graduate_followups',
    'graduate_communication_events',
    'graduate_account_continuity_policies'
  ];
  v_missing text[];
  v_expected_types text[] := ARRAY[
    'graduate_followup_state',
    'graduate_account_policy_state'
  ];
  v_missing_types text[];
  v_expected_funcs text[] := ARRAY[
    'enforce_graduate_followup_update',
    'enforce_graduate_communication_consent',
    'enforce_graduate_account_policy_update',
    'evaluate_graduate_account_continuity',
    'graduate_supersede_account_continuity_policy',
    'graduate_aggregate_employment_report'
  ];
  v_missing_funcs text[];
BEGIN
  SELECT array_agg(t) INTO v_missing
  FROM unnest(v_expected_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: missing tables: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(t) INTO v_missing_types
  FROM unnest(v_expected_types) t
  WHERE to_regtype('public.' || t) IS NULL;
  IF v_missing_types IS NOT NULL THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: missing types: %', array_to_string(v_missing_types, ', ');
  END IF;

  SELECT array_agg(f) INTO v_missing_funcs
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: missing functions: %', array_to_string(v_missing_funcs, ', ');
  END IF;

  -- RLS enabled on completion tables.
  SELECT array_agg(c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_expected_tables)
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: RLS not enabled on: %', array_to_string(v_missing, ', ');
  END IF;

  -- Continuity uniqueness: exactly one current policy per code.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'graduate_account_continuity_policies'
      AND indexname = 'graduate_account_continuity_policies_one_current'
  ) THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: continuity one_current partial unique index missing';
  END IF;

  -- Follow-up FSM: one active per graduate.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'graduate_followups'
      AND indexname = 'graduate_followups_one_active_per_graduate'
  ) THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: graduate_followups_one_active_per_graduate index missing';
  END IF;

  -- Revoke on sensitive RPCs.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE grantee IN ('PUBLIC','anon','authenticated')
      AND table_schema = 'public'
      AND table_name IN ('evaluate_graduate_account_continuity','graduate_supersede_account_continuity_policy','graduate_aggregate_employment_report')
  ) THEN
    RAISE EXCEPTION 'COMPLETION verifier HOLD: internal/report functions granted to client roles';
  END IF;

  RAISE NOTICE 'COMPLETION_POST_VERIFIER_PASS';
END $$;

SELECT 'COMPLETION_POST_VERIFIER_PASS' AS status;
