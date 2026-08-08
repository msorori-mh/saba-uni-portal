-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C9.
-- Run after: 20260808180000_councils_c9_notifications_reporting_01.sql
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_tables text[] := ARRAY[
    'academic_council_notifications'
  ];
  v_expected_funcs text[] := ARRAY[
    'create_council_notification',
    'get_my_council_notifications',
    'acknowledge_council_notification',
    'get_council_report_meetings_by_period',
    'get_council_chair_dashboard',
    'get_council_secretary_dashboard',
    'get_council_member_workspace',
    'get_council_responsible_decisions'
  ];
  v_expected_policies text[] := ARRAY[
    'ac_notifications_select_own',
    'ac_notifications_update_own_read'
  ];
  v_missing text[];
  v_fname text;
  v_prosecdef boolean;
  v_proconfig text[];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO v_missing
  FROM unnest(v_expected_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C9 tables missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_expected_tables)
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C9 RLS not enabled on: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C9 functions missing: %', array_to_string(v_missing, ', ');
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
    RAISE EXCEPTION 'HOLD: C9 policies missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
