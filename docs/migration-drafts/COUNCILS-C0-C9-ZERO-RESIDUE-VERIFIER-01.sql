-- ACADEMIC-COUNCILS-PR306-RELEASE-QUALIFICATION-REMEDIATION-LONGRUN-12
-- Zero-residue verifier after TEST_ONLY cleanup.
-- READ-ONLY inventory. PASS only when TEST_ONLY_RESIDUE_TOTAL = 0.
-- Marker: TEST_ONLY_COUNCILS_C0_C9_E2E_01
-- Exact allowlisted IDs only (no LIKE '%TEST%').

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_marker constant text := 'TEST_ONLY_COUNCILS_C0_C9_E2E_01';
  v_preserve uuid := 'c0c90000-0000-4000-8000-ffffffffffff'::uuid;
  v_temp_councils uuid[] := ARRAY['c0c90000-0000-4000-8000-000000000001'::uuid];
  v_temp_users uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000101'::uuid,
    'c0c90000-0000-4000-8000-000000000102'::uuid,
    'c0c90000-0000-4000-8000-000000000103'::uuid,
    'c0c90000-0000-4000-8000-000000000104'::uuid,
    'c0c90000-0000-4000-8000-000000000105'::uuid,
    'c0c90000-0000-4000-8000-000000000106'::uuid
  ];
  v_meeting_ids uuid[] := ARRAY[]::uuid[];
  v_councils int := 0;
  v_members int := 0;
  v_meetings int := 0;
  v_topics int := 0;
  v_agenda int := 0;
  v_quorum_policies int := 0;
  v_quorum_evaluations int := 0;
  v_attendance_rolls int := 0;
  v_attendance int := 0;
  v_attendance_audit int := 0;
  v_votes int := 0;
  v_vote_results int := 0;
  v_minutes int := 0;
  v_minutes_amendments int := 0;
  v_decisions int := 0;
  v_audit_events int := 0;
  v_transition_events int := 0;
  v_notifications int := 0;
  v_fixture_registry int := 0;
  v_total int := 0;
  v_breakdown text;
