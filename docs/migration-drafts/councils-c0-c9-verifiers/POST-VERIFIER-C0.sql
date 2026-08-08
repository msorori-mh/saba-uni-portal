-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY structural post-verifier for C0.
-- Run after: 20260808120000_councils_c0_write_surface_hardening_01.sql
-- No DML, no writes, no DROP. Fail-closed.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_expected_tables text[] := ARRAY[
    'academic_councils',
    'academic_council_members',
    'academic_council_meetings',
    'academic_council_topics',
    'academic_council_agenda_items',
    'academic_council_minutes',
    'academic_council_decisions'
  ];
  v_expected_funcs text[] := ARRAY[
    'can_write_council_agenda',
    'can_schedule_council_meeting',
    'can_manage_council',
    'council_require_auth_uid',
    'council_deny',
    'council_link_membership',
    'council_deactivate_membership',
    'council_schedule_meeting',
    'council_update_meeting_metadata',
    'council_submit_topic',
    'council_update_own_topic_draft',
    'council_review_topic',
    'council_add_topic_to_agenda',
    'council_add_manual_agenda_item',
    'council_update_agenda_item',
    'council_reorder_agenda_items',
    'council_finalize_meeting_agenda'
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
    RAISE EXCEPTION 'HOLD: C0 predecessor tables missing: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_missing
  FROM unnest(v_expected_funcs) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C0 functions missing: %', array_to_string(v_missing, ', ');
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

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF has_table_privilege('authenticated', 'public.academic_council_meetings', 'INSERT') THEN
      RAISE EXCEPTION 'HOLD: authenticated still has INSERT on academic_council_meetings';
    END IF;
  ELSE
    RAISE NOTICE 'C0_POST_VERIFIER_INFO: role authenticated absent; INSERT privilege check skipped';
  END IF;

  RAISE NOTICE 'COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS' AS post_verifier_status;
