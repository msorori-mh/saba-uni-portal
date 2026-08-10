
DO $$
BEGIN
  IF to_regprocedure('public.cast_council_vote(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'C0-C8 security closure requires C4 cast_council_vote';
  END IF;
  IF to_regprocedure(
       'public.issue_council_decision(uuid,uuid,text,text,uuid,text,date)'
     ) IS NULL THEN
    RAISE EXCEPTION 'C0-C8 security closure requires C6 issue_council_decision';
  END IF;
  IF to_regprocedure('public.archive_council_meeting(uuid)') IS NULL THEN
    RAISE EXCEPTION 'C0-C8 security closure requires C7 archive_council_meeting';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- H3 helper: centralized decision FSM validation
-- Canonical: issued → in_progress → completed
-- Controlled blocked path: issued|in_progress → blocked → in_progress
-- Idempotent same-status evidence refresh allowed
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_decision_transition_is_legal(
  p_from public.academic_council_decision_status,
  p_to public.academic_council_decision_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_from IS NULL OR p_to IS NULL THEN false
    WHEN p_from = p_to THEN true
    WHEN p_from = 'issued'::public.academic_council_decision_status
         AND p_to = 'in_progress'::public.academic_council_decision_status THEN true
    WHEN p_from = 'issued'::public.academic_council_decision_status
         AND p_to = 'blocked'::public.academic_council_decision_status THEN true
    WHEN p_from = 'in_progress'::public.academic_council_decision_status
         AND p_to = 'completed'::public.academic_council_decision_status THEN true
    WHEN p_from = 'in_progress'::public.academic_council_decision_status
         AND p_to = 'blocked'::public.academic_council_decision_status THEN true
    WHEN p_from = 'blocked'::public.academic_council_decision_status
         AND p_to = 'in_progress'::public.academic_council_decision_status THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.council_decision_transition_is_legal(
  public.academic_council_decision_status,
  public.academic_council_decision_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.council_decision_transition_is_legal(
  public.academic_council_decision_status,
  public.academic_council_decision_status
) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- H1: cast_council_vote — lock agenda-item voting authority row
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
BEGIN
  BEGIN
    v_parsed_vote := p_vote_value::public.academic_council_vote_value;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'COUNCIL_INVALID_VOTE_VALUE: must be yes, no, or abstain' USING ERRCODE = '22023';
  END;

  -- Serialize against close_agenda_item_vote on the exact voting authority row.
  SELECT * INTO v_item
  FROM public.academic_council_agenda_items
  WHERE id = p_agenda_item_id
  FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = v_item.meeting_id
  FOR UPDATE;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;
  IF v_meeting.status = 'archived'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF v_item.session_status <> 'voting_open'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_OPEN' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_roll
  FROM public.academic_council_meeting_attendance_rolls
  WHERE meeting_id = v_meeting.id;
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

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'voted', v_parsed_vote);
END;
$$;

-- H1 companion: close also locks meeting after agenda item (consistent order:
-- agenda item → meeting) and re-checks open state under the lock.
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
BEGIN
  SELECT * INTO v_item
  FROM public.academic_council_agenda_items
  WHERE id = p_agenda_item_id
  FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = v_item.meeting_id
  FOR UPDATE;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;
  IF v_meeting.status = 'archived'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_item.session_status <> 'voting_open'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_OPEN' USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_agenda_items
  SET session_status = 'voting_closed'::public.academic_council_agenda_item_session_status,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id
    AND session_status = 'voting_open'::public.academic_council_agenda_item_session_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_OPEN' USING ERRCODE = '22000';
  END IF;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'vote_closed', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id)
  );

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'session_status', 'voting_closed');
END;
$$;

