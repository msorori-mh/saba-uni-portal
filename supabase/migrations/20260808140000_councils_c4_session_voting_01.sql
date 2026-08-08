-- =====================================================================
-- ACADEMIC-COUNCILS-C4-SESSION-AND-VOTING-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   Meeting session state machine (agenda_ready -> in_session -> minutes_draft)
--   Exact chair authorization (no admin academic bypass)
--   Strict C1 transition contract check (fail-closed if contract absent in prod)
--   Voting eligibility derived from finalized attendance snapshot
--   MVP voting values: yes, no, abstain (no proxy, no secret ballot)
--   One vote per eligible member per agenda item
--   RPC-only mutations with append-only audit logging
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guards: C3 attendance/quorum tables & functions must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_meeting_attendance_rolls') IS NULL
     OR to_regclass('public.academic_council_meeting_quorum_evaluations') IS NULL
     OR to_regproc('public.meeting_has_valid_quorum') IS NULL THEN
    RAISE EXCEPTION 'C4 session and voting requires C3 attendance and quorum foundation';
  END IF;

  -- Real C1 state machine must be present (no test-only shim substitute).
  IF to_regprocedure(
       'public.council_transition_meeting(uuid,public.academic_council_meeting_status,public.academic_council_meeting_status,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.council_meeting_transition_is_legal(public.academic_council_meeting_status,public.academic_council_meeting_status)'
     ) IS NULL THEN
    RAISE EXCEPTION 'C4 session and voting requires real C1 meeting state machine';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Enums & Table Modifications
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.academic_council_vote_value AS ENUM (
    'yes',
    'no',
    'abstain'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.academic_council_agenda_item_session_status AS ENUM (
    'pending',
    'in_discussion',
    'voting_open',
    'voting_closed',
    'resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add session tracking columns to academic_council_meetings
ALTER TABLE public.academic_council_meetings
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add session execution columns to academic_council_agenda_items
ALTER TABLE public.academic_council_agenda_items
  ADD COLUMN IF NOT EXISTS session_status public.academic_council_agenda_item_session_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 2) Voting Tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_votes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  agenda_item_id  uuid NOT NULL REFERENCES public.academic_council_agenda_items(id) ON DELETE RESTRICT,
  council_id      uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  voter_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  vote_value      public.academic_council_vote_value NOT NULL,
  cast_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agenda_item_id, voter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ac_votes_item ON public.academic_council_votes(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_ac_votes_meeting ON public.academic_council_votes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_ac_votes_voter ON public.academic_council_votes(voter_user_id);

CREATE TABLE IF NOT EXISTS public.academic_council_vote_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id  uuid NOT NULL UNIQUE REFERENCES public.academic_council_agenda_items(id) ON DELETE RESTRICT,
  meeting_id      uuid NOT NULL REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  council_id      uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  yes_count       integer NOT NULL DEFAULT 0 CHECK (yes_count >= 0),
  no_count        integer NOT NULL DEFAULT 0 CHECK (no_count >= 0),
  abstain_count   integer NOT NULL DEFAULT 0 CHECK (abstain_count >= 0),
  total_votes     integer NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
  outcome         text NOT NULL,
  calculated_at   timestamptz NOT NULL DEFAULT now(),
  calculated_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ac_vote_results_meeting ON public.academic_council_vote_results(meeting_id);

-- ---------------------------------------------------------------------
-- 3) Security & Grants (RPC-Only Writes)
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_council_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_council_vote_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academic_council_votes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academic_council_vote_results FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.academic_council_votes TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_vote_results TO authenticated, service_role;
GRANT ALL ON TABLE public.academic_council_votes TO service_role;
GRANT ALL ON TABLE public.academic_council_vote_results TO service_role;

DROP POLICY IF EXISTS "ac_votes_select" ON public.academic_council_votes;
CREATE POLICY "ac_votes_select"
  ON public.academic_council_votes
  FOR SELECT TO authenticated
  USING (
    voter_user_id = auth.uid()
    OR public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
  );

DROP POLICY IF EXISTS "ac_vote_results_select" ON public.academic_council_vote_results;
CREATE POLICY "ac_vote_results_select"
  ON public.academic_council_vote_results
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
  );

