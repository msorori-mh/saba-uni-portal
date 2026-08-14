-- =====================================================================
-- DRAFT ONLY — NOT APPLIED TO PRODUCTION
-- Package: COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
-- Part 1/3: Vote completion guard (server-side close protection)
--
-- Contract:
--   ELIGIBLE = members recorded in the FINALIZED attendance roll with
--              attendance_state IN ('present','present_remote')
--              (identical to the set cast_council_vote already accepts)
--   CAST     = rows in academic_council_votes for the agenda item
--   CLOSE_OK = ELIGIBLE > 0 AND CAST = ELIGIBLE
--   abstain counts as a cast vote.
--
-- Forward-only. No data mutation. No production apply in this package.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- A) Single source of truth for eligibility
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_agenda_item_eligible_voters(p_agenda_item_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.user_id
  FROM public.academic_council_agenda_items i
  JOIN public.academic_council_meetings m ON m.id = i.meeting_id
  JOIN public.academic_council_meeting_attendance_rolls r
    ON r.meeting_id = m.id
   AND r.status = 'finalized'::public.academic_council_attendance_roll_status
  JOIN public.academic_council_meeting_attendance a
    ON a.meeting_id = m.id
   AND a.attendance_state IN ('present', 'present_remote')
  WHERE i.id = p_agenda_item_id;
$$;

REVOKE ALL ON FUNCTION public.council_agenda_item_eligible_voters(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.council_agenda_item_eligible_voters(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- B) Progress read model (no individual vote direction is ever exposed)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agenda_item_vote_progress(p_agenda_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_item public.academic_council_agenda_items%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_eligible int;
  v_cast int;
  v_viewer_eligible boolean;
  v_viewer_voted boolean;
BEGIN
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;

  -- Council membership is required to read progress at all.
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_council_members mm
    WHERE mm.council_id = v_meeting.council_id
      AND mm.user_id = v_uid
      AND coalesce(mm.is_active, true)
  ) THEN
    RAISE EXCEPTION 'COUNCIL_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_eligible
  FROM public.council_agenda_item_eligible_voters(p_agenda_item_id);

  SELECT count(*) INTO v_cast
  FROM public.academic_council_votes v
  WHERE v.agenda_item_id = p_agenda_item_id;

  v_viewer_eligible := EXISTS (
    SELECT 1 FROM public.council_agenda_item_eligible_voters(p_agenda_item_id) e
    WHERE e.user_id = v_uid
  );

  v_viewer_voted := EXISTS (
    SELECT 1 FROM public.academic_council_votes v
    WHERE v.agenda_item_id = p_agenda_item_id AND v.voter_user_id = v_uid
  );

  RETURN jsonb_build_object(
    'agenda_item_id', p_agenda_item_id,
    'session_status', v_item.session_status,
    'eligible', v_eligible,
    'cast', v_cast,
    'pending', greatest(v_eligible - v_cast, 0),
    'can_close', (v_eligible > 0 AND v_cast >= v_eligible),
    'viewer_is_eligible', v_viewer_eligible,
    'viewer_has_voted', v_viewer_voted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_agenda_item_vote_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agenda_item_vote_progress(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- C) cast_council_vote: take the same row lock as close, for serialization
--     (last-cast vs close can no longer interleave into a 4/5 close)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_council_vote(
  p_agenda_item_id uuid,
  p_vote_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_item public.academic_council_agenda_items%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_attendance public.academic_council_meeting_attendance%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_parsed_vote public.academic_council_vote_value;
  v_eligible int;
  v_cast int;
BEGIN
  BEGIN
    v_parsed_vote := p_vote_value::public.academic_council_vote_value;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'COUNCIL_INVALID_VOTE_VALUE: must be yes, no, or abstain' USING ERRCODE = '22023';
  END;

  -- SERIALIZATION POINT: same lock target used by close_agenda_item_vote.
  SELECT * INTO v_item FROM public.academic_council_agenda_items
  WHERE id = p_agenda_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;

  IF v_item.session_status <> 'voting_open'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_OPEN' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_roll FROM public.academic_council_meeting_attendance_rolls WHERE meeting_id = v_meeting.id;
  IF v_roll.id IS NULL OR v_roll.status <> 'finalized'::public.academic_council_attendance_roll_status THEN
    RAISE EXCEPTION 'COUNCIL_ATTENDANCE_NOT_FINALIZED' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_attendance
  FROM public.academic_council_meeting_attendance
  WHERE meeting_id = v_meeting.id AND user_id = v_uid;

  IF v_attendance.id IS NULL OR v_attendance.attendance_state NOT IN ('present', 'present_remote') THEN
    RAISE EXCEPTION 'COUNCIL_VOTER_NOT_ELIGIBLE: attendance state is absent or missing' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.academic_council_votes
    WHERE agenda_item_id = p_agenda_item_id AND voter_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'COUNCIL_DOUBLE_VOTE_DENIED' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.academic_council_votes (
    meeting_id, agenda_item_id, council_id, voter_user_id, vote_value
  ) VALUES (
    v_meeting.id, p_agenda_item_id, v_meeting.council_id, v_uid, v_parsed_vote
  );

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'vote_cast', 'academic_council_votes', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id, 'voter_id', v_uid)
  );

  -- Completion fan-out (state/progress only, never a vote direction).
  SELECT count(*) INTO v_eligible FROM public.council_agenda_item_eligible_voters(p_agenda_item_id);
  SELECT count(*) INTO v_cast FROM public.academic_council_votes WHERE agenda_item_id = p_agenda_item_id;
  IF v_eligible > 0 AND v_cast >= v_eligible THEN
    PERFORM public.council_dispatch_vote_event(p_agenda_item_id, 'vote_completed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'agenda_item_id', p_agenda_item_id,
    'voted', v_parsed_vote,
    'eligible', v_eligible,
    'cast', v_cast,
    'pending', greatest(v_eligible - v_cast, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- D) close_agenda_item_vote: completeness guard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_agenda_item_vote(p_agenda_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_item public.academic_council_agenda_items%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_eligible int;
  v_cast int;
BEGIN
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_item.session_status <> 'voting_open'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_OPEN' USING ERRCODE = '22000';
  END IF;

  SELECT count(*) INTO v_eligible FROM public.council_agenda_item_eligible_voters(p_agenda_item_id);
  SELECT count(*) INTO v_cast FROM public.academic_council_votes WHERE agenda_item_id = p_agenda_item_id;

  IF v_eligible = 0 THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NO_ELIGIBLE_VOTERS' USING ERRCODE = '22000';
  END IF;

  IF v_cast < v_eligible THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_INCOMPLETE CAST=% ELIGIBLE=% PENDING=%',
      v_cast, v_eligible, (v_eligible - v_cast) USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_agenda_items
  SET session_status = 'voting_closed'::public.academic_council_agenda_item_session_status,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'vote_closed', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id, 'eligible', v_eligible, 'cast', v_cast)
  );

  PERFORM public.council_dispatch_vote_event(p_agenda_item_id, 'vote_closed');

  RETURN jsonb_build_object(
    'success', true,
    'agenda_item_id', p_agenda_item_id,
    'session_status', 'voting_closed',
    'eligible', v_eligible,
    'cast', v_cast
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cast_council_vote(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_agenda_item_vote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cast_council_vote(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_agenda_item_vote(uuid) TO authenticated, service_role;

COMMIT;
