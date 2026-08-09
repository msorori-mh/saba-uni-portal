-- ACADEMIC-COUNCILS-PR306-RELEASE-QUALIFICATION-REMEDIATION-LONGRUN-12
-- TEST_ONLY cleanup — exact allowlisted council/user IDs only (no LIKE '%TEST%').
-- DRY RUN BY DEFAULT. Preserve non-test sentinel.
-- Marker: TEST_ONLY_COUNCILS_C0_C9_E2E_01
--
-- Dry-run control (session GUC; default true):
--   SELECT set_config('councils.pkg_dry_run', 'true', false);
--   SELECT set_config('councils.pkg_dry_run', 'false', false);
-- Execute ALSO requires BOTH:
--   SELECT set_config('councils.test_only.execute', 'true', false);
--   SELECT set_config('councils.test_only_execute', 'I_ACKNOWLEDGE_TEST_ONLY', false);

\set ON_ERROR_STOP on

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
  v_temp_users uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000101'::uuid,
    'c0c90000-0000-4000-8000-000000000102'::uuid,
    'c0c90000-0000-4000-8000-000000000103'::uuid,
    'c0c90000-0000-4000-8000-000000000104'::uuid,
    'c0c90000-0000-4000-8000-000000000105'::uuid,
    'c0c90000-0000-4000-8000-000000000106'::uuid
  ];
  v_meeting_ids uuid[] := ARRAY[]::uuid[];
  v_cand_councils int := 0;
  v_cand_meetings int := 0;
  v_cand_topics int := 0;
  v_cand_agenda int := 0;
  v_cand_decisions int := 0;
  v_cand_members int := 0;
  v_cand_notifications int := 0;
  v_cand_votes int := 0;
  v_cand_vote_results int := 0;
  v_cand_minutes int := 0;
  v_cand_minutes_amendments int := 0;
  v_cand_attendance int := 0;
  v_cand_attendance_rolls int := 0;
  v_cand_quorum_evaluations int := 0;
  v_cand_attendance_audit int := 0;
  v_cand_transition_events int := 0;
  v_cand_audit_events int := 0;
  v_cand_quorum_policies int := 0;
  v_cand_fixture_registry int := 0;