-- ---------------------------------------------------------------------
-- 4) C1 Transition Contract Assertion Helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_assert_c1_contract_present()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Fail closed unless the REAL C1 transition RPC + legality helper exist.
  -- Test-only shims (e.g. can_transition_council_meeting_state) are NOT accepted.
  IF to_regprocedure(
       'public.council_transition_meeting(uuid,public.academic_council_meeting_status,public.academic_council_meeting_status,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.council_meeting_transition_is_legal(public.academic_council_meeting_status,public.academic_council_meeting_status)'
     ) IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_C1_TRANSITION_CONTRACT_ABSENT' USING ERRCODE = '42883';
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC Actions for Session & Voting
-- ---------------------------------------------------------------------

-- A) Open Session (Chair only, agenda_ready, finalized attendance, valid quorum, C1 contract)
CREATE OR REPLACE FUNCTION public.open_council_session(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_unapproved_count integer;
  v_item_count integer;
BEGIN
  IF p_meeting_id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883';
  END IF;

  -- 1) C1 contract check
  PERFORM public.council_assert_c1_contract_present();

  -- 2) Fetch meeting with lock
  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 3) Exact Chair authorization check (No admin academic bypass)
  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- 4) State check
  IF v_meeting.status <> 'agenda_ready'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_OPEN_INVALID_STATE: status is %', v_meeting.status USING ERRCODE = '22000';
  END IF;

  -- 5) Agenda items check: must have items and all must be approved
  SELECT count(*), count(*) FILTER (WHERE is_approved = false)
  INTO v_item_count, v_unapproved_count
  FROM public.academic_council_agenda_items
  WHERE meeting_id = p_meeting_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'COUNCIL_AGENDA_EMPTY' USING ERRCODE = '22000';
  END IF;

  IF v_unapproved_count > 0 THEN
    RAISE EXCEPTION 'COUNCIL_AGENDA_NOT_FINALIZED: % items unapproved', v_unapproved_count USING ERRCODE = '22000';
  END IF;

  -- 6) Attendance finalized check
  SELECT * INTO v_roll
  FROM public.academic_council_meeting_attendance_rolls
  WHERE meeting_id = p_meeting_id;

  IF v_roll.id IS NULL OR v_roll.status <> 'finalized'::public.academic_council_attendance_roll_status THEN
    RAISE EXCEPTION 'COUNCIL_ATTENDANCE_NOT_FINALIZED' USING ERRCODE = '22000';
  END IF;

  -- 7) Quorum check (also enforced again inside real C1 transition)
  IF NOT public.meeting_has_valid_quorum(p_meeting_id) THEN
    RAISE EXCEPTION 'COUNCIL_QUORUM_NOT_MET' USING ERRCODE = '22000';
  END IF;

  -- 8) Authoritative C1 transition: agenda_ready → in_session (no direct status mutate)
  PERFORM public.council_transition_meeting(
    p_meeting_id,
    'agenda_ready'::public.academic_council_meeting_status,
    'in_session'::public.academic_council_meeting_status,
    jsonb_build_object('via', 'open_council_session', 'opened_by', v_uid)
  );

  -- Session telemetry columns (status already set by C1)
  UPDATE public.academic_council_meetings
  SET opened_at = now(),
      opened_by = v_uid,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_meeting_id;

  -- Audit log
  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'session_opened', 'academic_council_meetings', p_meeting_id,
    jsonb_build_object('opened_at', now(), 'opened_by', v_uid)
  );

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'status', 'in_session',
    'opened_at', now()
  );
END;
$$;

-- B) Start Discussion on Agenda Item (Chair only)
CREATE OR REPLACE FUNCTION public.start_agenda_item_discussion(p_agenda_item_id uuid)
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
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_item.session_status <> 'pending'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_ITEM_STATUS_INVALID: session_status is %', v_item.session_status USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_agenda_items
  SET session_status = 'in_discussion'::public.academic_council_agenda_item_session_status,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'discussion_started', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id)
  );

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'session_status', 'in_discussion');
END;
$$;

