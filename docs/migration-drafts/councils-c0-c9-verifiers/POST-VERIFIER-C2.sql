-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C2.
-- Run after: 20260808122000_councils_c2_topic_intake_review_01.sql
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_funcs text[] := ARRAY[
    'can_submit_to_council_meeting_intake',
    'can_review_council_topic_prepare',
    'can_review_council_topic_final',
    'council_topic_transition_is_legal',
    'council_resubmit_topic'
  ];
  -- IMMUTABLE helper is not SECURITY DEFINER; still requires pinned search_path.
  v_secdef_funcs text[] := ARRAY[
    'can_submit_to_council_meeting_intake',
    'can_review_council_topic_prepare',
    'can_review_council_topic_final',
    'council_resubmit_topic'
  ];
  v_search_path_funcs text[] := ARRAY[
    'can_submit_to_council_meeting_intake',
    'can_review_council_topic_prepare',
    'can_review_council_topic_final',
    'council_topic_transition_is_legal',
    'council_resubmit_topic'
  ];
  v_missing text[];
  v_fname text;
  v_prosecdef boolean;
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
    RAISE EXCEPTION 'HOLD: C2 functions missing: %', array_to_string(v_missing, ', ');
  END IF;

  FOREACH v_fname IN ARRAY v_secdef_funcs
  LOOP
    SELECT p.prosecdef
    INTO v_prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fname
    ORDER BY p.oid
    LIMIT 1;

    IF v_prosecdef IS NOT TRUE THEN
      RAISE EXCEPTION 'HOLD: % is not SECURITY DEFINER', v_fname;
    END IF;
  END LOOP;

  FOREACH v_fname IN ARRAY v_search_path_funcs
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

  RAISE NOTICE 'COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
