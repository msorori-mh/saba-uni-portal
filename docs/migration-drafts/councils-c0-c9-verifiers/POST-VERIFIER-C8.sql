-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C8.
-- Run after: 20260808171000_councils_c0_c8_final_security_closure_01.sql
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_funcs text[] := ARRAY[
    'council_decision_transition_is_legal'
  ];
  v_expected_triggers text[] := ARRAY[
    'trg_ac_archived_decisions_guard',
    'trg_ac_archived_agenda_guard',
    'trg_ac_archived_votes_guard',
    'trg_ac_archived_vote_results_guard',
    'trg_ac_archived_minutes_guard'
  ];
  v_missing text[];
  v_fname text;
  v_proconfig text[];
BEGIN
  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C8 functions missing: %', array_to_string(v_missing, ', ');
  END IF;

  -- IMMUTABLE legality helper: require pinned search_path (not SECURITY DEFINER).
  FOREACH v_fname IN ARRAY v_expected_funcs
  LOOP
    SELECT p.proconfig
    INTO v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fname
    ORDER BY p.oid
    LIMIT 1;

    IF NOT (coalesce(v_proconfig, ARRAY[]::text[]) @> ARRAY['search_path=public, pg_temp']) THEN
      RAISE EXCEPTION 'HOLD: % does not set search_path=public, pg_temp', v_fname;
    END IF;
  END LOOP;

  SELECT array_agg(trg ORDER BY trg) INTO v_missing
  FROM unnest(v_expected_triggers) trg
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgname = trg
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C8 archive guard triggers missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