-- C) Open Vote on Agenda Item (Chair only)
CREATE OR REPLACE FUNCTION public.open_agenda_item_vote(p_agenda_item_id uuid)
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
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_item.session_status NOT IN ('pending', 'in_discussion') THEN
    RAISE EXCEPTION 'COUNCIL_VOTE_CANNOT_BE_OPENED' USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_agenda_items
  SET session_status = 'voting_open'::public.academic_council_agenda_item_session_status,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'vote_opened', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id)
  );

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'session_status', 'voting_open');
END;
$$;

-- D) Cast Vote (Eligible member only, voting_open status)
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
  -- Parse vote value
  BEGIN
    v_parsed_vote := p_vote_value::public.academic_council_vote_value;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'COUNCIL_INVALID_VOTE_VALUE: must be yes, no, or abstain' USING ERRCODE = '22023';
  END;

  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;
  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;

  IF v_item.session_status <> 'voting_open'::public.academic_council_agenda_item_session_status THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_OPEN' USING ERRCODE = '22000';
  END IF;

  -- Verify attendance roll is finalized
  SELECT * INTO v_roll FROM public.academic_council_meeting_attendance_rolls WHERE meeting_id = v_meeting.id;
  IF v_roll.id IS NULL OR v_roll.status <> 'finalized'::public.academic_council_attendance_roll_status THEN
    RAISE EXCEPTION 'COUNCIL_ATTENDANCE_NOT_FINALIZED' USING ERRCODE = '22000';
  END IF;

  -- Verify voter attendance eligibility from finalized snapshot (present or present_remote)
  SELECT * INTO v_attendance
  FROM public.academic_council_meeting_attendance
  WHERE meeting_id = v_meeting.id AND user_id = v_uid;

  IF v_attendance.id IS NULL OR v_attendance.attendance_state NOT IN ('present', 'present_remote') THEN
    RAISE EXCEPTION 'COUNCIL_VOTER_NOT_ELIGIBLE: attendance state is absent or missing' USING ERRCODE = '42501';
  END IF;

  -- Check double vote
  IF EXISTS (
    SELECT 1 FROM public.academic_council_votes
    WHERE agenda_item_id = p_agenda_item_id AND voter_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'COUNCIL_DOUBLE_VOTE_DENIED' USING ERRCODE = '23505';
  END IF;

  -- Insert vote
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

-- E) Close Vote on Agenda Item (Chair only)
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

  UPDATE public.academic_council_agenda_items
  SET session_status = 'voting_closed'::public.academic_council_agenda_item_session_status,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'vote_closed', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id)
  );

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'session_status', 'voting_closed');
END;
$$;