BEGIN
  IF p_package_marker IS DISTINCT FROM v_marker THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: cleanup allowed only for marker %', v_marker;
  END IF;

  IF p_preserve_council_id = ANY (v_temp_councils) THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: preserve sentinel must not appear in temp council allowlist';
  END IF;

  IF NOT p_dry_run THEN
    IF current_setting('councils.test_only.execute', true) IS DISTINCT FROM 'true'
       OR current_setting('councils.test_only_execute', true) IS DISTINCT FROM 'I_ACKNOWLEDGE_TEST_ONLY' THEN
      RAISE EXCEPTION 'HOLD: cleanup execute requires councils.test_only.execute=true AND councils.test_only_execute=I_ACKNOWLEDGE_TEST_ONLY';
    END IF;
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT coalesce(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_meeting_ids
    FROM public.academic_council_meetings m
    WHERE m.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_councils') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_councils
    FROM public.academic_councils c
    WHERE c.id = ANY (v_temp_councils) AND c.id <> p_preserve_council_id;
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_meetings
    FROM public.academic_council_meetings m
    WHERE m.id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_topics') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_topics
    FROM public.academic_council_topics t
    WHERE t.council_id = ANY (v_temp_councils)
       OR t.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_agenda_items') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_agenda
    FROM public.academic_council_agenda_items a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_decisions
    FROM public.academic_council_decisions d
    WHERE d.meeting_id = ANY (v_meeting_ids);
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
    WHERE n.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_votes') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_votes
    FROM public.academic_council_votes v
    WHERE v.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_vote_results') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_vote_results
    FROM public.academic_council_vote_results r
    WHERE r.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_minutes') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_minutes
    FROM public.academic_council_minutes m
    WHERE m.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_minutes_amendments') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_minutes_amendments
    FROM public.academic_council_minutes_amendments a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_attendance') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_attendance
    FROM public.academic_council_meeting_attendance a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_attendance_rolls') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_attendance_rolls
    FROM public.academic_council_meeting_attendance_rolls r
    WHERE r.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_quorum_evaluations') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_quorum_evaluations
    FROM public.academic_council_meeting_quorum_evaluations q
    WHERE q.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_attendance_audit_events') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_attendance_audit
    FROM public.academic_council_attendance_audit_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_meeting_transition_events') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_transition_events
    FROM public.academic_council_meeting_transition_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_audit_events') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_audit_events
    FROM public.academic_council_audit_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_quorum_policies') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_quorum_policies
    FROM public.academic_council_quorum_policies p
    WHERE p.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_test_only_fixture_registry') IS NOT NULL THEN
    SELECT count(*) INTO v_cand_fixture_registry
    FROM public.academic_council_test_only_fixture_registry r
    WHERE r.package_marker = v_marker;
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
      'candidate_votes', v_cand_votes,
      'candidate_vote_results', v_cand_vote_results,
      'candidate_minutes', v_cand_minutes,
      'candidate_minutes_amendments', v_cand_minutes_amendments,
      'candidate_attendance', v_cand_attendance,
      'candidate_attendance_rolls', v_cand_attendance_rolls,
      'candidate_quorum_evaluations', v_cand_quorum_evaluations,
      'candidate_attendance_audit', v_cand_attendance_audit,
      'candidate_transition_events', v_cand_transition_events,
      'candidate_audit_events', v_cand_audit_events,
      'candidate_quorum_policies', v_cand_quorum_policies,
      'candidate_fixture_registry', v_cand_fixture_registry,
      'status', 'CLEANUP_DRY_RUN'
    );
  END IF;

  -- Exact allowlist deletes only (child → parent). Replication role bypasses immutable triggers.
  PERFORM set_config('session_replication_role', 'replica', true);

  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    DELETE FROM public.academic_council_notifications n
    WHERE n.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    DELETE FROM public.academic_council_decisions d
    WHERE d.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_votes') IS NOT NULL THEN
    DELETE FROM public.academic_council_votes v
    WHERE v.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_vote_results') IS NOT NULL THEN
    DELETE FROM public.academic_council_vote_results r
    WHERE r.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_minutes_amendments') IS NOT NULL THEN
    DELETE FROM public.academic_council_minutes_amendments a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_minutes') IS NOT NULL THEN
    DELETE FROM public.academic_council_minutes m
    WHERE m.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_agenda_items') IS NOT NULL THEN
    DELETE FROM public.academic_council_agenda_items a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_topics') IS NOT NULL THEN
    DELETE FROM public.academic_council_topics t
    WHERE t.council_id = ANY (v_temp_councils)
       OR t.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_attendance') IS NOT NULL THEN
    DELETE FROM public.academic_council_meeting_attendance a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_quorum_evaluations') IS NOT NULL THEN
    DELETE FROM public.academic_council_meeting_quorum_evaluations q
    WHERE q.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_attendance_rolls') IS NOT NULL THEN
    DELETE FROM public.academic_council_meeting_attendance_rolls r
    WHERE r.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_attendance_audit_events') IS NOT NULL THEN
    DELETE FROM public.academic_council_attendance_audit_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_meeting_transition_events') IS NOT NULL THEN
    DELETE FROM public.academic_council_meeting_transition_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_audit_events') IS NOT NULL THEN
    DELETE FROM public.academic_council_audit_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    DELETE FROM public.academic_council_meetings m
    WHERE m.id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_members') IS NOT NULL THEN
    DELETE FROM public.academic_council_members m
    WHERE m.council_id = ANY (v_temp_councils)
      AND m.user_id = ANY (v_temp_users);
  END IF;

  IF to_regclass('public.academic_council_quorum_policies') IS NOT NULL THEN
    DELETE FROM public.academic_council_quorum_policies p
    WHERE p.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_test_only_fixture_registry') IS NOT NULL THEN
    DELETE FROM public.academic_council_test_only_fixture_registry r
    WHERE r.package_marker = v_marker;
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
    'deleted_meeting_count', coalesce(array_length(v_meeting_ids, 1), 0),
    'status', 'CLEANUP_EXECUTED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_councils_c0_c9_test_artifacts(text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;

-- Driver: dry-run by default via councils.pkg_dry_run GUC (unset/true => dry run).
DO $$
DECLARE
  v_dry_run boolean := coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false';
  v_result jsonb;
BEGIN
  IF NOT v_dry_run THEN
    IF current_setting('councils.test_only.execute', true) IS DISTINCT FROM 'true'
       OR current_setting('councils.test_only_execute', true) IS DISTINCT FROM 'I_ACKNOWLEDGE_TEST_ONLY' THEN
      RAISE EXCEPTION 'HOLD: cleanup execute requires councils.pkg_dry_run=false AND councils.test_only.execute=true AND councils.test_only_execute=I_ACKNOWLEDGE_TEST_ONLY';
    END IF;
  END IF;

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
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') = 'false'
  AND current_setting('councils.test_only.execute', true) = 'true'
  AND current_setting('councils.test_only_execute', true) = 'I_ACKNOWLEDGE_TEST_ONLY';
