-- =====================================================================
-- ACADEMIC-COUNCILS-C7-AUDIT-AND-ARCHIVE-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   Consolidated append-only audit event trail covering all 19 lifecycle events
--   Strict archive prerequisites validation (session closed, minutes locked, items resolved)
--   Post-archive immutability guard for operational meeting records
--   Tenure-aware historical member access controls
--   Read models & RPCs for archive summary, decision follow-up, overdue decisions,
--   attendance/quorum summary, vote results, historical minutes, and metrics.
--   Strict privacy: decisions are NOT public to students or anonymous users
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard: C6 decisions must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_decisions') IS NULL THEN
    RAISE EXCEPTION 'C7 audit and archive requires C6 decisions foundation';
  END IF;
  IF to_regprocedure(
       'public.council_transition_meeting(uuid,public.academic_council_meeting_status,public.academic_council_meeting_status,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'C7 audit and archive requires real C1 council_transition_meeting';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Unified Append-Only Audit Events Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  council_id      uuid REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  meeting_id      uuid REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  entity_type     text NOT NULL,
  entity_id       uuid,
  action_type     text NOT NULL,
  correlation_id  uuid DEFAULT gen_random_uuid(),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ac_audit_events_meeting ON public.academic_council_audit_events(meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ac_audit_events_council ON public.academic_council_audit_events(council_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ac_audit_events_action ON public.academic_council_audit_events(action_type, created_at DESC);

-- Immutable audit trigger
CREATE OR REPLACE FUNCTION public.tg_ac_audit_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'COUNCIL_AUDIT_EVENTS_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_audit_events_no_update ON public.academic_council_audit_events;
CREATE TRIGGER trg_ac_audit_events_no_update
  BEFORE UPDATE OR DELETE ON public.academic_council_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_audit_events_immutable();

ALTER TABLE public.academic_council_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academic_council_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.academic_council_audit_events TO authenticated, service_role;
GRANT ALL ON TABLE public.academic_council_audit_events TO service_role;

DROP POLICY IF EXISTS "ac_audit_events_select" ON public.academic_council_audit_events;
CREATE POLICY "ac_audit_events_select"
  ON public.academic_council_audit_events
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR (
      council_id IS NOT NULL
      AND public.is_council_member(auth.uid(), council_id)
    )
  );

-- ---------------------------------------------------------------------
-- 2) Archive Action & Post-Archive Immutability
-- ---------------------------------------------------------------------

-- Post-Archive Immutability Trigger Guard
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
    IF OLD.status = 'archived'::public.academic_council_meeting_status THEN
      RAISE EXCEPTION 'COUNCIL_ARCHIVED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_meeting_id := OLD.meeting_id;
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

-- Archive Meeting RPC Action
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
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Exact Chair authorization check (No admin academic bypass)
  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_meeting.status <> 'minutes_locked'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: meeting status is %', v_meeting.status USING ERRCODE = '22000';
  END IF;

  -- Archive prerequisite 1: Session closed
  IF v_meeting.closed_at IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: session not closed' USING ERRCODE = '22000';
  END IF;

  -- Archive prerequisite 2: Minutes locked
  SELECT * INTO v_min FROM public.academic_council_minutes WHERE meeting_id = p_meeting_id;
  IF v_min.id IS NULL OR NOT v_min.is_locked OR v_min.status <> 'minutes_locked'::public.academic_council_minutes_status THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: minutes not locked' USING ERRCODE = '22000';
  END IF;

  -- Archive prerequisite 3: All agenda items resolved
  SELECT count(*) INTO v_unresolved_count
  FROM public.academic_council_agenda_items
  WHERE meeting_id = p_meeting_id AND session_status <> 'resolved'::public.academic_council_agenda_item_session_status;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: unresolved agenda items exist' USING ERRCODE = '22000';
  END IF;

  -- No active voting/session inconsistency
  IF EXISTS (
    SELECT 1 FROM public.academic_council_agenda_items
    WHERE meeting_id = p_meeting_id
      AND session_status IN (
        'in_discussion'::public.academic_council_agenda_item_session_status,
        'voting_open'::public.academic_council_agenda_item_session_status
      )
  ) THEN
    RAISE EXCEPTION 'COUNCIL_ARCHIVE_PREREQUISITES_NOT_MET: active session/voting state remains' USING ERRCODE = '22000';
  END IF;

  -- Authoritative C1 transition: minutes_locked → archived
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

-- ---------------------------------------------------------------------
-- 3) Tenure-Aware Historical Access Helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_member_had_tenure(
  p_user_id uuid,
  p_council_id uuid,
  p_at_date timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date := p_at_date::date;
BEGIN
  IF p_user_id IS NULL OR p_council_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.academic_council_members
    WHERE council_id = p_council_id
      AND user_id = p_user_id
      AND active_from <= v_date
      AND (active_to IS NULL OR active_to >= v_date)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4) Read Models & Analytics RPCs
