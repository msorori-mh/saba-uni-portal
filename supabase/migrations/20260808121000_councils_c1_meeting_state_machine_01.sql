-- =====================================================================
-- ACADEMIC-COUNCILS-C1-MEETING-STATE-MACHINE-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   1) Add minutes_review to academic_council_meeting_status
--   2) Append-only meeting transition audit table + RLS
--   3) Canonical edge legality helper
--   4) Authoritative council_transition_meeting RPC (chair-only)
--   5) Block client status mutation via metadata RPC
--   6) Finalize agenda approves items only (no status mutation)
--
-- Non-goals:
--   attendance / quorum implementation (C3)
--   topic intake/review lifecycle (C2)
--   production apply / deploy / publish
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guard: C0 helpers + meeting tables must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_meetings') IS NULL
     OR to_regclass('public.academic_council_agenda_items') IS NULL
     OR to_regprocedure('public.council_require_auth_uid()') IS NULL
     OR to_regprocedure('public.council_deny(text)') IS NULL
     OR to_regprocedure('public.can_schedule_council_meeting(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'councils C1 state machine requires C0 meeting helpers and tables';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Enum: minutes_review after minutes_draft
--     Must commit before the new label is referenced (PG enum rule).
-- ---------------------------------------------------------------------
ALTER TYPE public.academic_council_meeting_status
  ADD VALUE IF NOT EXISTS 'minutes_review' AFTER 'minutes_draft';

BEGIN;

-- ---------------------------------------------------------------------
-- 2) Append-only transition audit table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_meeting_transition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.academic_council_meetings(id),
  council_id uuid NOT NULL,
  from_status public.academic_council_meeting_status NOT NULL,
  to_status public.academic_council_meeting_status NOT NULL,
  expected_from_status public.academic_council_meeting_status NOT NULL,
  actor_user_id uuid NOT NULL,
  transitioned_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_council_meeting_transition_events_meeting
  ON public.academic_council_meeting_transition_events (meeting_id, transitioned_at);

REVOKE ALL ON TABLE public.academic_council_meeting_transition_events FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_meeting_transition_events
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.academic_council_meeting_transition_events
  TO authenticated;
GRANT ALL ON TABLE public.academic_council_meeting_transition_events
  TO service_role;

ALTER TABLE public.academic_council_meeting_transition_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'academic_council_meeting_transition_events'
      AND p.policyname = 'meeting_transition_events_select'
  ) THEN
    RAISE EXCEPTION
      'councils C1 fail-closed: unexpected preexisting policy meeting_transition_events_select on public.academic_council_meeting_transition_events';
  END IF;
END $$;

CREATE POLICY "meeting_transition_events_select"
  ON public.academic_council_meeting_transition_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
  );

CREATE OR REPLACE FUNCTION public.council_meeting_transition_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'COUNCIL_TRANSITION_EVENTS_IMMUTABLE';
END;
$$;

CREATE TRIGGER academic_council_meeting_transition_events_immutable
  BEFORE UPDATE OR DELETE ON public.academic_council_meeting_transition_events
  FOR EACH ROW
  EXECUTE FUNCTION public.council_meeting_transition_events_immutable();

