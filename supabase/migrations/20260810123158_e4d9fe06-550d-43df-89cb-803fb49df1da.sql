
-- ---------------------------------------------------------------------
-- 0) Guard: Base decision table must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_decisions') IS NULL THEN
    RAISE EXCEPTION 'C6 decisions requires academic_council_decisions table';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Table & Enum Enhancements
-- ---------------------------------------------------------------------
ALTER TYPE public.academic_council_decision_status ADD VALUE IF NOT EXISTS 'blocked';

ALTER TABLE public.academic_council_decisions
  ADD COLUMN IF NOT EXISTS canonical_decision_number text,
  ADD COLUMN IF NOT EXISTS agenda_item_id uuid REFERENCES public.academic_council_agenda_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS minutes_id uuid REFERENCES public.academic_council_minutes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS responsible_unit text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_acdec_agenda_item ON public.academic_council_decisions(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_acdec_minutes ON public.academic_council_decisions(minutes_id);
CREATE INDEX IF NOT EXISTS idx_acdec_canonical_num ON public.academic_council_decisions(canonical_decision_number);

-- ---------------------------------------------------------------------
-- 2) Immutability Trigger Guard Post-Minutes-Lock
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ac_decision_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locked boolean := false;
BEGIN
  SELECT is_locked INTO v_locked
  FROM public.academic_council_minutes
  WHERE meeting_id = OLD.meeting_id;

  IF coalesce(v_locked, false) THEN
    -- If minutes are locked, core source text and linkage cannot be altered
    IF NEW.meeting_id <> OLD.meeting_id
       OR NEW.agenda_item_id IS DISTINCT FROM OLD.agenda_item_id
       OR NEW.decision_number <> OLD.decision_number
       OR NEW.canonical_decision_number IS DISTINCT FROM OLD.canonical_decision_number
       OR NEW.title <> OLD.title
       OR NEW.body <> OLD.body THEN
      RAISE EXCEPTION 'COUNCIL_DECISION_LOCKED_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_decision_lock_guard ON public.academic_council_decisions;
CREATE TRIGGER trg_ac_decision_lock_guard
  BEFORE UPDATE ON public.academic_council_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_decision_lock_guard();

-- ---------------------------------------------------------------------
-- 3) RPC Actions for Decisions & Follow-up
-- ---------------------------------------------------------------------

-- A) Issue Decision (Chair or Secretary)
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
  v_min public.academic_council_minutes%ROWTYPE;
  v_next_num integer;
  v_canonical text;
  v_dec_id uuid;
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;
  IF length(trim(coalesce(p_title, ''))) = 0 THEN RAISE EXCEPTION 'COUNCIL_DECISION_TITLE_REQUIRED' USING ERRCODE = '22000'; END IF;
  IF length(trim(coalesce(p_body, ''))) = 0 THEN RAISE EXCEPTION 'COUNCIL_DECISION_BODY_REQUIRED' USING ERRCODE = '22000'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Authority check: Chair or Secretary (No admin academic bypass)
  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Minutes reference
  SELECT * INTO v_min FROM public.academic_council_minutes WHERE meeting_id = p_meeting_id;

  -- Generate sequential decision number for this meeting
  SELECT coalesce(max(decision_number), 0) + 1 INTO v_next_num
  FROM public.academic_council_decisions
  WHERE meeting_id = p_meeting_id;

  v_canonical := 'DEC-' || substring(p_meeting_id::text, 1, 8) || '-' || lpad(v_next_num::text, 3, '0');

  INSERT INTO public.academic_council_decisions (
    meeting_id, agenda_item_id, minutes_id, decision_number, canonical_decision_number,
    title, body, status, responsible_user_id, responsible_unit, due_date, created_by, updated_by
  ) VALUES (
    p_meeting_id, p_agenda_item_id, v_min.id, v_next_num, v_canonical,
    p_title, p_body, 'issued'::public.academic_council_decision_status,
    p_responsible_user_id, p_responsible_unit, p_due_date, v_uid, v_uid
  ) RETURNING id INTO v_dec_id;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'decision_issued', 'academic_council_decisions', v_dec_id,
    jsonb_build_object(
      'canonical_number', v_canonical,
      'decision_id', v_dec_id,
      'responsible_user_id', p_responsible_user_id
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

-- B) Update Decision Follow-up Progress (Responsible Actor or Chair)
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
BEGIN
  IF p_decision_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_DECISION_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_dec FROM public.academic_council_decisions WHERE id = p_decision_id FOR UPDATE;
  IF v_dec.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_DECISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_dec.meeting_id;

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

  -- Guard backward transition: cannot revert completed decision to issued
  IF v_dec.status = 'completed'::public.academic_council_decision_status
     AND v_parsed_status NOT IN ('completed'::public.academic_council_decision_status) THEN
    RAISE EXCEPTION 'COUNCIL_COMPLETED_DECISION_BACKWARDS_TRANSITION_DENIED' USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_decisions
  SET status = v_parsed_status,
      execution_note = coalesce(p_execution_note, execution_note),
      evidence_metadata = coalesce(p_evidence_metadata, evidence_metadata),
      completed_at = (CASE WHEN v_parsed_status = 'completed'::public.academic_council_decision_status THEN coalesce(completed_at, now()) ELSE completed_at END),
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_decision_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'decision_followup_updated', 'academic_council_decisions', p_decision_id,
    jsonb_build_object(
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

-- C) Complete Decision Action (Responsible Actor or Chair)
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
-- 4) Revoke & Grant Execute for C6 RPCs
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.issue_council_decision(uuid, uuid, text, text, uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_council_decision_followup(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_council_decision(uuid, text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_council_decision(uuid, uuid, text, text, uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_council_decision_followup(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_council_decision(uuid, text, jsonb) TO authenticated, service_role;