-- F) Calculate Vote Result (Chair or Secretary)
CREATE OR REPLACE FUNCTION public.calculate_agenda_item_result(p_agenda_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_item public.academic_council_agenda_items%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_yes int := 0;
  v_no int := 0;
  v_abs int := 0;
  v_total int := 0;
  v_outcome text;
  v_res_id uuid;
BEGIN
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF v_item.session_status NOT IN ('voting_closed', 'resolved') THEN
    RAISE EXCEPTION 'COUNCIL_VOTING_NOT_CLOSED' USING ERRCODE = '22000';
  END IF;

  SELECT
    count(*) FILTER (WHERE vote_value = 'yes'),
    count(*) FILTER (WHERE vote_value = 'no'),
    count(*) FILTER (WHERE vote_value = 'abstain'),
    count(*)
  INTO v_yes, v_no, v_abs, v_total
  FROM public.academic_council_votes
  WHERE agenda_item_id = p_agenda_item_id;

  IF v_yes > v_no THEN
    v_outcome := 'passed';
  ELSIF v_no > v_yes THEN
    v_outcome := 'rejected';
  ELSE
    v_outcome := 'tied';
  END IF;

  INSERT INTO public.academic_council_vote_results (
    agenda_item_id, meeting_id, council_id, yes_count, no_count, abstain_count, total_votes, outcome, calculated_at, calculated_by
  ) VALUES (
    p_agenda_item_id, v_meeting.id, v_meeting.council_id, v_yes, v_no, v_abs, v_total, v_outcome, now(), v_uid
  )
  ON CONFLICT (agenda_item_id) DO UPDATE SET
    yes_count = EXCLUDED.yes_count,
    no_count = EXCLUDED.no_count,
    abstain_count = EXCLUDED.abstain_count,
    total_votes = EXCLUDED.total_votes,
    outcome = EXCLUDED.outcome,
    calculated_at = EXCLUDED.calculated_at,
    calculated_by = EXCLUDED.calculated_by
  RETURNING id INTO v_res_id;

  RETURN jsonb_build_object(
    'result_id', v_res_id,
    'agenda_item_id', p_agenda_item_id,
    'yes_count', v_yes,
    'no_count', v_no,
    'abstain_count', v_abs,
    'total_votes', v_total,
    'outcome', v_outcome
  );
END;
$$;

-- G) Resolve Agenda Item (Chair only)
CREATE OR REPLACE FUNCTION public.resolve_agenda_item(
  p_agenda_item_id uuid,
  p_resolution text DEFAULT NULL
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

  UPDATE public.academic_council_agenda_items
  SET session_status = 'resolved'::public.academic_council_agenda_item_session_status,
      resolution = coalesce(p_resolution, resolution),
      resolved_at = now(),
      resolved_by = v_uid,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'item_resolved', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id, 'resolution', p_resolution)
  );

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'session_status', 'resolved');
END;
$$;

-- H) Close Session (Chair only, all items resolved -> minutes_draft)
CREATE OR REPLACE FUNCTION public.close_council_session(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_unresolved_count integer;
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_meeting.status <> 'in_session'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_SESSION_NOT_ACTIVE' USING ERRCODE = '22000';
  END IF;

  SELECT count(*) INTO v_unresolved_count
  FROM public.academic_council_agenda_items
  WHERE meeting_id = p_meeting_id AND session_status <> 'resolved'::public.academic_council_agenda_item_session_status;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION 'COUNCIL_UNRESOLVED_ITEMS_EXIST: % items pending', v_unresolved_count USING ERRCODE = '22000';
  END IF;

  -- Authoritative C1 transition: in_session → minutes_draft
  PERFORM public.council_transition_meeting(
    p_meeting_id,
    'in_session'::public.academic_council_meeting_status,
    'minutes_draft'::public.academic_council_meeting_status,
    jsonb_build_object('via', 'close_council_session', 'closed_by', v_uid)
  );

  UPDATE public.academic_council_meetings
  SET closed_at = now(),
      closed_by = v_uid,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_meeting_id;

  -- Ensure minutes record exists
  INSERT INTO public.academic_council_minutes (
    meeting_id, body, drafted_by
  ) VALUES (
    p_meeting_id, '', v_uid
  )
  ON CONFLICT (meeting_id) DO NOTHING;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'session_closed', 'academic_council_meetings', p_meeting_id,
    jsonb_build_object('closed_at', now(), 'closed_by', v_uid)
  );

  RETURN jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'status', 'minutes_draft', 'closed_at', now());
END;
$$;

-- ---------------------------------------------------------------------
-- 6) Revoke & Grant Execute for RPCs
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.council_assert_c1_contract_present() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_council_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_agenda_item_discussion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_agenda_item_vote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cast_council_vote(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_agenda_item_vote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_agenda_item_result(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_agenda_item(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_council_session(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.council_assert_c1_contract_present() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_council_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_agenda_item_discussion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_agenda_item_vote(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cast_council_vote(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_agenda_item_vote(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_agenda_item_result(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_agenda_item(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_council_session(uuid) TO authenticated, service_role;

COMMIT;
