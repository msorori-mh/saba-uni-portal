-- Test matrix for package 04: vote parity, viewer exclusion, date invariants.
-- Every case RAISEs on failure, so a clean run == full PASS.
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.harness_assert(p_cond boolean, p_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_cond THEN RAISE EXCEPTION 'FAIL: %', p_name; END IF;
  RAISE NOTICE 'PASS: %', p_name;
END $$;

DO $$
DECLARE
  v_council uuid := gen_random_uuid();
  v_meeting uuid;
  v_item uuid;
  v_chair uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid();
  v_absent uuid := gen_random_uuid();
  v_eligible int;
  v_progress jsonb;
  v_msg text;
BEGIN
  INSERT INTO public.academic_council_meetings (council_id, title, status, scheduled_at, intake_opens_at, intake_closes_at)
  VALUES (v_council, 'جلسة اختبار', 'in_session', now() + interval '1 day', now() - interval '2 day', now() - interval '1 day')
  RETURNING id INTO v_meeting;

  INSERT INTO public.academic_council_agenda_items (meeting_id, session_status, vote_opened_at)
  VALUES (v_meeting, 'voting_open', now()) RETURNING id INTO v_item;

  INSERT INTO public.academic_council_members (council_id, user_id, role) VALUES
    (v_council, v_chair, 'chair'),
    (v_council, v_member, 'member'),
    (v_council, v_viewer, 'viewer'),
    (v_council, v_absent, 'member');

  INSERT INTO public.academic_council_meeting_attendance_rolls (meeting_id, status)
  VALUES (v_meeting, 'finalized');

  INSERT INTO public.academic_council_meeting_attendance (meeting_id, user_id, attendance_state) VALUES
    (v_meeting, v_chair, 'present'),
    (v_meeting, v_member, 'present_remote'),
    (v_meeting, v_viewer, 'present'),
    (v_meeting, v_absent, 'absent');

  -- CASE 1: viewer is excluded from the eligible denominator
  SELECT count(*) INTO v_eligible FROM public.council_agenda_item_eligible_voters(v_item);
  PERFORM public.harness_assert(v_eligible = 2, 'ELIGIBLE excludes viewer and absent (expected 2, got ' || v_eligible || ')');

  -- CASE 2: a viewer cannot cast a vote
  PERFORM public.harness_set_uid(v_viewer);
  BEGIN
    PERFORM public.cast_council_vote(v_item, 'yes');
    RAISE EXCEPTION 'FAIL: viewer was allowed to vote';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM public.harness_assert(true, 'viewer vote denied');
  END;

  -- CASE 3: close is denied while the vote is incomplete (1 of 2)
  PERFORM public.harness_set_uid(v_chair);
  PERFORM public.cast_council_vote(v_item, 'yes');
  BEGIN
    PERFORM public.close_agenda_item_vote(v_item);
    RAISE EXCEPTION 'FAIL: close succeeded at CAST=1 ELIGIBLE=2';
  EXCEPTION WHEN sqlstate '22000' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM public.harness_assert(v_msg LIKE 'COUNCIL_VOTING_INCOMPLETE%', 'incomplete close denied: ' || v_msg);
  END;

  -- CASE 4: progress read model reports the same numbers
  v_progress := public.get_agenda_item_vote_progress(v_item);
  PERFORM public.harness_assert((v_progress->>'eligible')::int = 2, 'progress eligible = 2');
  PERFORM public.harness_assert((v_progress->>'cast')::int = 1, 'progress cast = 1');
  PERFORM public.harness_assert((v_progress->>'can_close')::boolean = false, 'progress can_close = false');

  -- CASE 5: parity reached -> completion event + close allowed
  PERFORM public.harness_set_uid(v_member);
  PERFORM public.cast_council_vote(v_item, 'abstain');
  PERFORM public.harness_assert(
    EXISTS (SELECT 1 FROM public.harness_vote_events WHERE agenda_item_id = v_item AND event_type = 'vote_completed'),
    'vote_completed dispatched at CAST = ELIGIBLE');

  PERFORM public.harness_set_uid(v_chair);
  PERFORM public.close_agenda_item_vote(v_item);
  PERFORM public.harness_assert(
    (SELECT session_status FROM public.academic_council_agenda_items WHERE id = v_item) = 'voting_closed',
    'close allowed at CAST = ELIGIBLE');

  -- CASE 6: abstain counted as a cast vote (implied by case 5 parity)
  PERFORM public.harness_assert(
    (SELECT count(*) FROM public.academic_council_votes WHERE agenda_item_id = v_item AND vote_value = 'abstain') = 1,
    'abstain counted as cast');
END $$;

-- ---------------------------------------------------------------------
-- DATE INVARIANTS
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_council uuid := gen_random_uuid();
  v_legacy uuid;
  v_msg text;
BEGIN
  -- CASE 7: opens >= closes rejected
  BEGIN
    INSERT INTO public.academic_council_meetings (council_id, scheduled_at, intake_opens_at, intake_closes_at)
    VALUES (v_council, now() + interval '5 day', now() + interval '2 day', now() + interval '1 day');
    RAISE EXCEPTION 'FAIL: inverted intake window accepted';
  EXCEPTION WHEN sqlstate '22000' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM public.harness_assert(v_msg LIKE 'COUNCIL_MEETING_INTAKE_WINDOW_INVALID%', 'inverted intake window rejected');
  END;

  -- CASE 8: closes > scheduled rejected
  BEGIN
    INSERT INTO public.academic_council_meetings (council_id, scheduled_at, intake_opens_at, intake_closes_at)
    VALUES (v_council, now() + interval '1 day', now(), now() + interval '2 day');
    RAISE EXCEPTION 'FAIL: intake closing after the session accepted';
  EXCEPTION WHEN sqlstate '22000' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM public.harness_assert(v_msg LIKE 'COUNCIL_MEETING_INTAKE_AFTER_SESSION%', 'intake after session rejected');
  END;

  -- CASE 9: half-open window rejected
  BEGIN
    INSERT INTO public.academic_council_meetings (council_id, scheduled_at, intake_opens_at)
    VALUES (v_council, now() + interval '3 day', now());
    RAISE EXCEPTION 'FAIL: partial intake window accepted';
  EXCEPTION WHEN sqlstate '22000' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM public.harness_assert(v_msg LIKE 'COUNCIL_MEETING_INTAKE_WINDOW_PARTIAL%', 'partial intake window rejected');
  END;

  -- CASE 10: valid chronology accepted
  INSERT INTO public.academic_council_meetings (council_id, scheduled_at, intake_opens_at, intake_closes_at)
  VALUES (v_council, now() + interval '5 day', now() + interval '1 day', now() + interval '2 day');
  PERFORM public.harness_assert(true, 'valid chronology accepted');

  -- CASE 11: legacy row (inserted before the trigger) can still change status
  ALTER TABLE public.academic_council_meetings DISABLE TRIGGER trg_ac_meetings_date_chronology;
  INSERT INTO public.academic_council_meetings (council_id, scheduled_at, intake_opens_at, intake_closes_at)
  VALUES (v_council, now(), now() + interval '9 day', now() + interval '10 day')
  RETURNING id INTO v_legacy;
  ALTER TABLE public.academic_council_meetings ENABLE TRIGGER trg_ac_meetings_date_chronology;

  UPDATE public.academic_council_meetings SET status = 'archived' WHERE id = v_legacy;
  PERFORM public.harness_assert(
    (SELECT status FROM public.academic_council_meetings WHERE id = v_legacy) = 'archived',
    'legacy row is not stranded: non-date update still allowed');

  -- CASE 12: correcting a legacy row is still validated
  BEGIN
    UPDATE public.academic_council_meetings
    SET intake_closes_at = now() + interval '20 day'
    WHERE id = v_legacy;
    RAISE EXCEPTION 'FAIL: legacy date correction bypassed validation';
  EXCEPTION WHEN sqlstate '22000' THEN
    PERFORM public.harness_assert(true, 'legacy date correction is validated');
  END;
END $$;

SELECT 'PASS_COUNCILS_VOTING_DATE_INVARIANTS_04_PG17_MATRIX' AS result;