-- ---------------------------------------------------------------------

-- A) Archive Summary
CREATE OR REPLACE FUNCTION public.get_council_archive_summary(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_count int;
  v_list jsonb;
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.academic_council_meetings
  WHERE council_id = p_council_id AND status = 'archived'::public.academic_council_meeting_status;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'meeting_id', m.id,
    'meeting_number', m.meeting_number,
    'title', m.title,
    'scheduled_at', m.scheduled_at,
    'closed_at', m.closed_at,
    'status', m.status
  ) ORDER BY m.meeting_number DESC), '[]'::jsonb) INTO v_list
  FROM public.academic_council_meetings m
  WHERE m.council_id = p_council_id AND m.status = 'archived'::public.academic_council_meeting_status;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'total_archived_meetings', v_count,
    'archived_meetings', v_list
  );
END;
$$;

-- B) Decision Follow-up Dashboard
CREATE OR REPLACE FUNCTION public.get_council_decision_followup_dashboard(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_decisions jsonb;
  v_summary jsonb;
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'decision_id', d.id,
    'canonical_number', d.canonical_decision_number,
    'meeting_id', d.meeting_id,
    'title', d.title,
    'body', d.body,
    'status', d.status,
    'responsible_user_id', d.responsible_user_id,
    'responsible_unit', d.responsible_unit,
    'due_date', d.due_date,
    'execution_note', d.execution_note,
    'completed_at', d.completed_at
  ) ORDER BY d.created_at DESC), '[]'::jsonb) INTO v_decisions
  FROM public.academic_council_decisions d
  JOIN public.academic_council_meetings m ON m.id = d.meeting_id
  WHERE m.council_id = p_council_id;

  SELECT jsonb_build_object(
    'total', count(*),
    'issued', count(*) FILTER (WHERE d.status = 'issued'),
    'in_progress', count(*) FILTER (WHERE d.status = 'in_progress'),
    'completed', count(*) FILTER (WHERE d.status = 'completed'),
    'blocked', count(*) FILTER (WHERE d.status = 'blocked'),
    'overdue', count(*) FILTER (WHERE d.due_date < CURRENT_DATE AND d.status <> 'completed')
  ) INTO v_summary
  FROM public.academic_council_decisions d
  JOIN public.academic_council_meetings m ON m.id = d.meeting_id
  WHERE m.council_id = p_council_id;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'summary', v_summary,
    'decisions', v_decisions
  );
END;
$$;

-- C) Overdue Decisions
CREATE OR REPLACE FUNCTION public.get_council_overdue_decisions(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_list jsonb;
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'decision_id', d.id,
    'canonical_number', d.canonical_decision_number,
    'title', d.title,
    'status', d.status,
    'responsible_user_id', d.responsible_user_id,
    'responsible_unit', d.responsible_unit,
    'due_date', d.due_date
  ) ORDER BY d.due_date ASC), '[]'::jsonb) INTO v_list
  FROM public.academic_council_decisions d
  JOIN public.academic_council_meetings m ON m.id = d.meeting_id
  WHERE m.council_id = p_council_id
    AND d.due_date < CURRENT_DATE
    AND d.status <> 'completed'::public.academic_council_decision_status;

  RETURN jsonb_build_object('council_id', p_council_id, 'overdue_decisions', v_list);
END;
$$;

