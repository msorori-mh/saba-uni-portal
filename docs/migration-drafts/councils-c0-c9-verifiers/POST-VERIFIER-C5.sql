-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C5.
-- Run after: 20260810180000_councils_c5_minutes_lifecycle_02.sql (CANONICAL_APPLY_CANDIDATE)
-- V1 20260808150000_councils_c5_minutes_lifecycle_01.sql is SUPERSEDED_DO_NOT_APPLY.
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_types text[] := ARRAY[
    'academic_council_minutes_status'
  ];
  v_expected_tables text[] := ARRAY[
    'academic_council_minutes_amendments'
  ];
  v_expected_funcs text[] := ARRAY[
    'draft_council_minutes',
    'submit_council_minutes_for_review',
    'approve_and_lock_council_minutes'
  ];
  v_expected_policies text[] := ARRAY[
    'ac_minutes_amendments_select'
  ];
  v_missing text[];
  v_fname text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_lock_def text;
BEGIN
  SELECT array_agg(t ORDER BY t) INTO v_missing
  FROM unnest(v_expected_types) t
  WHERE to_regtype('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C5 types missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(t ORDER BY t) INTO v_missing
  FROM unnest(v_expected_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C5 tables missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_expected_tables)
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C5 RLS not enabled on: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C5 functions missing: %', array_to_string(v_missing, ', ');
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

  SELECT pg_get_functiondef(p.oid) INTO v_lock_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'approve_and_lock_council_minutes'
  ORDER BY p.oid
  LIMIT 1;

  IF v_lock_def IS NULL OR position('extensions.digest(' in v_lock_def) = 0 THEN
    RAISE EXCEPTION 'HOLD: approve_and_lock_council_minutes must fully qualify extensions.digest';
  END IF;

  SELECT array_agg(pol ORDER BY pol) INTO v_missing
  FROM unnest(v_expected_policies) pol
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = pol
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C5 policies missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
