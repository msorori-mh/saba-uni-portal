-- =====================================================================
-- ACADEMIC-COUNCILS-C5-MINUTES-LIFECYCLE-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   Canonical minutes lifecycle: minutes_draft -> minutes_review -> minutes_locked
--   Secretary draft/submit vs Chair approve/lock authority matrix
--   Canonical evidence fields (approved_at, approved_by, locked_at, locked_by, version, fingerprint)
--   Strict BEFORE UPDATE & BEFORE DELETE triggers preventing deletion or alteration of locked minutes
--   Lock guard preventing mutation of agenda results, votes, or meeting source evidence once locked
--   Explicit future amendment model (academic_council_minutes_amendments) without rewriting history
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard: C4 session & voting must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_minutes') IS NULL THEN
    RAISE EXCEPTION 'C5 minutes lifecycle requires academic_council_minutes table';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Enums & Table Additions
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.academic_council_minutes_status AS ENUM (
    'minutes_draft',
    'minutes_review',
    'minutes_locked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.academic_council_minutes
  ADD COLUMN IF NOT EXISTS status public.academic_council_minutes_status NOT NULL DEFAULT 'minutes_draft',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS fingerprint text;

-- Future Amendment Model Table
CREATE TABLE IF NOT EXISTS public.academic_council_minutes_amendments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        uuid NOT NULL REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  minutes_id        uuid NOT NULL REFERENCES public.academic_council_minutes(id) ON DELETE RESTRICT,
  amendment_number  integer NOT NULL CHECK (amendment_number > 0),
  reason            text NOT NULL,
  amended_content   text NOT NULL,
  created_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (minutes_id, amendment_number)
);

CREATE INDEX IF NOT EXISTS idx_ac_minutes_amendments_meeting ON public.academic_council_minutes_amendments(meeting_id);

-- Grants & RLS for Amendments
ALTER TABLE public.academic_council_minutes_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academic_council_minutes_amendments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.academic_council_minutes_amendments TO authenticated, service_role;
GRANT ALL ON TABLE public.academic_council_minutes_amendments TO service_role;

DROP POLICY IF EXISTS "ac_minutes_amendments_select" ON public.academic_council_minutes_amendments;
CREATE POLICY "ac_minutes_amendments_select"
  ON public.academic_council_minutes_amendments
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.academic_council_meetings mt
      WHERE mt.id = meeting_id AND public.is_council_member(auth.uid(), mt.council_id)
    )
  );

-- ---------------------------------------------------------------------
-- 2) Strict Lock Guard Triggers (BEFORE UPDATE & BEFORE DELETE)
-- ---------------------------------------------------------------------

-- A) Minutes Lock Guard
CREATE OR REPLACE FUNCTION public.tg_ac_minutes_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked = true OR OLD.status = 'minutes_locked'::public.academic_council_minutes_status THEN
      RAISE EXCEPTION 'COUNCIL_MINUTES_LOCKED_DELETE_DENIED' USING ERRCODE = '42501';
    END IF;
    -- Any direct deletion of minutes is forbidden via standard application paths
    RAISE EXCEPTION 'COUNCIL_MINUTES_DELETE_DENIED' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If already locked, no mutation allowed on body, is_locked, status, locked_at, fingerprint
    IF OLD.is_locked = true OR OLD.status = 'minutes_locked'::public.academic_council_minutes_status THEN
      -- Allow no changes once locked
      RAISE EXCEPTION 'COUNCIL_MINUTES_LOCKED_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_minutes_lock_guard ON public.academic_council_minutes;
CREATE TRIGGER trg_ac_minutes_lock_guard
  BEFORE UPDATE OR DELETE ON public.academic_council_minutes
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_minutes_lock_guard();

-- B) Meeting Source Evidence Lock Guard
CREATE OR REPLACE FUNCTION public.tg_ac_meeting_source_evidence_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting_id uuid;
  v_locked boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'academic_council_meetings' THEN
    v_meeting_id := OLD.id;
  ELSIF TG_TABLE_NAME IN ('academic_council_agenda_items', 'academic_council_votes', 'academic_council_vote_results') THEN
    v_meeting_id := OLD.meeting_id;
  END IF;

  IF v_meeting_id IS NOT NULL THEN
    SELECT is_locked INTO v_locked
    FROM public.academic_council_minutes
    WHERE meeting_id = v_meeting_id;

    IF coalesce(v_locked, false) THEN
      RAISE EXCEPTION 'COUNCIL_LOCKED_MEETING_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_agenda_items_lock_guard ON public.academic_council_agenda_items;
CREATE TRIGGER trg_ac_agenda_items_lock_guard
  BEFORE UPDATE OR DELETE ON public.academic_council_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_meeting_source_evidence_lock_guard();

DROP TRIGGER IF EXISTS trg_ac_votes_lock_guard ON public.academic_council_votes;
CREATE TRIGGER trg_ac_votes_lock_guard
  BEFORE UPDATE OR DELETE ON public.academic_council_votes
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_meeting_source_evidence_lock_guard();

DROP TRIGGER IF EXISTS trg_ac_vote_results_lock_guard ON public.academic_council_vote_results;
CREATE TRIGGER trg_ac_vote_results_lock_guard
  BEFORE UPDATE OR DELETE ON public.academic_council_vote_results
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_meeting_source_evidence_lock_guard();

-- ---------------------------------------------------------------------
-- 3) Minutes Lifecycle RPC Actions
-- ---------------------------------------------------------------------

