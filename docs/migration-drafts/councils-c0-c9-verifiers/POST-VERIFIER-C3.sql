-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C3.
-- Run after: 20260808130000_councils_c3_attendance_quorum_01.sql
-- No DML, no writes, no DROP. Fail-closed.
-- Note: open_council_session is C4 and must NOT be required here.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_types text[] := ARRAY[
    'academic_council_attendance_state',
    'academic_council_quorum_threshold_kind',
    'academic_council_quorum_policy_status',
    'academic_council_attendance_roll_status'
  ];
  v_expected_tables text[] := ARRAY[
    'academic_council_quorum_policies',
    'academic_council_meeting_attendance_rolls',
    'academic_council_meeting_attendance',
    'academic_council_meeting_quorum_evaluations',
    'academic_council_attendance_audit_events'
  ];
  v_expected_funcs text[] := ARRAY[
    'record_council_meeting_attendance',
    'evaluate_council_meeting_quorum',
    'council_approve_quorum_policy'
  ];
  v_expected_policies text[] := ARRAY[
    'ac_quorum_policies_select',
    'ac_attendance_rolls_select',
    'ac_meeting_attendance_select',
    'ac_quorum_evaluations_select',
    'ac_attendance_audit_select'
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
    RAISE EXCEPTION 'HOLD: C3 types missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(t ORDER BY t) INTO v_missing
  FROM unnest(v_expected_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C3 tables missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_expected_tables)
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C3 RLS not enabled on: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C3 functions missing: %', array_to_string(v_missing, ', ');
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
    RAISE EXCEPTION 'HOLD: C3 policies missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