REVOKE ALL ON FUNCTION public.council_meeting_transition_events_immutable()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Canonical transition legality (no skip / no reverse)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_meeting_transition_is_legal(
  p_from_status public.academic_council_meeting_status,
  p_to_status public.academic_council_meeting_status
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_from_status = 'scheduled'::public.academic_council_meeting_status
         AND p_to_status = 'intake_open'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'intake_open'::public.academic_council_meeting_status
         AND p_to_status = 'intake_closed'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'intake_closed'::public.academic_council_meeting_status
         AND p_to_status = 'agenda_ready'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'agenda_ready'::public.academic_council_meeting_status
         AND p_to_status = 'in_session'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'in_session'::public.academic_council_meeting_status
         AND p_to_status = 'minutes_draft'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'minutes_draft'::public.academic_council_meeting_status
         AND p_to_status = 'minutes_review'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'minutes_review'::public.academic_council_meeting_status
         AND p_to_status = 'minutes_locked'::public.academic_council_meeting_status THEN true
    WHEN p_from_status = 'minutes_locked'::public.academic_council_meeting_status
         AND p_to_status = 'archived'::public.academic_council_meeting_status THEN true
    -- cancelled only before in_session
    WHEN p_to_status = 'cancelled'::public.academic_council_meeting_status
         AND p_from_status IN (
           'scheduled'::public.academic_council_meeting_status,
           'intake_open'::public.academic_council_meeting_status,
           'intake_closed'::public.academic_council_meeting_status,
           'agenda_ready'::public.academic_council_meeting_status
         ) THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.council_meeting_transition_is_legal(
  public.academic_council_meeting_status,
  public.academic_council_meeting_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.council_meeting_transition_is_legal(
  public.academic_council_meeting_status,
  public.academic_council_meeting_status
) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Authoritative atomic transition RPC (exact chair only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_transition_meeting(
  p_meeting_id uuid,
  p_expected_status public.academic_council_meeting_status,
  p_to_status public.academic_council_meeting_status,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_from public.academic_council_meeting_status;
  v_evidence jsonb := COALESCE(p_evidence, '{}'::jsonb);
  v_quorum boolean;
  v_transition_id uuid;
BEGIN
  IF p_meeting_id IS NULL OR p_expected_status IS NULL OR p_to_status IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  v_from := v_meeting.status;

  IF v_from IS DISTINCT FROM p_expected_status THEN
    PERFORM public.council_deny('COUNCIL_MEETING_STALE_STATE');
  END IF;

  IF NOT public.council_meeting_transition_is_legal(v_from, p_to_status) THEN
    PERFORM public.council_deny('COUNCIL_TRANSITION_ILLEGAL');
  END IF;

  -- Exact council chair only — no system_admin/admin/dean/secretary automatic authority.
  IF NOT public.can_schedule_council_meeting(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_TRANSITION_DENIED');
  END IF;

  -- Prerequisites by edge
  IF v_from = 'scheduled'::public.academic_council_meeting_status
     AND p_to_status = 'intake_open'::public.academic_council_meeting_status THEN
    IF nullif(btrim(COALESCE(v_meeting.title, '')), '') IS NULL
       OR v_meeting.scheduled_at IS NULL THEN
      PERFORM public.council_deny('COUNCIL_TRANSITION_PREREQ_UNMET');
    END IF;

  ELSIF v_from = 'intake_open'::public.academic_council_meeting_status
     AND p_to_status = 'intake_closed'::public.academic_council_meeting_status THEN
    -- If opens_at is set, meeting must have reached open time.
    IF v_meeting.intake_opens_at IS NOT NULL AND now() < v_meeting.intake_opens_at THEN
      PERFORM public.council_deny('COUNCIL_TRANSITION_PREREQ_UNMET');
    END IF;
    -- Chair may always explicitly close while intake_open (window close is optional).
    -- When intake_closes_at is set, automatic window satisfaction is accepted;
    -- explicit chair close remains allowed either way once opened.

  ELSIF v_from = 'intake_closed'::public.academic_council_meeting_status
     AND p_to_status = 'agenda_ready'::public.academic_council_meeting_status THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.academic_council_agenda_items a
      WHERE a.meeting_id = v_meeting.id
        AND a.is_approved = true
    ) THEN
      PERFORM public.council_deny('COUNCIL_TRANSITION_PREREQ_UNMET');
    END IF;

  ELSIF v_from = 'agenda_ready'::public.academic_council_meeting_status
     AND p_to_status = 'in_session'::public.academic_council_meeting_status THEN
    -- Quorum gate MUST fail closed until C3 provides meeting_has_valid_quorum.
    IF to_regprocedure('public.meeting_has_valid_quorum(uuid)') IS NULL THEN
      PERFORM public.council_deny('COUNCIL_QUORUM_GATE_UNAVAILABLE');
    END IF;
    EXECUTE 'SELECT public.meeting_has_valid_quorum($1)'
      INTO v_quorum
      USING v_meeting.id;
    IF COALESCE(v_quorum, false) IS NOT TRUE THEN
      PERFORM public.council_deny('COUNCIL_QUORUM_NOT_MET');
    END IF;

  ELSIF v_from = 'in_session'::public.academic_council_meeting_status
     AND p_to_status = 'minutes_draft'::public.academic_council_meeting_status THEN
    -- Minutes path allowed for exact chair once legal edge + expected state match.
    -- Downstream minutes packages may tighten evidence later.
    NULL;

  ELSIF v_from = 'minutes_draft'::public.academic_council_meeting_status
     AND p_to_status = 'minutes_review'::public.academic_council_meeting_status THEN
    NULL;

  ELSIF v_from = 'minutes_review'::public.academic_council_meeting_status
     AND p_to_status = 'minutes_locked'::public.academic_council_meeting_status THEN
    NULL;

  ELSIF v_from = 'minutes_locked'::public.academic_council_meeting_status
     AND p_to_status = 'archived'::public.academic_council_meeting_status THEN
    NULL;

  ELSIF p_to_status = 'cancelled'::public.academic_council_meeting_status THEN
    NULL;
  END IF;

  UPDATE public.academic_council_meetings
  SET status = p_to_status,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = v_meeting.id;

  INSERT INTO public.academic_council_meeting_transition_events (
    meeting_id,
    council_id,
    from_status,
    to_status,
    expected_from_status,
    actor_user_id,
    evidence
  ) VALUES (
    v_meeting.id,
    v_meeting.council_id,
    v_from,
    p_to_status,
    p_expected_status,
    v_uid,
    v_evidence
  )
  RETURNING id INTO v_transition_id;

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', v_meeting.id,
    'from_status', v_from,
    'to_status', p_to_status,
    'transition_id', v_transition_id
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Metadata RPC: reject any client status mutation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_update_meeting_metadata(
  p_meeting_id uuid,
  p_title text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_intake_opens_at timestamptz DEFAULT NULL,
  p_intake_closes_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_status public.academic_council_meeting_status DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_meetings%ROWTYPE;
BEGIN
  IF p_meeting_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  -- Status changes are RPC-only via council_transition_meeting.
  IF p_status IS NOT NULL THEN
    PERFORM public.council_deny('COUNCIL_MEETING_STATUS_RPC_ONLY');
  END IF;

  SELECT * INTO v_row
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.can_schedule_council_meeting(v_uid, v_row.council_id) THEN
    PERFORM public.council_deny('COUNCIL_SCHEDULE_DENIED');
  END IF;

  UPDATE public.academic_council_meetings
  SET title = COALESCE(nullif(btrim(p_title), ''), title),
      scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
      location = CASE WHEN p_location IS NULL THEN location ELSE nullif(btrim(p_location), '') END,
      intake_opens_at = COALESCE(p_intake_opens_at, intake_opens_at),
      intake_closes_at = COALESCE(p_intake_closes_at, intake_closes_at),
      notes = CASE WHEN p_notes IS NULL THEN notes ELSE nullif(btrim(p_notes), '') END,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_meeting_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', v_row.id,
    'status', v_row.status
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6) Finalize agenda: approve items only; never mutate meeting.status
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_finalize_meeting_agenda(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_count integer;
BEGIN
  IF p_meeting_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  -- Chair membership only (no system_admin/admin/dean/secretary automatic authority).
  IF NOT public.can_schedule_council_meeting(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_FINALIZE_DENIED');
  END IF;

  IF v_meeting.status IS DISTINCT FROM 'intake_closed'::public.academic_council_meeting_status THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_FINALIZE_STATE');
  END IF;

  UPDATE public.academic_council_agenda_items
  SET is_approved = true,
      approved_by = v_uid,
      approved_at = now(),
      updated_by = v_uid,
      updated_at = now()
  WHERE meeting_id = p_meeting_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Intentionally does NOT change meeting.status; use council_transition_meeting
  -- for intake_closed → agenda_ready after a non-empty finalized agenda exists.

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', p_meeting_id,
    'approved_items_count', v_count,
    'status', v_meeting.status
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7) Privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.council_transition_meeting(
  uuid,
  public.academic_council_meeting_status,
  public.academic_council_meeting_status,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.council_transition_meeting(
  uuid,
  public.academic_council_meeting_status,
  public.academic_council_meeting_status,
  jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.council_update_meeting_metadata(
  uuid, text, timestamptz, text, timestamptz, timestamptz, text,
  public.academic_council_meeting_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.council_update_meeting_metadata(
  uuid, text, timestamptz, text, timestamptz, timestamptz, text,
  public.academic_council_meeting_status
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.council_finalize_meeting_agenda(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.council_finalize_meeting_agenda(uuid)
  TO authenticated, service_role;

COMMIT;
