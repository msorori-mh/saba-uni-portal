-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- TEST_ONLY cleanup — exact IDs / marker only.
-- DRY RUN BY DEFAULT. No broad LIKE deletes. Preserve non-test sentinel.
-- Marker: TEST_ONLY_COUNCILS_C0_C9_E2E_01

\set ON_ERROR_STOP on

-- Dry-run control (session GUC; default true):
--   SELECT set_config('councils.pkg_dry_run', 'true', false);
--   SELECT set_config('councils.pkg_dry_run', 'false', false);

CREATE OR REPLACE FUNCTION public.cleanup_councils_c0_c9_test_artifacts(
  p_package_marker text DEFAULT 'TEST_ONLY_COUNCILS_C0_C9_E2E_01',
  p_dry_run boolean DEFAULT true,
  p_preserve_council_id uuid DEFAULT 'c0c90000-0000-4000-8000-ffffffffffff'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marker constant text := 'TEST_ONLY_COUNCILS_C0_C9_E2E_01';
  v_temp_councils uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000001'::uuid
  ];
  v_temp_meetings uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000010'::uuid
  ];
  v_temp_topics uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000020'::uuid
  ];
  v_temp_agenda uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000030'::uuid
  ];
  v_temp_decisions uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000040'::uuid
  ];
  v_temp_users uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000101'::uuid,
    'c0c90000-0000-4000-8000-000000000102'::uuid,
    'c0c90000-0000-4000-8000-000000000103'::uuid,
    'c0c90000-0000-4000-8000-000000000104'::uuid,
    'c0c90000-0000-4000-8000-000000000105'::uuid,
    'c0c90000-0000-4000-8000-000000000106'::uuid
  ];
  v_cand_councils int := 0;
  v_cand_meetings int := 0;
  v_cand_topics int := 0;
  v_cand_agenda int := 0;
  v_cand_decisions int := 0;
  v_cand_members int := 0;
  v_cand_notifications int := 0;
BEGIN
  IF p_package_marker IS DISTINCT FROM v_marker THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: cleanup allowed only for marker %', v_marker;
  END IF;

  IF p_preserve_council_id = ANY (v_temp_councils) THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: preserve sentinel must not appear in temp council allowlist';
  END IF;

  IF to_regclass('public.academic_councils') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_councils
    FROM public.academic_councils c
    WHERE c.id = ANY (v_temp_councils) AND c.id <> p_preserve_council_id;
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_meetings
    FROM public.academic_council_meetings m
    WHERE m.id = ANY (v_temp_meetings);
  END IF;

  IF to_regclass('public.academic_council_topics') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_topics
    FROM public.academic_council_topics t
    WHERE t.id = ANY (v_temp_topics);
  END IF;

  IF to_regclass('public.academic_council_agenda_items') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_agenda
    FROM public.academic_council_agenda_items a
    WHERE a.id = ANY (v_temp_agenda);
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_decisions
    FROM public.academic_council_decisions d
    WHERE d.id = ANY (v_temp_decisions);
  END IF;

  IF to_regclass('public.academic_council_members') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_members
    FROM public.academic_council_members m
    WHERE m.council_id = ANY (v_temp_councils)
      AND m.user_id = ANY (v_temp_users);
  END IF;

  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_notifications
    FROM public.academic_council_notifications n
    WHERE n.council_id = ANY (v_temp_councils)
      AND n.user_id = ANY (v_temp_users);
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'marker', v_marker,
      'preserve_council_id', p_preserve_council_id,
      'candidate_councils', v_cand_councils,
      'candidate_meetings', v_cand_meetings,
      'candidate_topics', v_cand_topics,
      'candidate_agenda', v_cand_agenda,
      'candidate_decisions', v_cand_decisions,
      'candidate_members', v_cand_members,
      'candidate_notifications', v_cand_notifications,
      'status', 'CLEANUP_DRY_RUN'
    );
  END IF;

  -- Exact-ID deletes only (child → parent). Session replication bypass for local harness.
  PERFORM set_config('session_replication_role', 'replica', true);

  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    DELETE FROM public.academic_council_notifications n
    WHERE n.council_id = ANY (v_temp_councils) AND n.user_id = ANY (v_temp_users);
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    DELETE FROM public.academic_council_decisions d WHERE d.id = ANY (v_temp_decisions);
  END IF;

  IF to_regclass('public.academic_council_votes') IS NOT NULL THEN
    DELETE FROM public.academic_council_votes v WHERE v.meeting_id = ANY (v_temp_meetings);
  END IF;

  IF to_regclass('public.academic_council_vote_results') IS NOT NULL THEN
    DELETE FROM public.academic_council_vote_results r WHERE r.meeting_id = ANY (v_temp_meetings);
  END IF;

  IF to_regclass('public.academic_council_agenda_items') IS NOT NULL THEN
    DELETE FROM public.academic_council_agenda_items a WHERE a.id = ANY (v_temp_agenda);
  END IF;

  IF to_regclass('public.academic_council_topics') IS NOT NULL THEN
    DELETE FROM public.academic_council_topics t WHERE t.id = ANY (v_temp_topics);
  END IF;

  IF to_regclass('public.academic_council_minutes') IS NOT NULL THEN
    DELETE FROM public.academic_council_minutes m WHERE m.meeting_id = ANY (v_temp_meetings);
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    DELETE FROM public.academic_council_meetings m WHERE m.id = ANY (v_temp_meetings);
  END IF;

  IF to_regclass('public.academic_council_members') IS NOT NULL THEN
    DELETE FROM public.academic_council_members m
    WHERE m.council_id = ANY (v_temp_councils) AND m.user_id = ANY (v_temp_users);
  END IF;

  IF to_regclass('public.academic_councils') IS NOT NULL THEN
    DELETE FROM public.academic_councils c
    WHERE c.id = ANY (v_temp_councils) AND c.id <> p_preserve_council_id;
  END IF;

  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN jsonb_build_object(
    'dry_run', false,
    'marker', v_marker,
    'preserve_council_id', p_preserve_council_id,
    'status', 'CLEANUP_EXECUTED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_councils_c0_c9_test_artifacts(text, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- Driver: dry-run by default via councils.pkg_dry_run GUC (unset/true => dry run).
DO $$
DECLARE
  v_dry_run boolean := coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false';
  v_result jsonb;
BEGIN
  v_result := public.cleanup_councils_c0_c9_test_artifacts(
    'TEST_ONLY_COUNCILS_C0_C9_E2E_01',
    v_dry_run,
    'c0c90000-0000-4000-8000-ffffffffffff'::uuid
  );
  RAISE NOTICE 'CLEANUP_RESULT: %', v_result;
  IF v_dry_run THEN
    RAISE NOTICE 'COUNCILS_TESTONLY_CLEANUP_DRY_RUN_COMPLETE';
  ELSE
    RAISE NOTICE 'COUNCILS_TESTONLY_CLEANUP_EXECUTE_COMPLETE';
  END IF;
END $$;

SELECT 'COUNCILS_TESTONLY_CLEANUP_DRY_RUN_COMPLETE' AS cleanup_status
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false'
UNION ALL
SELECT 'COUNCILS_TESTONLY_CLEANUP_EXECUTE_COMPLETE' AS cleanup_status
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') = 'false';
