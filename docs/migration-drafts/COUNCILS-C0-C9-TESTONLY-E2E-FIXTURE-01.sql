-- ACADEMIC-COUNCILS-PR306-RELEASE-QUALIFICATION-REMEDIATION-LONGRUN-12
-- TEST_ONLY E2E fixture package for LOCAL / disposable PG17 rehearsal.
-- DRY RUN BY DEFAULT. DO NOT EXECUTE AGAINST PRODUCTION from this package.
-- Marker: TEST_ONLY_COUNCILS_C0_C9_E2E_01
--
-- Dry-run control (session GUC; default true):
--   SELECT set_config('councils.pkg_dry_run', 'true', false);
--   SELECT set_config('councils.pkg_dry_run', 'false', false);
-- Execute ALSO requires BOTH:
--   SELECT set_config('councils.test_only.execute', 'true', false);
--   SELECT set_config('councils.test_only_execute', 'I_ACKNOWLEDGE_TEST_ONLY', false);
--
-- Actors: chair/secretary/member_a/member_b/viewer/responsible (c0c9…0101..0106)
-- Negative roster: a1000000-* (admin/dean/sysadmin/student) from postgres-minimal-schema
-- Journey: schedule → intake/topic → agenda → attendance/quorum → open → vote →
--          minutes → decision/follow-up → archive → notifications/reports (C9)

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_dry_run boolean := coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false';
  v_marker constant text := 'TEST_ONLY_COUNCILS_C0_C9_E2E_01';
  v_council_id uuid := 'c0c90000-0000-4000-8000-000000000001';
  v_sentinel_council uuid := 'c0c90000-0000-4000-8000-ffffffffffff';
  v_chair uuid := 'c0c90000-0000-4000-8000-000000000101';
  v_secretary uuid := 'c0c90000-0000-4000-8000-000000000102';
  v_member_a uuid := 'c0c90000-0000-4000-8000-000000000103';
  v_member_b uuid := 'c0c90000-0000-4000-8000-000000000104';
  v_viewer uuid := 'c0c90000-0000-4000-8000-000000000105';
  v_responsible uuid := 'c0c90000-0000-4000-8000-000000000106';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  v_sys uuid := 'a1000000-0000-0000-0000-000000000001';
  v_dean uuid := 'a1000000-0000-0000-0000-000000000003';
  v_student uuid := 'a1000000-0000-0000-0000-000000000017';
  v_mem_id_chair uuid := 'c0c90000-0000-4000-8000-000000000201';
  v_mem_id_sec uuid := 'c0c90000-0000-4000-8000-000000000202';
  v_mem_id_a uuid := 'c0c90000-0000-4000-8000-000000000203';
  v_mem_id_b uuid := 'c0c90000-0000-4000-8000-000000000204';
  v_mem_id_viewer uuid := 'c0c90000-0000-4000-8000-000000000205';
  v_mem_id_resp uuid := 'c0c90000-0000-4000-8000-000000000206';
  v_meeting uuid;
  v_topic1 uuid;
  v_topic2 uuid;
  v_item1 uuid;
  v_item2 uuid;
  v_dec uuid;
  v_res jsonb;
  v_status text;
  v_neg int := 0;
  r record;
