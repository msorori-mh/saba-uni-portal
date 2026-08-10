-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C4.
-- Run after: 20260808140000_councils_c4_session_voting_01.sql
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_types text[] := ARRAY[
    'academic_council_vote_value',
    'academic_council_agenda_item_session_status'
  ];
  v_expected_tables text[] := ARRAY[
    'academic_council_votes',
    'academic_council_vote_results'
  ];
  v_expected_funcs text[] := ARRAY[
    'open_council_session',
    'start_agenda_item_discussion',
    'open_agenda_item_vote',
    'cast_council_vote',
    'close_agenda_item_vote',
    'calculate_agenda_item_result',
    'resolve_agenda_item',
    'close_council_session'
  ];
  v_expected_policies text[] := ARRAY[
    'ac_votes_select',
    'ac_vote_results_select'
  ];
  v_missing text[];
  v_fname text;
  v_prosecdef boolean;
  v_proconfig text[];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO v_missing
  FROM unnest(v_expected_types) t
  WHERE to_regtype('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C4 types missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(t ORDER BY t) INTO v_missing
  FROM unnest(v_expected_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C4 tables missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_expected_tables)
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C4 RLS not enabled on: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C4 functions missing: %', array_to_string(v_missing, ', ');
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

  SELECT array_agg(pol ORDER BY pol) INTO v_missing
  FROM unnest(v_expected_policies) pol
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = pol
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C4 policies missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