-- D) Attendance / Quorum Summary
CREATE OR REPLACE FUNCTION public.get_council_attendance_quorum_summary(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_eval public.academic_council_meeting_quorum_evaluations%ROWTYPE;
  v_att jsonb;
BEGIN
  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, v_meeting.council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_roll FROM public.academic_council_meeting_attendance_rolls WHERE meeting_id = p_meeting_id;
  SELECT * INTO v_eval FROM public.academic_council_meeting_quorum_evaluations WHERE meeting_id = p_meeting_id AND is_final = true ORDER BY evaluated_at DESC LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', a.user_id,
    'member_role', a.member_role,
    'attendance_state', a.attendance_state
  )), '[]'::jsonb) INTO v_att
  FROM public.academic_council_meeting_attendance a
  WHERE a.meeting_id = p_meeting_id;

  RETURN jsonb_build_object(
    'meeting_id', p_meeting_id,
    'roll_status', v_roll.status,
    'eligible_member_count', coalesce(v_roll.eligible_member_count, 0),
    'quorum_met', coalesce(v_eval.quorum_met, false),
    'present_member_count', coalesce(v_eval.present_member_count, 0),
    'required_member_count', coalesce(v_eval.required_member_count, 0),
    'attendance', v_att
  );
END;
$$;

-- E) Vote Result
CREATE OR REPLACE FUNCTION public.get_council_vote_result(p_agenda_item_id uuid)
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
  v_res public.academic_council_vote_results%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_AGENDA_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;

  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, v_meeting.council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_res FROM public.academic_council_vote_results WHERE agenda_item_id = p_agenda_item_id;

  RETURN jsonb_build_object(
    'agenda_item_id', p_agenda_item_id,
    'has_result', (v_res.id IS NOT NULL),
    'yes_count', coalesce(v_res.yes_count, 0),
    'no_count', coalesce(v_res.no_count, 0),
    'abstain_count', coalesce(v_res.abstain_count, 0),
    'total_votes', coalesce(v_res.total_votes, 0),
    'outcome', v_res.outcome
  );
END;
$$;

-- F) Historical Minutes (Tenure Aware)
CREATE OR REPLACE FUNCTION public.get_council_historical_minutes(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_min public.academic_council_minutes%ROWTYPE;
  v_amendments jsonb;
BEGIN
  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Verify current membership OR tenure at time of meeting
  IF NOT (
    public.is_council_admin(v_uid)
    OR public.is_council_member(v_uid, v_meeting.council_id)
    OR public.council_member_had_tenure(v_uid, v_meeting.council_id, v_meeting.scheduled_at)
  ) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_min FROM public.academic_council_minutes WHERE meeting_id = p_meeting_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'amendment_number', a.amendment_number,
    'reason', a.reason,
    'amended_content', a.amended_content,
    'created_at', a.created_at
  ) ORDER BY a.amendment_number ASC), '[]'::jsonb) INTO v_amendments
  FROM public.academic_council_minutes_amendments a
  WHERE a.meeting_id = p_meeting_id;

  RETURN jsonb_build_object(
    'meeting_id', p_meeting_id,
    'body', coalesce(v_min.body, ''),
    'status', coalesce(v_min.status, 'minutes_draft'::public.academic_council_minutes_status),
    'is_locked', coalesce(v_min.is_locked, false),
    'locked_at', v_min.locked_at,
    'fingerprint', v_min.fingerprint,
    'amendments', v_amendments
  );
END;
$$;

-- G) Meeting Metrics
CREATE OR REPLACE FUNCTION public.get_council_meeting_metrics(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_total_meetings int;
  v_archived_meetings int;
  v_total_decisions int;
  v_completed_decisions int;
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'archived')
  INTO v_total_meetings, v_archived_meetings
  FROM public.academic_council_meetings
  WHERE council_id = p_council_id;

  SELECT count(*), count(*) FILTER (WHERE d.status = 'completed')
  INTO v_total_decisions, v_completed_decisions
  FROM public.academic_council_decisions d
  JOIN public.academic_council_meetings m ON m.id = d.meeting_id
  WHERE m.council_id = p_council_id;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'total_meetings', v_total_meetings,
    'archived_meetings', v_archived_meetings,
    'total_decisions', v_total_decisions,
    'completed_decisions', v_completed_decisions
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Revoke & Grant Execute for C7 RPCs
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.archive_council_meeting(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.council_member_had_tenure(uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_archive_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_decision_followup_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_overdue_decisions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_attendance_quorum_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_vote_result(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_historical_minutes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_meeting_metrics(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_council_meeting(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.council_member_had_tenure(uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_archive_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_decision_followup_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_overdue_decisions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_attendance_quorum_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_vote_result(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_historical_minutes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_meeting_metrics(uuid) TO authenticated, service_role;

COMMIT;