BEGIN
  -- Discover any residual meetings still keyed to allowlisted councils
  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT coalesce(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_meeting_ids
    FROM public.academic_council_meetings m
    WHERE m.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_councils') IS NOT NULL THEN
    SELECT count(*) INTO v_councils
    FROM public.academic_councils c
    WHERE c.id = ANY (v_temp_councils);

    IF EXISTS (SELECT 1 FROM public.academic_councils WHERE id = v_preserve) THEN
      RAISE NOTICE 'ZERO_RESIDUE_SENTINEL_PRESERVED: %', v_preserve;
    ELSE
      RAISE NOTICE 'ZERO_RESIDUE_SENTINEL_ABSENT_OK: sentinel was not seeded in this environment';
    END IF;
  END IF;

  IF to_regclass('public.academic_council_members') IS NOT NULL THEN
    SELECT count(*) INTO v_members
    FROM public.academic_council_members m
    WHERE m.council_id = ANY (v_temp_councils)
      AND m.user_id = ANY (v_temp_users);
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT count(*) INTO v_meetings
    FROM public.academic_council_meetings m
    WHERE m.council_id = ANY (v_temp_councils)
       OR m.id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_topics') IS NOT NULL THEN
    SELECT count(*) INTO v_topics
    FROM public.academic_council_topics t
    WHERE t.council_id = ANY (v_temp_councils)
       OR t.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_agenda_items') IS NOT NULL THEN
    SELECT count(*) INTO v_agenda
    FROM public.academic_council_agenda_items a
    WHERE a.meeting_id = ANY (v_meeting_ids)
       OR EXISTS (
         SELECT 1 FROM public.academic_council_meetings m
         WHERE m.id = a.meeting_id AND m.council_id = ANY (v_temp_councils)
       );
  END IF;

  IF to_regclass('public.academic_council_quorum_policies') IS NOT NULL THEN
    SELECT count(*) INTO v_quorum_policies
    FROM public.academic_council_quorum_policies p
    WHERE p.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_meeting_quorum_evaluations') IS NOT NULL THEN
    SELECT count(*) INTO v_quorum_evaluations
    FROM public.academic_council_meeting_quorum_evaluations q
    WHERE q.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_meeting_attendance_rolls') IS NOT NULL THEN
    SELECT count(*) INTO v_attendance_rolls
    FROM public.academic_council_meeting_attendance_rolls r
    WHERE r.meeting_id = ANY (v_meeting_ids)
       OR r.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_meeting_attendance') IS NOT NULL THEN
    SELECT count(*) INTO v_attendance
    FROM public.academic_council_meeting_attendance a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_attendance_audit_events') IS NOT NULL THEN
    SELECT count(*) INTO v_attendance_audit
    FROM public.academic_council_attendance_audit_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_votes') IS NOT NULL THEN
    SELECT count(*) INTO v_votes
    FROM public.academic_council_votes v
    WHERE v.meeting_id = ANY (v_meeting_ids)
       OR v.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_vote_results') IS NOT NULL THEN
    SELECT count(*) INTO v_vote_results
    FROM public.academic_council_vote_results r
    WHERE r.meeting_id = ANY (v_meeting_ids)
       OR r.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_minutes') IS NOT NULL THEN
    SELECT count(*) INTO v_minutes
    FROM public.academic_council_minutes m
    WHERE m.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_minutes_amendments') IS NOT NULL THEN
    SELECT count(*) INTO v_minutes_amendments
    FROM public.academic_council_minutes_amendments a
    WHERE a.meeting_id = ANY (v_meeting_ids);
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    SELECT count(*) INTO v_decisions
    FROM public.academic_council_decisions d
    WHERE d.meeting_id = ANY (v_meeting_ids)
       OR EXISTS (
         SELECT 1 FROM public.academic_council_meetings m
         WHERE m.id = d.meeting_id AND m.council_id = ANY (v_temp_councils)
       );
  END IF;

  IF to_regclass('public.academic_council_audit_events') IS NOT NULL THEN
    SELECT count(*) INTO v_audit_events
    FROM public.academic_council_audit_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_meeting_transition_events') IS NOT NULL THEN
    SELECT count(*) INTO v_transition_events
    FROM public.academic_council_meeting_transition_events e
    WHERE e.meeting_id = ANY (v_meeting_ids)
       OR e.council_id = ANY (v_temp_councils);
  END IF;

  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    SELECT count(*) INTO v_notifications
    FROM public.academic_council_notifications n
    WHERE n.council_id = ANY (v_temp_councils)
       OR n.user_id = ANY (v_temp_users);
  END IF;

  IF to_regclass('public.academic_council_test_only_fixture_registry') IS NOT NULL THEN
    SELECT count(*) INTO v_fixture_registry
    FROM public.academic_council_test_only_fixture_registry r
    WHERE r.package_marker = v_marker;
  END IF;

  v_total :=
      v_councils
    + v_members
    + v_meetings
    + v_topics
    + v_agenda
    + v_quorum_policies
    + v_quorum_evaluations
    + v_attendance_rolls
    + v_attendance
    + v_attendance_audit
    + v_votes
    + v_vote_results
    + v_minutes
    + v_minutes_amendments
    + v_decisions
    + v_audit_events
    + v_transition_events
    + v_notifications
    + v_fixture_registry;

  v_breakdown := format(
    'councils=%s members=%s meetings=%s topics=%s agenda=%s quorum_policies=%s quorum_evaluations=%s attendance_rolls=%s attendance=%s attendance_audit=%s votes=%s vote_results=%s minutes=%s minutes_amendments=%s decisions=%s audit_events=%s transition_events=%s notifications=%s fixture_registry=%s',
    v_councils, v_members, v_meetings, v_topics, v_agenda,
    v_quorum_policies, v_quorum_evaluations, v_attendance_rolls, v_attendance, v_attendance_audit,
    v_votes, v_vote_results, v_minutes, v_minutes_amendments, v_decisions,
    v_audit_events, v_transition_events, v_notifications, v_fixture_registry
  );

  RAISE NOTICE 'TEST_ONLY_RESIDUE_BREAKDOWN: %', v_breakdown;

  IF v_total = 0 THEN
    RAISE NOTICE 'TEST_ONLY_RESIDUE_TOTAL=0';
    RAISE NOTICE 'COUNCILS_ZERO_RESIDUE_VERIFIER_PASS';
  ELSE
    RAISE EXCEPTION 'HOLD: TEST_ONLY_RESIDUE_TOTAL=% breakdown: %', v_total, v_breakdown;
  END IF;
END $$;

-- Reached only when DO block passed (residue_total must be 0).
SELECT
  0 AS residue_total,
  'COUNCILS_ZERO_RESIDUE_VERIFIER_PASS' AS zero_residue_status;