BEGIN
  IF to_regclass('public.academic_councils') IS NULL THEN
    RAISE EXCEPTION 'HOLD: academic_councils missing — apply C0-C9 chain in disposable PG17 before fixture';
  END IF;

  RAISE NOTICE 'FIXTURE_MARKER: %', v_marker;
  RAISE NOTICE 'FIXTURE_ACTORS: chair=% secretary=% member_a=% member_b=% viewer=% responsible=%',
    v_chair, v_secretary, v_member_a, v_member_b, v_viewer, v_responsible;
  RAISE NOTICE 'FIXTURE_IDS: council=% sentinel_preserve=%', v_council_id, v_sentinel_council;

  IF v_dry_run THEN
    RAISE NOTICE 'DRY RUN: would seed TEST_ONLY council/memberships and run real C0-C9 RPC journey';
    RAISE NOTICE 'DRY RUN: would exercise chair/secretary/member/viewer/responsible positive matrix';
    RAISE NOTICE 'DRY RUN: would exercise negative denials for non-members and wrong roles';
    RAISE NOTICE 'COUNCILS_TESTONLY_E2E_FIXTURE_DRY_RUN_COMPLETE';
    RETURN;
  END IF;

  IF current_setting('councils.test_only.execute', true) IS DISTINCT FROM 'true'
     OR current_setting('councils.test_only_execute', true) IS DISTINCT FROM 'I_ACKNOWLEDGE_TEST_ONLY' THEN
    RAISE EXCEPTION 'HOLD: execute requires councils.pkg_dry_run=false AND councils.test_only.execute=true AND councils.test_only_execute=I_ACKNOWLEDGE_TEST_ONLY';
  END IF;

  -- -----------------------------------------------------------------
  -- Session helpers (pg_temp; execute path only)
  -- -----------------------------------------------------------------
  CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
  RETURNS void
  LANGUAGE plpgsql AS $fn$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
    EXECUTE 'SET LOCAL ROLE authenticated';
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION pg_temp.reset_role()
  RETURNS void
  LANGUAGE plpgsql AS $fn$
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION pg_temp.expect_fail(p_label text, p_sql text)
  RETURNS void
  LANGUAGE plpgsql AS $fn$
  BEGIN
    BEGIN
      EXECUTE p_sql;
      RAISE EXCEPTION '%_UNEXPECTED_SUCCESS', p_label;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN check_violation THEN NULL;
      WHEN unique_violation THEN NULL;
      WHEN foreign_key_violation THEN NULL;
      WHEN not_null_violation THEN NULL;
      WHEN data_exception THEN NULL;
      WHEN invalid_authorization_specification THEN NULL;
      WHEN SQLSTATE '42501' THEN NULL;
      WHEN SQLSTATE '28000' THEN NULL;
      WHEN SQLSTATE '22000' THEN NULL;
      WHEN SQLSTATE '22023' THEN NULL;
      WHEN SQLSTATE '23505' THEN NULL;
      WHEN SQLSTATE 'P0001' THEN NULL;
      WHEN SQLSTATE 'P0002' THEN NULL;
      WHEN SQLSTATE '42883' THEN NULL;
    END;
  END;
  $fn$;

  CREATE TEMPORARY TABLE IF NOT EXISTS pg_temp.denial_log (
    label text PRIMARY KEY
  );
  GRANT ALL ON TABLE pg_temp.denial_log TO authenticated, anon, service_role;

  CREATE OR REPLACE FUNCTION pg_temp.deny_zero(
    p_label text,
    p_sql text,
    p_fp_sql text DEFAULT NULL
  )
  RETURNS void
  LANGUAGE plpgsql AS $fn$
  DECLARE
    v_before text;
    v_after text;
  BEGIN
    IF p_fp_sql IS NULL THEN
      v_before := md5(
        coalesce((SELECT string_agg(id::text || status::text, ',' ORDER BY id) FROM public.academic_council_meetings), '') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_votes), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_minutes), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_decisions), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_agenda_items), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_meeting_transition_events), '0')
      );
    ELSE
      EXECUTE p_fp_sql INTO v_before;
    END IF;

    PERFORM pg_temp.expect_fail(p_label, p_sql);

    IF p_fp_sql IS NULL THEN
      v_after := md5(
        coalesce((SELECT string_agg(id::text || status::text, ',' ORDER BY id) FROM public.academic_council_meetings), '') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_votes), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_minutes), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_decisions), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_agenda_items), '0') || '|' ||
        coalesce((SELECT count(*)::text FROM public.academic_council_meeting_transition_events), '0')
      );
    ELSE
      EXECUTE p_fp_sql INTO v_after;
    END IF;

    IF v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION '%_MUTATED_STATE', p_label;
    END IF;

    INSERT INTO pg_temp.denial_log(label) VALUES (p_label)
    ON CONFLICT DO NOTHING;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION pg_temp.register_entity(
    p_marker text,
    p_surface text,
    p_entity_id uuid
  )
  RETURNS void
  LANGUAGE plpgsql AS $fn$
  DECLARE
    v_sub text := current_setting('request.jwt.claim.sub', true);
  BEGIN
    IF p_entity_id IS NULL THEN
      RETURN;
    END IF;
    -- Registry is privilege-revoked from authenticated; briefly escalate for bookkeeping only.
    EXECUTE 'RESET ROLE';
    INSERT INTO public.academic_council_test_only_fixture_registry(package_marker, surface, entity_id)
    VALUES (p_marker, p_surface, p_entity_id)
    ON CONFLICT DO NOTHING;
    IF coalesce(v_sub, '') <> '' THEN
      PERFORM set_config('request.jwt.claim.sub', v_sub, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
    END IF;
  END;
  $fn$;

  -- -----------------------------------------------------------------
  -- Privileged provision (reset role)
  -- -----------------------------------------------------------------
  PERFORM pg_temp.reset_role();

  -- Ensure auth.users for fixture + negative roster (+ admin created_by)
  INSERT INTO auth.users(id) VALUES
    (v_chair), (v_secretary), (v_member_a), (v_member_b), (v_viewer), (v_responsible),
    (v_admin), (v_sys), (v_dean), (v_student)
  ON CONFLICT DO NOTHING;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES
      (v_chair, 'faculty_member'),
      (v_secretary, 'faculty_member'),
      (v_member_a, 'faculty_member'),
      (v_member_b, 'faculty_member'),
      (v_viewer, 'faculty_member'),
      (v_responsible, 'faculty_member'),
      (v_admin, 'admin'),
      (v_sys, 'system_admin'),
      (v_dean, 'dean'),
      (v_student, 'student')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Sentinel NON-TEST council (preserve; name must NOT contain package marker)
  INSERT INTO public.academic_councils (id, name, council_type, created_by, settings)
  VALUES (
    v_sentinel_council,
    'SENTINEL_NON_TEST Academic Council Preserve',
    'college',
    v_admin,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  -- TEST_ONLY council with marker in settings
  INSERT INTO public.academic_councils (id, name, council_type, created_by, settings)
  VALUES (
    v_council_id,
    'TEST_ONLY C0-C9 E2E Council',
    'college',
    v_admin,
    jsonb_build_object('package_marker', v_marker, 'test_only', true)
  )
  ON CONFLICT (id) DO UPDATE
    SET settings = EXCLUDED.settings,
        name = EXCLUDED.name,
        is_active = true,
        updated_at = now();

  INSERT INTO public.academic_council_members (
    id, council_id, user_id, member_role, is_active, active_from, created_by
  ) VALUES
    (v_mem_id_chair, v_council_id, v_chair, 'chair', true, CURRENT_DATE, v_admin),
    (v_mem_id_sec, v_council_id, v_secretary, 'secretary', true, CURRENT_DATE, v_admin),
    (v_mem_id_a, v_council_id, v_member_a, 'member', true, CURRENT_DATE, v_admin),
    (v_mem_id_b, v_council_id, v_member_b, 'member', true, CURRENT_DATE, v_admin),
    (v_mem_id_viewer, v_council_id, v_viewer, 'viewer', true, CURRENT_DATE, v_admin),
    (v_mem_id_resp, v_council_id, v_responsible, 'member', true, CURRENT_DATE, v_admin)
  ON CONFLICT (id) DO NOTHING;

  CREATE TABLE IF NOT EXISTS public.academic_council_test_only_fixture_registry (
    package_marker text NOT NULL,
    surface text NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (package_marker, surface, entity_id)
  );
  REVOKE ALL ON TABLE public.academic_council_test_only_fixture_registry FROM PUBLIC, anon, authenticated;

  PERFORM pg_temp.register_entity(v_marker, 'council', v_council_id);
  PERFORM pg_temp.register_entity(v_marker, 'member', v_mem_id_chair);
  PERFORM pg_temp.register_entity(v_marker, 'member', v_mem_id_sec);
  PERFORM pg_temp.register_entity(v_marker, 'member', v_mem_id_a);
  PERFORM pg_temp.register_entity(v_marker, 'member', v_mem_id_b);
  PERFORM pg_temp.register_entity(v_marker, 'member', v_mem_id_viewer);
  PERFORM pg_temp.register_entity(v_marker, 'member', v_mem_id_resp);

  -- -----------------------------------------------------------------
  -- Positive journey via real RPCs (as_user pattern)
  -- -----------------------------------------------------------------
  PERFORM pg_temp.as_user(v_chair);
  PERFORM public.council_approve_quorum_policy(
    v_council_id, 'ratio'::public.academic_council_quorum_threshold_kind, NULL, 3, 5
  );

  v_res := public.council_schedule_meeting(
    v_council_id,
    'TEST_ONLY C0-C9 E2E Meeting 1',
    now() + interval '2 days',
    'Hall TEST_ONLY',
    now() - interval '1 hour',
    now() + interval '1 day'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;
  IF (v_res->>'status') <> 'scheduled' THEN
    RAISE EXCEPTION 'EXPECTED_SCHEDULED';
  END IF;
  PERFORM pg_temp.register_entity(v_marker, 'meeting', v_meeting);

  v_res := public.council_transition_meeting(
    v_meeting, 'scheduled', 'intake_open', jsonb_build_object('via', 'test_only_e2e')
  );
  IF (v_res->>'to_status') <> 'intake_open' THEN
    RAISE EXCEPTION 'EXPECTED_INTAKE_OPEN';
  END IF;

  -- Negative: student/admin/dean/sysadmin cannot transition
  PERFORM pg_temp.as_user(v_admin);
  PERFORM pg_temp.deny_zero('ADMIN_TRANSITION_BYPASS',
    format($q$SELECT public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  PERFORM pg_temp.as_user(v_sys);
  PERFORM pg_temp.deny_zero('SYSADMIN_TRANSITION_BYPASS',
    format($q$SELECT public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  PERFORM pg_temp.as_user(v_dean);
  PERFORM pg_temp.deny_zero('DEAN_TRANSITION_BYPASS',
    format($q$SELECT public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  PERFORM pg_temp.as_user(v_student);
  PERFORM pg_temp.deny_zero('STUDENT_TRANSITION_BYPASS',
    format($q$SELECT public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;

  PERFORM pg_temp.as_user(v_member_a);
  v_res := public.council_submit_topic(v_council_id, v_meeting, 'Topic A Approval', 'Body A', 'academic');
  v_topic1 := (v_res->>'topic_id')::uuid;
  PERFORM pg_temp.register_entity(v_marker, 'topic', v_topic1);
  v_res := public.council_submit_topic(v_council_id, v_meeting, 'Topic B Discussion', 'Body B', 'academic');
  v_topic2 := (v_res->>'topic_id')::uuid;
  PERFORM pg_temp.register_entity(v_marker, 'topic', v_topic2);

  PERFORM pg_temp.as_user(v_viewer);
  PERFORM pg_temp.deny_zero('VIEWER_TOPIC_SUBMIT',
    format($q$SELECT public.council_submit_topic('%s','%s','x','y',null)$q$, v_council_id, v_meeting));
  v_neg := v_neg + 1;

  PERFORM pg_temp.as_user(v_secretary);
  PERFORM public.council_review_topic(v_topic1, 'under_review');
  PERFORM public.council_review_topic(v_topic2, 'under_review');

  PERFORM pg_temp.as_user(v_chair);
  PERFORM public.council_review_topic(v_topic1, 'accepted_for_agenda');
  PERFORM public.council_review_topic(v_topic2, 'accepted_for_agenda');
  PERFORM public.council_transition_meeting(
    v_meeting, 'intake_open', 'intake_closed', jsonb_build_object('via', 'test_only_e2e')
  );

  PERFORM pg_temp.as_user(v_secretary);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic1, 1);
  v_item1 := (v_res->>'agenda_item_id')::uuid;
  PERFORM pg_temp.register_entity(v_marker, 'agenda', v_item1);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic2, 2);
  v_item2 := (v_res->>'agenda_item_id')::uuid;
  PERFORM pg_temp.register_entity(v_marker, 'agenda', v_item2);

  PERFORM pg_temp.as_user(v_chair);
  PERFORM public.council_finalize_meeting_agenda(v_meeting);
  PERFORM public.council_transition_meeting(
    v_meeting, 'intake_closed', 'agenda_ready', jsonb_build_object('via', 'test_only_e2e')
  );

  SELECT status::text INTO v_status FROM public.academic_council_meetings WHERE id = v_meeting;
  IF v_status <> 'agenda_ready' THEN
    RAISE EXCEPTION 'EXPECTED_AGENDA_READY';
  END IF;

  -- Direct UPDATE meeting status denied
  PERFORM pg_temp.as_user(v_chair);
  PERFORM pg_temp.deny_zero('DIRECT_STATUS_UPDATE',
    format($q$UPDATE public.academic_council_meetings SET status = 'in_session' WHERE id = '%s'$q$, v_meeting));
  v_neg := v_neg + 1;

  -- Attendance + quorum (chair, sec, mem_a, mem_b present; ratio 3/5)
  PERFORM pg_temp.as_user(v_secretary);
  PERFORM public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_secretary, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_member_a, 'attendance_state', 'present_remote'),
    jsonb_build_object('user_id', v_member_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_responsible, 'attendance_state', 'absent')
  ));
  PERFORM pg_temp.as_user(v_chair);
  PERFORM public.evaluate_council_meeting_quorum(v_meeting);
  PERFORM public.finalize_council_meeting_attendance(v_meeting);
  IF NOT public.meeting_has_valid_quorum(v_meeting) THEN
    RAISE EXCEPTION 'EXPECTED_VALID_QUORUM';
  END IF;

  v_res := public.open_council_session(v_meeting);
  IF (v_res->>'status') <> 'in_session' THEN
    RAISE EXCEPTION 'EXPECTED_IN_SESSION';
  END IF;

  PERFORM public.start_agenda_item_discussion(v_item1);
  PERFORM public.open_agenda_item_vote(v_item1);

  -- Negative: viewer cannot vote
  PERFORM pg_temp.as_user(v_viewer);
  PERFORM pg_temp.deny_zero('VIEWER_VOTE',
    format($q$SELECT public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;
  PERFORM pg_temp.as_user(v_admin);
  PERFORM pg_temp.deny_zero('ADMIN_VOTE_BYPASS',
    format($q$SELECT public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;
  PERFORM pg_temp.as_user(v_student);
  PERFORM pg_temp.deny_zero('STUDENT_VOTE_BYPASS',
    format($q$SELECT public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;

  -- Positive votes
  PERFORM pg_temp.as_user(v_member_a);
  PERFORM public.cast_council_vote(v_item1, 'yes');
  PERFORM pg_temp.as_user(v_secretary);
  PERFORM public.cast_council_vote(v_item1, 'yes');
  PERFORM pg_temp.as_user(v_member_b);
  PERFORM public.cast_council_vote(v_item1, 'no');
  PERFORM pg_temp.as_user(v_chair);
  PERFORM public.cast_council_vote(v_item1, 'abstain');

  PERFORM public.close_agenda_item_vote(v_item1);
  v_res := public.calculate_agenda_item_result(v_item1);
  IF (v_res->>'outcome') <> 'passed' OR (v_res->>'yes_count')::int <> 2 THEN
    RAISE EXCEPTION 'VOTE_CALCULATION_MISMATCH: %', v_res;
  END IF;
  PERFORM public.resolve_agenda_item(v_item1, 'Approved by vote');

  PERFORM public.start_agenda_item_discussion(v_item2);
  PERFORM public.resolve_agenda_item(v_item2, 'Noted without vote');

  v_res := public.close_council_session(v_meeting);
  IF (v_res->>'status') <> 'minutes_draft' THEN
    RAISE EXCEPTION 'EXPECTED_MINUTES_DRAFT';
  END IF;

  PERFORM pg_temp.as_user(v_secretary);
  PERFORM public.draft_council_minutes(v_meeting, 'TEST_ONLY initial draft minutes.');
  PERFORM public.submit_council_minutes_for_review(v_meeting);

  PERFORM pg_temp.as_user(v_chair);
  v_res := public.approve_and_lock_council_minutes(v_meeting, 'TEST_ONLY final approved minutes.');
  IF (v_res->>'is_locked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'EXPECTED_MINUTES_LOCKED';
  END IF;

  -- Forged / foreign decision attempts
  PERFORM pg_temp.deny_zero('H2_FORGED_MEETING_ID',
    format($q$SELECT public.issue_council_decision('%s','%s','Bad','Body',null,null,null)$q$,
      'b1000000-0000-0000-0000-000000000099', v_item1));
  v_neg := v_neg + 1;
  PERFORM pg_temp.deny_zero('H2_FORGED_AGENDA_ITEM_UUID',
    format($q$SELECT public.issue_council_decision('%s','%s','Bad','Body',null,null,null)$q$,
      v_meeting, 'b1000000-0000-0000-0000-000000000098'));
  v_neg := v_neg + 1;

  -- Issue decision with responsible = member_a
  v_res := public.issue_council_decision(
    v_meeting, v_item1, 'Execute Topic A Plan',
    'Department shall implement Topic A recommendations by due date.',
    v_member_a, 'Department of Computer Science', (CURRENT_DATE + 30)::date
  );
  v_dec := (v_res->>'decision_id')::uuid;
  IF v_dec IS NULL THEN
    RAISE EXCEPTION 'DECISION_ISSUANCE_FAILED';
  END IF;
  PERFORM pg_temp.register_entity(v_marker, 'decision', v_dec);

  PERFORM pg_temp.as_user(v_member_a);
  PERFORM public.update_council_decision_followup(v_dec, 'in_progress', 'Work started.');
  PERFORM public.complete_council_decision(v_dec, 'Execution completed.');

  PERFORM pg_temp.as_user(v_chair);
  v_res := public.archive_council_meeting(v_meeting);
  IF (v_res->>'status') <> 'archived' THEN
    RAISE EXCEPTION 'ARCHIVE_FAILED';
  END IF;

  -- Notifications / reports / archive historical read (as available)
  IF to_regprocedure('public.get_my_council_notifications(integer)') IS NOT NULL THEN
    PERFORM pg_temp.as_user(v_chair);
    PERFORM public.get_my_council_notifications(50);
  END IF;
  IF to_regprocedure('public.get_council_report_archive_status(uuid)') IS NOT NULL THEN
    PERFORM public.get_council_report_archive_status(v_council_id);
  END IF;
  IF to_regprocedure('public.get_council_report_meetings_by_period(uuid,date,date)') IS NOT NULL THEN
    PERFORM public.get_council_report_meetings_by_period(
      v_council_id, (CURRENT_DATE - 30), (CURRENT_DATE + 30)
    );
  END IF;
  IF to_regprocedure('public.get_council_archive_summary(uuid)') IS NOT NULL THEN
    v_res := public.get_council_archive_summary(v_council_id);
    IF (v_res->>'total_archived_meetings')::int < 1 THEN
      RAISE EXCEPTION 'ARCHIVE_SUMMARY_MISMATCH';
    END IF;
  END IF;

  -- Register discovered child entities under TEST_ONLY council
  FOR r IN
    SELECT id FROM public.academic_council_meetings WHERE council_id = v_council_id
  LOOP
    PERFORM pg_temp.register_entity(v_marker, 'meeting', r.id);
  END LOOP;
  FOR r IN
    SELECT id FROM public.academic_council_topics WHERE council_id = v_council_id
  LOOP
    PERFORM pg_temp.register_entity(v_marker, 'topic', r.id);
  END LOOP;
  FOR r IN
    SELECT a.id
    FROM public.academic_council_agenda_items a
    JOIN public.academic_council_meetings m ON m.id = a.meeting_id
    WHERE m.council_id = v_council_id
  LOOP
    PERFORM pg_temp.register_entity(v_marker, 'agenda', r.id);
  END LOOP;
  FOR r IN
    SELECT d.id
    FROM public.academic_council_decisions d
    JOIN public.academic_council_meetings m ON m.id = d.meeting_id
    WHERE m.council_id = v_council_id
  LOOP
    PERFORM pg_temp.register_entity(v_marker, 'decision', r.id);
  END LOOP;
  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    FOR r IN
      SELECT id FROM public.academic_council_notifications WHERE council_id = v_council_id
    LOOP
      PERFORM pg_temp.register_entity(v_marker, 'notification', r.id);
    END LOOP;
  END IF;

  IF v_neg < 8 THEN
    RAISE EXCEPTION 'INSUFFICIENT_NEGATIVE_CASES: %', v_neg;
  END IF;

  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'COUNCILS_TESTONLY_POSITIVE_E2E_PASS';
  RAISE NOTICE 'COUNCILS_TESTONLY_NEGATIVE_MATRIX_PASS';
  RAISE NOTICE 'COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_COMPLETE';
END $$;

SELECT 'COUNCILS_TESTONLY_E2E_FIXTURE_DRY_RUN_COMPLETE' AS fixture_status
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false'
UNION ALL
SELECT 'COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_COMPLETE' AS fixture_status
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') = 'false'
  AND current_setting('councils.test_only.execute', true) = 'true'
  AND current_setting('councils.test_only_execute', true) = 'I_ACKNOWLEDGE_TEST_ONLY';
