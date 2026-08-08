-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C6.
-- Run after: 20260808160000_councils_c6_decisions_followup_01.sql
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_funcs text[] := ARRAY[
    'issue_council_decision',
    'update_council_decision_followup',
    'complete_council_decision'
  ];
  v_expected_indexes text[] := ARRAY[
    'idx_acdec_agenda_item',
    'idx_acdec_minutes',
    'idx_acdec_canonical_num'
  ];
  v_missing text[];
  v_fname text;
  v_prosecdef boolean;
  v_proconfig text[];
BEGIN
  IF to_regclass('public.academic_council_decisions') IS NULL THEN
    RAISE EXCEPTION 'HOLD: academic_council_decisions missing';
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C6 functions missing: %', array_to_string(v_missing, ', ');
  END IF;

  FOREACH v_fname IN ARRAY v_expected_funcs
  LOOP
    SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fname
    ORDER BY p.oid
    LIMIT 1;

    IF v_prosecdef IS NOT TRUE THEN
      RAISE EXCEPTION 'HOLD: % is not SECURITY DEFINER', v_fname;
    END IF;
    IF NOT (coalesce(v_proconfig, ARRAY[]::text[]) @> ARRAY['search_path=public, pg_temp']) THEN
      RAISE EXCEPTION 'HOLD: % does not set search_path=public, pg_temp', v_fname;
    END IF;
  END LOOP;

  SELECT array_agg(idx ORDER BY idx) INTO v_missing
  FROM unnest(v_expected_indexes) idx
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = idx
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C6 indexes missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