-- ---------------------------------------------------------------------
-- H2: issue_council_decision — exact source relationship proof
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_council_decision(
  p_meeting_id uuid,
  p_agenda_item_id uuid,
  p_title text,
  p_body text,
  p_responsible_user_id uuid DEFAULT NULL,
  p_responsible_unit text DEFAULT NULL,
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_item public.academic_council_agenda_items%ROWTYPE;
  v_min public.academic_council_minutes%ROWTYPE;
  v_topic public.academic_council_topics%ROWTYPE;
  v_vote_result public.academic_council_vote_results%ROWTYPE;
  v_next_num integer;
  v_canonical text;
  v_dec_id uuid;
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;
  IF p_agenda_item_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_ID_REQUIRED' USING ERRCODE = '42883'; END IF;
  IF length(trim(coalesce(p_title, ''))) = 0 THEN RAISE EXCEPTION 'COUNCIL_DECISION_TITLE_REQUIRED' USING ERRCODE = '22000'; END IF;
  IF length(trim(coalesce(p_body, ''))) = 0 THEN RAISE EXCEPTION 'COUNCIL_DECISION_BODY_REQUIRED' USING ERRCODE = '22000'; END IF;

  -- Lock order: meeting → agenda item → minutes (matches archive / follow-up).
  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;
  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_meeting.status = 'archived'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item
  FROM public.academic_council_agenda_items
  WHERE id = p_agenda_item_id
  FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.meeting_id IS DISTINCT FROM p_meeting_id THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_SOURCE_MEETING_MISMATCH' USING ERRCODE = '22000';
  END IF;
  IF v_item.session_status <> 'resolved'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_AGENDA_ITEM_NOT_RESOLVED' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_min
  FROM public.academic_council_minutes
  WHERE meeting_id = p_meeting_id
  FOR UPDATE;
  IF v_min.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_MINUTES_REQUIRED' USING ERRCODE = '22000';
  END IF;
  IF v_min.meeting_id IS DISTINCT FROM p_meeting_id THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_SOURCE_MEETING_MISMATCH' USING ERRCODE = '22000';
  END IF;
  IF NOT coalesce(v_min.is_locked, false)
     OR v_min.status <> 'minutes_locked'::public.academic_council_minutes_status THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_MINUTES_NOT_LOCKED' USING ERRCODE = '22000';
  END IF;

  IF v_item.topic_id IS NOT NULL THEN
    SELECT * INTO v_topic
    FROM public.academic_council_topics
    WHERE id = v_item.topic_id
    FOR UPDATE;
    IF v_topic.id IS NULL THEN
      RAISE EXCEPTION 'COUNCIL_DECISION_TOPIC_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_topic.council_id IS DISTINCT FROM v_meeting.council_id THEN
      RAISE EXCEPTION 'COUNCIL_DECISION_SOURCE_COUNCIL_MISMATCH' USING ERRCODE = '22000';
    END IF;
    IF v_topic.meeting_id IS NOT NULL AND v_topic.meeting_id IS DISTINCT FROM p_meeting_id THEN
      RAISE EXCEPTION 'COUNCIL_DECISION_SOURCE_MEETING_MISMATCH' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- If a vote result exists for this item, it must belong to the same meeting/council.
  SELECT * INTO v_vote_result
  FROM public.academic_council_vote_results
  WHERE agenda_item_id = p_agenda_item_id
  FOR UPDATE;
  IF v_vote_result.id IS NOT NULL THEN
    IF v_vote_result.meeting_id IS DISTINCT FROM p_meeting_id
       OR v_vote_result.council_id IS DISTINCT FROM v_meeting.council_id THEN
      RAISE EXCEPTION 'COUNCIL_DECISION_SOURCE_MEETING_MISMATCH' USING ERRCODE = '22000';
    END IF;
  END IF;

  SELECT coalesce(max(decision_number), 0) + 1 INTO v_next_num
  FROM public.academic_council_decisions
  WHERE meeting_id = p_meeting_id;

  v_canonical := 'DEC-' || substring(p_meeting_id::text, 1, 8) || '-' || lpad(v_next_num::text, 3, '0');

  INSERT INTO public.academic_council_decisions (
    meeting_id, agenda_item_id, minutes_id, topic_id, decision_number, canonical_decision_number,
    title, body, status, responsible_user_id, responsible_unit, due_date, created_by, updated_by
  ) VALUES (
    p_meeting_id, p_agenda_item_id, v_min.id, v_item.topic_id, v_next_num, v_canonical,
    p_title, p_body, 'issued'::public.academic_council_decision_status,
    p_responsible_user_id, p_responsible_unit, p_due_date, v_uid, v_uid
  ) RETURNING id INTO v_dec_id;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'decision_issued', 'academic_council_decisions', v_dec_id,
    jsonb_build_object(
      'canonical_number', v_canonical,
      'decision_id', v_dec_id,
      'responsible_user_id', p_responsible_user_id,
      'agenda_item_id', p_agenda_item_id,
      'minutes_id', v_min.id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', v_dec_id,
    'canonical_number', v_canonical,
    'status', 'issued'
  );
END;
$$;

-- ---------------------------------------------------------------------
-- H3 + H4: follow-up FSM + archived-meeting denial
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_council_decision_followup(
  p_decision_id uuid,
  p_status text,
  p_execution_note text DEFAULT NULL,
  p_evidence_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_dec public.academic_council_decisions%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_parsed_status public.academic_council_decision_status;
  v_is_responsible boolean := false;
  v_is_chair boolean := false;
  v_meeting_id uuid;
BEGIN
  IF p_decision_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_DECISION_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  -- Resolve meeting_id first (no lock), then lock meeting → decision (archive order).
  SELECT meeting_id INTO v_meeting_id
  FROM public.academic_council_decisions
  WHERE id = p_decision_id;
  IF v_meeting_id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = v_meeting_id
  FOR UPDATE;
  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_meeting.status = 'archived'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dec
  FROM public.academic_council_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF v_dec.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_is_responsible := (v_dec.responsible_user_id = v_uid);
  v_is_chair := public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role);

  IF NOT (v_is_responsible OR v_is_chair) THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_FOLLOWUP_DENIED: not assigned actor or chair' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_parsed_status := p_status::public.academic_council_decision_status;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'COUNCIL_INVALID_DECISION_STATUS' USING ERRCODE = '22023';
  END;

  IF NOT public.council_decision_transition_is_legal(v_dec.status, v_parsed_status) THEN
    RAISE EXCEPTION 'COUNCIL_DECISION_FSM_TRANSITION_DENIED: % -> %', v_dec.status, v_parsed_status
      USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_decisions
  SET status = v_parsed_status,
      execution_note = coalesce(p_execution_note, execution_note),
      evidence_metadata = coalesce(p_evidence_metadata, evidence_metadata),
      completed_at = (CASE
        WHEN v_parsed_status = 'completed'::public.academic_council_decision_status
          THEN coalesce(completed_at, now())
        ELSE completed_at
      END),
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_decision_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'decision_followup_updated', 'academic_council_decisions', p_decision_id,
    jsonb_build_object(
      'from_status', v_dec.status,
      'status', v_parsed_status,
      'updated_by', v_uid,
      'execution_note', p_execution_note
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'status', v_parsed_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_council_decision(
  p_decision_id uuid,
  p_execution_note text DEFAULT NULL,
  p_evidence_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.update_council_decision_followup(
    p_decision_id,
    'completed',
    p_execution_note,
    p_evidence_metadata
  );
END;
$$;

-- ---------------------------------------------------------------------
-- H4: archive readiness includes decision follow-up; child immutability
-- ---------------------------------------------------------------------
-- INSERT path: NEW.meeting_id must be checked (OLD is null on insert).
CREATE OR REPLACE FUNCTION public.tg_ac_archived_meeting_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting_id uuid;
  v_status public.academic_council_meeting_status;
BEGIN
  IF TG_TABLE_NAME = 'academic_council_meetings' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'archived'::public.academic_council_meeting_status THEN
      RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      v_meeting_id := NEW.meeting_id;
    ELSE
      v_meeting_id := OLD.meeting_id;
    END IF;
    IF v_meeting_id IS NOT NULL THEN
      SELECT status INTO v_status FROM public.academic_council_meetings WHERE id = v_meeting_id;
      IF v_status = 'archived'::public.academic_council_meeting_status THEN
        RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_archived_meeting_guard ON public.academic_council_meetings;
CREATE TRIGGER trg_ac_archived_meeting_guard
  BEFORE UPDATE OR DELETE ON public.academic_council_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_archived_meeting_guard();

DROP TRIGGER IF EXISTS trg_ac_archived_decisions_guard ON public.academic_council_decisions;
CREATE TRIGGER trg_ac_archived_decisions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.academic_council_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_archived_meeting_guard();

DROP TRIGGER IF EXISTS trg_ac_archived_agenda_guard ON public.academic_council_agenda_items;
CREATE TRIGGER trg_ac_archived_agenda_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.academic_council_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_archived_meeting_guard();

DROP TRIGGER IF EXISTS trg_ac_archived_votes_guard ON public.academic_council_votes;
CREATE TRIGGER trg_ac_archived_votes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.academic_council_votes
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_archived_meeting_guard();

DROP TRIGGER IF EXISTS trg_ac_archived_vote_results_guard ON public.academic_council_vote_results;
CREATE TRIGGER trg_ac_archived_vote_results_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.academic_council_vote_results
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_archived_meeting_guard();

DROP TRIGGER IF EXISTS trg_ac_archived_minutes_guard ON public.academic_council_minutes;
CREATE TRIGGER trg_ac_archived_minutes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.academic_council_minutes
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_archived_meeting_guard();

CREATE OR REPLACE FUNCTION public.archive_council_meeting(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_min public.academic_council_minutes%ROWTYPE;
  v_unresolved_count integer;
  v_open_decisions integer;
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;
  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_meeting.status <> 'minutes_locked'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: meeting status is %', v_meeting.status
      USING ERRCODE = '22000';
  END IF;

  IF v_meeting.closed_at IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: session not closed' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_min
  FROM public.academic_council_minutes
  WHERE meeting_id = p_meeting_id
  FOR UPDATE;
  IF v_min.id IS NULL OR NOT v_min.is_locked OR v_min.status <> 'minutes_locked'::public.academic_council_minutes_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: minutes not locked' USING ERRCODE = '22000';
  END IF;

  SELECT count(*) INTO v_unresolved_count
  FROM public.academic_council_agenda_items
  WHERE meeting_id = p_meeting_id
    AND session_status <> 'resolved'::public.academic_council_agenda_item_session_status;
  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: unresolved agenda items exist' USING ERRCODE = '22000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.academic_council_agenda_items
    WHERE meeting_id = p_meeting_id
      AND session_status IN (
        'in_discussion'::public.academic_council_agenda_item_session_status,
        'voting_open'::public.academic_council_agenda_item_session_status
      )
  ) THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: active session/voting state remains'
      USING ERRCODE = '22000';
  END IF;

  -- Lock decision rows and require follow-up terminal completion.
  PERFORM 1
  FROM public.academic_council_decisions
  WHERE meeting_id = p_meeting_id
  FOR UPDATE;

  SELECT count(*) INTO v_open_decisions
  FROM public.academic_council_decisions
  WHERE meeting_id = p_meeting_id
    AND status <> 'completed'::public.academic_council_decision_status;

  IF v_open_decisions > 0 THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: unresolved decision follow-up exists'
      USING ERRCODE = '22000';
  END IF;

  PERFORM public.council_transition_meeting(
    p_meeting_id,
    'minutes_locked'::public.academic_council_meeting_status,
    'archived'::public.academic_council_meeting_status,
    jsonb_build_object('via', 'archive_council_meeting', 'archived_by', v_uid)
  );

  INSERT INTO public.academic_council_audit_events (
    meeting_id, council_id, actor_user_id, action_type, entity_type, entity_id, payload
  ) VALUES (
    p_meeting_id, v_meeting.council_id, v_uid,
    'meeting_archived', 'academic_council_meetings', p_meeting_id,
    jsonb_build_object('archived_at', now(), 'archived_by', v_uid)
  );

  RETURN jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'status', 'archived');
END;
$$;