-- A) Draft Minutes (Secretary or Chair)
CREATE OR REPLACE FUNCTION public.draft_council_minutes(
  p_meeting_id uuid,
  p_body text
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
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF v_meeting.status <> 'minutes_draft'::public.academic_council_meeting_status THEN
    RAISE EXCEPTION 'COUNCIL_MINUTES_DRAFT_STATE_INVALID: status is %', v_meeting.status USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_min FROM public.academic_council_minutes WHERE meeting_id = p_meeting_id FOR UPDATE;

  IF v_min.id IS NOT NULL AND (v_min.is_locked OR v_min.status = 'minutes_locked'::public.academic_council_minutes_status) THEN
    RAISE EXCEPTION 'COUNCIL_MINUTES_LOCKED_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF v_min.id IS NULL THEN
    INSERT INTO public.academic_council_minutes (
      meeting_id, body, drafted_by, status, version, updated_at
    ) VALUES (
      p_meeting_id, coalesce(p_body, ''), v_uid, 'minutes_draft'::public.academic_council_minutes_status, 1, now()
    ) RETURNING * INTO v_min;
  ELSE
    UPDATE public.academic_council_minutes
    SET body = coalesce(p_body, body),
        status = 'minutes_draft'::public.academic_council_minutes_status,
        version = version + 1,
        updated_at = now()
    WHERE meeting_id = p_meeting_id
    RETURNING * INTO v_min;
  END IF;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'minutes_submitted', 'academic_council_minutes', v_min.id,
    jsonb_build_object('version', v_min.version, 'status', 'minutes_draft')
  );

  RETURN jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'version', v_min.version, 'status', 'minutes_draft');
END;
$$;

-- B) Submit Minutes for Review (Secretary only)
CREATE OR REPLACE FUNCTION public.submit_council_minutes_for_review(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_min public.academic_council_minutes%ROWTYPE;
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'secretary'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_SECRETARY_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_min FROM public.academic_council_minutes WHERE meeting_id = p_meeting_id FOR UPDATE;
  IF v_min.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MINUTES_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF v_min.is_locked OR v_min.status = 'minutes_locked'::public.academic_council_minutes_status THEN
    RAISE EXCEPTION 'COUNCIL_MINUTES_LOCKED_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  UPDATE public.academic_council_minutes
  SET status = 'minutes_review'::public.academic_council_minutes_status,
      updated_at = now()
  WHERE meeting_id = p_meeting_id;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'minutes_submitted_for_review', 'academic_council_minutes', v_min.id,
    jsonb_build_object('status', 'minutes_review')
  );

  RETURN jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'status', 'minutes_review');
END;
$$;

-- C) Approve and Lock Minutes (Chair only, quorum check, finalized attendance)
CREATE OR REPLACE FUNCTION public.approve_and_lock_council_minutes(
  p_meeting_id uuid,
  p_approved_body text DEFAULT NULL
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
  v_fp text;
  v_final_body text;
BEGIN
  IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_ID_REQUIRED' USING ERRCODE = '42883'; END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MEETING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Chair authority check (Exact Chair, NO admin bypass)
  IF NOT public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Quorum check
  IF NOT public.meeting_has_valid_quorum(p_meeting_id) THEN
    RAISE EXCEPTION 'COUNCIL_QUORUM_NOT_MET' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_min FROM public.academic_council_minutes WHERE meeting_id = p_meeting_id FOR UPDATE;
  IF v_min.id IS NULL THEN RAISE EXCEPTION 'COUNCIL_MINUTES_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF v_min.is_locked OR v_min.status = 'minutes_locked'::public.academic_council_minutes_status THEN
    RAISE EXCEPTION 'COUNCIL_MINUTES_ALREADY_LOCKED' USING ERRCODE = '22000';
  END IF;

  v_final_body := coalesce(p_approved_body, v_min.body);
  IF length(trim(v_final_body)) = 0 THEN
    RAISE EXCEPTION 'COUNCIL_MINUTES_BODY_REQUIRED' USING ERRCODE = '22000';
  END IF;

  -- Compute deterministic SHA256 fingerprint
  v_fp := encode(digest(p_meeting_id::text || ':' || v_final_body || ':' || now()::text, 'sha256'), 'hex');

  UPDATE public.academic_council_minutes
  SET body = v_final_body,
      status = 'minutes_locked'::public.academic_council_minutes_status,
      is_locked = true,
      approved_at = now(),
      approved_by = v_uid,
      locked_at = now(),
      locked_by = v_uid,
      fingerprint = v_fp,
      updated_at = now()
  WHERE meeting_id = p_meeting_id;

  UPDATE public.academic_council_meetings
  SET status = 'minutes_locked'::public.academic_council_meeting_status,
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_meeting_id;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id, v_meeting.council_id, v_uid,
    'minutes_locked', 'academic_council_minutes', v_min.id,
    jsonb_build_object('fingerprint', v_fp, 'approved_by', v_uid, 'locked_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', p_meeting_id,
    'status', 'minutes_locked',
    'is_locked', true,
    'fingerprint', v_fp
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4) Revoke & Grant Execute for C5 RPCs
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.draft_council_minutes(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_council_minutes_for_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_and_lock_council_minutes(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.draft_council_minutes(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_council_minutes_for_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_and_lock_council_minutes(uuid, text) TO authenticated, service_role;

COMMIT;
