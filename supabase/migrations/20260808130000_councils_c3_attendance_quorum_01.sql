-- =====================================================================
-- ACADEMIC-COUNCILS-C3-ATTENDANCE-AND-QUORUM-FOUNDATION-05
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   Configurable council quorum policy (fail-closed when absent)
--   Meeting attendance snapshot bound to eligible members at capture time
--   Server-side quorum evaluation + chair finalization
--   Authoritative predicate meeting_has_valid_quorum(meeting_id)
--   Append-only audit evidence for evaluation/finalization
--   RPC-only writes (no authenticated direct INSERT/UPDATE/DELETE)
--
-- Non-goals:
--   Proxy voting/attendance
--   Invented university-wide quorum percentage
--   C0 write-surface revoke package / C1 meeting state machine transitions
--   Production apply / deploy / publish
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard: council lifecycle tables must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_councils') IS NULL
     OR to_regclass('public.academic_council_members') IS NULL
     OR to_regclass('public.academic_council_meetings') IS NULL THEN
    RAISE EXCEPTION 'councils C3 attendance/quorum requires academic council base tables';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.academic_council_attendance_state AS ENUM (
    'present',
    'present_remote',
    'excused',
    'absent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.academic_council_quorum_threshold_kind AS ENUM (
    'absolute',
    'ratio'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.academic_council_quorum_policy_status AS ENUM (
    'draft',
    'approved',
    'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.academic_council_attendance_roll_status AS ENUM (
    'open',
    'finalized'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 2) Quorum policy (configurable per council; one current approved)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_quorum_policies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id            uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  policy_version        integer NOT NULL CHECK (policy_version > 0),
  threshold_kind        public.academic_council_quorum_threshold_kind NOT NULL,
  absolute_count        integer CHECK (absolute_count IS NULL OR absolute_count > 0),
  ratio_numerator       integer CHECK (ratio_numerator IS NULL OR ratio_numerator > 0),
  ratio_denominator     integer CHECK (ratio_denominator IS NULL OR ratio_denominator > 0),
  status                public.academic_council_quorum_policy_status NOT NULL DEFAULT 'draft',
  approved_at           timestamptz,
  approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  superseded_at         timestamptz,
  created_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_council_quorum_policies_threshold_shape CHECK (
    (
      threshold_kind = 'absolute'
      AND absolute_count IS NOT NULL
      AND ratio_numerator IS NULL
      AND ratio_denominator IS NULL
    )
    OR (
      threshold_kind = 'ratio'
      AND absolute_count IS NULL
      AND ratio_numerator IS NOT NULL
      AND ratio_denominator IS NOT NULL
      AND ratio_numerator <= ratio_denominator
    )
  ),
  CONSTRAINT academic_council_quorum_policies_approved_meta CHECK (
    (status = 'approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    OR (status <> 'approved')
  ),
  UNIQUE (council_id, policy_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_quorum_policies_one_approved
  ON public.academic_council_quorum_policies(council_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_ac_quorum_policies_council
  ON public.academic_council_quorum_policies(council_id, status);

-- ---------------------------------------------------------------------
-- 3) Attendance roll + immutable member snapshot lines
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_meeting_attendance_rolls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id            uuid NOT NULL UNIQUE
                        REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  council_id            uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  status                public.academic_council_attendance_roll_status NOT NULL DEFAULT 'open',
  snapshot_taken_at     timestamptz NOT NULL DEFAULT now(),
  eligible_member_count integer NOT NULL DEFAULT 0 CHECK (eligible_member_count >= 0),
  opened_by             uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  finalized_at          timestamptz,
  finalized_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_council_attendance_rolls_finalize_meta CHECK (
    (status = 'finalized' AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL)
    OR (status = 'open' AND finalized_at IS NULL AND finalized_by IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.academic_council_meeting_attendance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id            uuid NOT NULL
                        REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  roll_id               uuid NOT NULL
                        REFERENCES public.academic_council_meeting_attendance_rolls(id) ON DELETE RESTRICT,
  membership_id         uuid NOT NULL
                        REFERENCES public.academic_council_members(id) ON DELETE RESTRICT,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  member_role           public.academic_council_member_role NOT NULL,
  membership_active_from date NOT NULL,
  membership_active_to  date,
  attendance_state      public.academic_council_attendance_state NOT NULL DEFAULT 'absent',
  recorded_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, membership_id),
  UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ac_meeting_attendance_meeting
  ON public.academic_council_meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_ac_meeting_attendance_user
  ON public.academic_council_meeting_attendance(user_id);

-- ---------------------------------------------------------------------
-- 4) Quorum evaluation snapshot (server-computed only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_meeting_quorum_evaluations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id              uuid NOT NULL
                          REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  roll_id                 uuid NOT NULL
                          REFERENCES public.academic_council_meeting_attendance_rolls(id) ON DELETE RESTRICT,
  policy_id               uuid NOT NULL
                          REFERENCES public.academic_council_quorum_policies(id) ON DELETE RESTRICT,
  policy_version          integer NOT NULL,
  eligible_member_count   integer NOT NULL CHECK (eligible_member_count >= 0),
  present_member_count    integer NOT NULL CHECK (present_member_count >= 0),
  required_member_count   integer NOT NULL CHECK (required_member_count >= 0),
  quorum_met              boolean NOT NULL,
  evaluated_at            timestamptz NOT NULL DEFAULT now(),
  evaluated_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_final                boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_quorum_eval_one_final
  ON public.academic_council_meeting_quorum_evaluations(meeting_id)
  WHERE is_final;

CREATE INDEX IF NOT EXISTS idx_ac_quorum_eval_meeting
  ON public.academic_council_meeting_quorum_evaluations(meeting_id, evaluated_at DESC);

-- ---------------------------------------------------------------------
-- 5) Append-only attendance/quorum audit evidence
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_attendance_audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  meeting_id      uuid REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  council_id      uuid REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  actor_user_id   uuid,
  action_type     text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ac_attendance_audit_meeting
  ON public.academic_council_attendance_audit_events(meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ac_attendance_audit_action
  ON public.academic_council_attendance_audit_events(action_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_ac_attendance_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'COUNCIL_ATTENDANCE_AUDIT_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_attendance_audit_no_update ON public.academic_council_attendance_audit_events;
CREATE TRIGGER trg_ac_attendance_audit_no_update
  BEFORE UPDATE OR DELETE ON public.academic_council_attendance_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_attendance_audit_immutable();

-- ---------------------------------------------------------------------
-- 6) Grants: SELECT only for clients; writes via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_council_quorum_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_council_meeting_attendance_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_council_meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_council_meeting_quorum_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_council_attendance_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academic_council_quorum_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academic_council_meeting_attendance_rolls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academic_council_meeting_attendance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academic_council_meeting_quorum_evaluations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.academic_council_attendance_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.academic_council_quorum_policies TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_meeting_attendance_rolls TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_meeting_attendance TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_meeting_quorum_evaluations TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_attendance_audit_events TO authenticated, service_role;

GRANT ALL ON TABLE public.academic_council_quorum_policies TO service_role;
GRANT ALL ON TABLE public.academic_council_meeting_attendance_rolls TO service_role;
GRANT ALL ON TABLE public.academic_council_meeting_attendance TO service_role;
GRANT ALL ON TABLE public.academic_council_meeting_quorum_evaluations TO service_role;
GRANT ALL ON TABLE public.academic_council_attendance_audit_events TO service_role;

-- SELECT policies (no write policies — RPC-only mutations)
DROP POLICY IF EXISTS "ac_quorum_policies_select" ON public.academic_council_quorum_policies;
CREATE POLICY "ac_quorum_policies_select"
  ON public.academic_council_quorum_policies
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
  );

DROP POLICY IF EXISTS "ac_attendance_rolls_select" ON public.academic_council_meeting_attendance_rolls;
CREATE POLICY "ac_attendance_rolls_select"
  ON public.academic_council_meeting_attendance_rolls
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR public.is_council_member(auth.uid(), council_id)
  );

DROP POLICY IF EXISTS "ac_meeting_attendance_select" ON public.academic_council_meeting_attendance;
CREATE POLICY "ac_meeting_attendance_select"
  ON public.academic_council_meeting_attendance
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_council_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.academic_council_meetings mt
      WHERE mt.id = meeting_id
        AND public.is_council_member(auth.uid(), mt.council_id)
    )
  );

DROP POLICY IF EXISTS "ac_quorum_evaluations_select" ON public.academic_council_meeting_quorum_evaluations;
CREATE POLICY "ac_quorum_evaluations_select"
  ON public.academic_council_meeting_quorum_evaluations
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.academic_council_meetings mt
      WHERE mt.id = meeting_id
        AND public.is_council_member(auth.uid(), mt.council_id)
    )
  );

DROP POLICY IF EXISTS "ac_attendance_audit_select" ON public.academic_council_attendance_audit_events;
CREATE POLICY "ac_attendance_audit_select"
  ON public.academic_council_attendance_audit_events
  FOR SELECT TO authenticated
  USING (
    public.is_council_admin(auth.uid())
    OR (
      council_id IS NOT NULL
      AND public.is_council_member(auth.uid(), council_id)
    )
  );

-- ---------------------------------------------------------------------
-- 7) Internal helpers (not client-facing academic authority bypass)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_attendance_require_auth_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.council_attendance_deny(p_code text DEFAULT 'COUNCIL_ACCESS_DENIED')
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '%', p_code USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.council_attendance_emit_audit(
  p_meeting_id uuid,
  p_council_id uuid,
  p_actor uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.academic_council_attendance_audit_events (
    meeting_id, council_id, actor_user_id, action_type, entity_type, entity_id, payload
  ) VALUES (
    p_meeting_id, p_council_id, p_actor, p_action_type, p_entity_type, p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.council_member_is_quorum_eligible(
  p_role public.academic_council_member_role
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_role IN (
    'chair'::public.academic_council_member_role,
    'vice_chair'::public.academic_council_member_role,
    'secretary'::public.academic_council_member_role,
    'member'::public.academic_council_member_role
  );
$$;

CREATE OR REPLACE FUNCTION public.council_attendance_state_counts_present(
  p_state public.academic_council_attendance_state
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_state IN (
    'present'::public.academic_council_attendance_state,
    'present_remote'::public.academic_council_attendance_state
  );
$$;

CREATE OR REPLACE FUNCTION public.council_meeting_attendance_is_locked(p_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status public.academic_council_meeting_status;
  v_roll_status public.academic_council_attendance_roll_status;
BEGIN
  SELECT m.status INTO v_status
  FROM public.academic_council_meetings m
  WHERE m.id = p_meeting_id;

  IF v_status IS NULL THEN
    RETURN true;
  END IF;

  IF v_status IN (
    'in_session'::public.academic_council_meeting_status,
    'minutes_draft'::public.academic_council_meeting_status,
    'minutes_locked'::public.academic_council_meeting_status,
    'archived'::public.academic_council_meeting_status
  ) THEN
    RETURN true;
  END IF;

  SELECT r.status INTO v_roll_status
  FROM public.academic_council_meeting_attendance_rolls r
  WHERE r.meeting_id = p_meeting_id;

  RETURN coalesce(v_roll_status, 'open'::public.academic_council_attendance_roll_status)
    = 'finalized'::public.academic_council_attendance_roll_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.council_current_approved_quorum_policy(p_council_id uuid)
RETURNS public.academic_council_quorum_policies
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_policy public.academic_council_quorum_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_policy
  FROM public.academic_council_quorum_policies p
  WHERE p.council_id = p_council_id
    AND p.status = 'approved'::public.academic_council_quorum_policy_status
  ORDER BY p.policy_version DESC
  LIMIT 1;

  RETURN v_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.council_compute_required_member_count(
  p_policy public.academic_council_quorum_policies,
  p_eligible integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_required integer;
BEGIN
  IF p_eligible IS NULL OR p_eligible < 0 THEN
    RETURN NULL;
  END IF;

  IF p_policy.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_policy.threshold_kind = 'absolute'::public.academic_council_quorum_threshold_kind THEN
    v_required := p_policy.absolute_count;
  ELSE
    v_required := ceil(
      (p_eligible::numeric * p_policy.ratio_numerator::numeric)
      / p_policy.ratio_denominator::numeric
    )::integer;
  END IF;

  IF v_required < 1 THEN
    v_required := 1;
  END IF;

  IF v_required > p_eligible THEN
    v_required := p_eligible;
  END IF;

  RETURN v_required;
END;
$$;

CREATE OR REPLACE FUNCTION public.council_ensure_attendance_roll(
  p_meeting_id uuid,
  p_actor uuid
)
RETURNS public.academic_council_meeting_attendance_rolls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF v_meeting.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  SELECT * INTO v_roll
  FROM public.academic_council_meeting_attendance_rolls
  WHERE meeting_id = p_meeting_id
  FOR UPDATE;

  IF v_roll.id IS NOT NULL THEN
    RETURN v_roll;
  END IF;

  INSERT INTO public.academic_council_meeting_attendance_rolls (
    meeting_id, council_id, status, snapshot_taken_at, eligible_member_count, opened_by
  ) VALUES (
    v_meeting.id, v_meeting.council_id, 'open', now(), 0, p_actor
  )
  RETURNING * INTO v_roll;

  INSERT INTO public.academic_council_meeting_attendance (
    meeting_id,
    roll_id,
    membership_id,
    user_id,
    member_role,
    membership_active_from,
    membership_active_to,
    attendance_state
  )
  SELECT
    v_meeting.id,
    v_roll.id,
    m.id,
    m.user_id,
    m.member_role,
    m.active_from,
    m.active_to,
    'absent'::public.academic_council_attendance_state
  FROM public.academic_council_members m
  WHERE m.council_id = v_meeting.council_id
    AND m.is_active = true
    AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
    AND public.council_member_is_quorum_eligible(m.member_role);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.academic_council_meeting_attendance_rolls
  SET eligible_member_count = v_count,
      updated_at = now()
  WHERE id = v_roll.id
  RETURNING * INTO v_roll;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id,
    v_meeting.council_id,
    p_actor,
    'attendance_snapshot_opened',
    'academic_council_meeting_attendance_roll',
    v_roll.id,
    jsonb_build_object('eligible_member_count', v_count)
  );

  RETURN v_roll;
END;
$$;

CREATE OR REPLACE FUNCTION public.council_evaluate_quorum_internal(
  p_meeting_id uuid,
  p_actor uuid,
  p_final boolean
)
RETURNS public.academic_council_meeting_quorum_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_policy public.academic_council_quorum_policies%ROWTYPE;
  v_present integer;
  v_required integer;
  v_eval public.academic_council_meeting_quorum_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF v_meeting.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  SELECT * INTO v_roll
  FROM public.academic_council_meeting_attendance_rolls
  WHERE meeting_id = p_meeting_id
  FOR UPDATE;

  IF v_roll.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_ROLL_REQUIRED');
  END IF;

  v_policy := public.council_current_approved_quorum_policy(v_meeting.council_id);
  IF v_policy.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_QUORUM_POLICY_REQUIRED');
  END IF;

  SELECT count(*)::integer INTO v_present
  FROM public.academic_council_meeting_attendance a
  WHERE a.meeting_id = p_meeting_id
    AND public.council_attendance_state_counts_present(a.attendance_state);

  v_required := public.council_compute_required_member_count(v_policy, v_roll.eligible_member_count);

  IF v_required IS NULL OR v_roll.eligible_member_count < 1 THEN
    PERFORM public.council_attendance_deny('COUNCIL_QUORUM_FAIL_CLOSED');
  END IF;

  IF p_final THEN
    UPDATE public.academic_council_meeting_quorum_evaluations
    SET is_final = false
    WHERE meeting_id = p_meeting_id
      AND is_final;
  END IF;

  INSERT INTO public.academic_council_meeting_quorum_evaluations (
    meeting_id,
    roll_id,
    policy_id,
    policy_version,
    eligible_member_count,
    present_member_count,
    required_member_count,
    quorum_met,
    evaluated_at,
    evaluated_by,
    is_final
  ) VALUES (
    p_meeting_id,
    v_roll.id,
    v_policy.id,
    v_policy.policy_version,
    v_roll.eligible_member_count,
    v_present,
    v_required,
    (v_present >= v_required),
    now(),
    p_actor,
    p_final
  )
  RETURNING * INTO v_eval;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id,
    v_meeting.council_id,
    p_actor,
    CASE WHEN p_final THEN 'quorum_evaluation_final' ELSE 'quorum_evaluation' END,
    'academic_council_meeting_quorum_evaluation',
    v_eval.id,
    jsonb_build_object(
      'eligible_member_count', v_eval.eligible_member_count,
      'present_member_count', v_eval.present_member_count,
      'required_member_count', v_eval.required_member_count,
      'quorum_met', v_eval.quorum_met,
      'policy_version', v_eval.policy_version,
      'is_final', v_eval.is_final
    )
  );

  RETURN v_eval;
END;
$$;

REVOKE ALL ON FUNCTION public.council_attendance_require_auth_uid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.council_attendance_deny(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.council_attendance_emit_audit(uuid, uuid, uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.council_ensure_attendance_roll(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.council_evaluate_quorum_internal(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.council_current_approved_quorum_policy(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.council_member_is_quorum_eligible(public.academic_council_member_role)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.council_attendance_state_counts_present(public.academic_council_attendance_state)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.council_meeting_attendance_is_locked(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.council_compute_required_member_count(public.academic_council_quorum_policies, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8) Public RPCs
-- ---------------------------------------------------------------------

-- Chair: approve a configurable quorum policy for the council (supersedes prior approved).
CREATE OR REPLACE FUNCTION public.council_approve_quorum_policy(
  p_council_id uuid,
  p_threshold_kind public.academic_council_quorum_threshold_kind,
  p_absolute_count integer DEFAULT NULL,
  p_ratio_numerator integer DEFAULT NULL,
  p_ratio_denominator integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_next_version integer;
  v_policy_id uuid;
BEGIN
  IF p_council_id IS NULL OR p_threshold_kind IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_INVALID_ARGS');
  END IF;

  IF NOT public.has_council_role(
    v_uid, p_council_id, 'chair'::public.academic_council_member_role
  ) THEN
    PERFORM public.council_attendance_deny('COUNCIL_QUORUM_POLICY_CHAIR_REQUIRED');
  END IF;

  SELECT coalesce(max(policy_version), 0) + 1
  INTO v_next_version
  FROM public.academic_council_quorum_policies
  WHERE council_id = p_council_id;

  UPDATE public.academic_council_quorum_policies
  SET status = 'superseded'::public.academic_council_quorum_policy_status,
      superseded_at = now(),
      updated_at = now()
  WHERE council_id = p_council_id
    AND status = 'approved'::public.academic_council_quorum_policy_status;

  INSERT INTO public.academic_council_quorum_policies (
    council_id,
    policy_version,
    threshold_kind,
    absolute_count,
    ratio_numerator,
    ratio_denominator,
    status,
    approved_at,
    approved_by,
    created_by
  ) VALUES (
    p_council_id,
    v_next_version,
    p_threshold_kind,
    CASE WHEN p_threshold_kind = 'absolute' THEN p_absolute_count ELSE NULL END,
    CASE WHEN p_threshold_kind = 'ratio' THEN p_ratio_numerator ELSE NULL END,
    CASE WHEN p_threshold_kind = 'ratio' THEN p_ratio_denominator ELSE NULL END,
    'approved'::public.academic_council_quorum_policy_status,
    now(),
    v_uid,
    v_uid
  )
  RETURNING id INTO v_policy_id;

  PERFORM public.council_attendance_emit_audit(
    NULL,
    p_council_id,
    v_uid,
    'quorum_policy_approved',
    'academic_council_quorum_policy',
    v_policy_id,
    jsonb_build_object(
      'policy_version', v_next_version,
      'threshold_kind', p_threshold_kind,
      'absolute_count', p_absolute_count,
      'ratio_numerator', p_ratio_numerator,
      'ratio_denominator', p_ratio_denominator
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'policy_id', v_policy_id,
    'policy_version', v_next_version
  );
END;
$$;

-- Secretary: record attendance states against the meeting-time eligible snapshot.
CREATE OR REPLACE FUNCTION public.record_council_meeting_attendance(
  p_meeting_id uuid,
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_entry jsonb;
  v_membership_id uuid;
  v_user_id uuid;
  v_state text;
  v_updated integer := 0;
BEGIN
  IF p_meeting_id IS NULL OR p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    PERFORM public.council_attendance_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF v_meeting.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.has_council_role(
    v_uid, v_meeting.council_id, 'secretary'::public.academic_council_member_role
  ) THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_SECRETARY_REQUIRED');
  END IF;

  IF public.council_meeting_attendance_is_locked(p_meeting_id) THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_LOCKED');
  END IF;

  v_roll := public.council_ensure_attendance_roll(p_meeting_id, v_uid);

  IF v_roll.status = 'finalized'::public.academic_council_attendance_roll_status THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_LOCKED');
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_membership_id := nullif(v_entry->>'membership_id', '')::uuid;
    v_user_id := nullif(v_entry->>'user_id', '')::uuid;
    v_state := v_entry->>'attendance_state';

    IF v_state IS NULL OR v_state NOT IN ('present', 'present_remote', 'excused', 'absent') THEN
      PERFORM public.council_attendance_deny('COUNCIL_INVALID_ATTENDANCE_STATE');
    END IF;

    UPDATE public.academic_council_meeting_attendance a
    SET attendance_state = v_state::public.academic_council_attendance_state,
        recorded_by = v_uid,
        recorded_at = now(),
        updated_at = now()
    WHERE a.meeting_id = p_meeting_id
      AND a.roll_id = v_roll.id
      AND (
        (v_membership_id IS NOT NULL AND a.membership_id = v_membership_id)
        OR (v_membership_id IS NULL AND v_user_id IS NOT NULL AND a.user_id = v_user_id)
      );

    IF NOT FOUND THEN
      PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_MEMBER_NOT_IN_SNAPSHOT');
    END IF;

    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated = 0 THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_ENTRIES_REQUIRED');
  END IF;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id,
    v_meeting.council_id,
    v_uid,
    'attendance_recorded',
    'academic_council_meeting_attendance_roll',
    v_roll.id,
    jsonb_build_object('updated_count', v_updated, 'entries', p_entries)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', p_meeting_id,
    'roll_id', v_roll.id,
    'updated_count', v_updated,
    'eligible_member_count', v_roll.eligible_member_count
  );
END;
$$;

-- Secretary or chair: evaluate quorum using the current approved policy (server-side only).
CREATE OR REPLACE FUNCTION public.evaluate_council_meeting_quorum(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_eval public.academic_council_meeting_quorum_evaluations%ROWTYPE;
BEGIN
  IF p_meeting_id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id;

  IF v_meeting.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT (
    public.has_council_role(v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role)
    OR public.has_council_role(v_uid, v_meeting.council_id, 'secretary'::public.academic_council_member_role)
  ) THEN
    PERFORM public.council_attendance_deny('COUNCIL_QUORUM_EVAL_DENIED');
  END IF;

  IF public.council_meeting_attendance_is_locked(p_meeting_id)
     AND EXISTS (
       SELECT 1 FROM public.academic_council_meeting_attendance_rolls r
       WHERE r.meeting_id = p_meeting_id
         AND r.status = 'finalized'::public.academic_council_attendance_roll_status
     ) THEN
    -- Allow read-style re-evaluation denial once finalized (immutable MVP).
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_LOCKED');
  END IF;

  PERFORM public.council_ensure_attendance_roll(p_meeting_id, v_uid);
  v_eval := public.council_evaluate_quorum_internal(p_meeting_id, v_uid, false);

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', p_meeting_id,
    'evaluation_id', v_eval.id,
    'eligible_member_count', v_eval.eligible_member_count,
    'present_member_count', v_eval.present_member_count,
    'required_member_count', v_eval.required_member_count,
    'quorum_met', v_eval.quorum_met,
    'evaluated_at', v_eval.evaluated_at,
    'evaluated_by', v_eval.evaluated_by,
    'policy_version', v_eval.policy_version,
    'is_final', v_eval.is_final
  );
END;
$$;

-- Chair: finalize attendance + authoritative quorum snapshot.
CREATE OR REPLACE FUNCTION public.finalize_council_meeting_attendance(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_eval public.academic_council_meeting_quorum_evaluations%ROWTYPE;
BEGIN
  IF p_meeting_id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_INVALID_ARGS');
  END IF;

  -- Serialize concurrent finalization on the meeting row.
  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF v_meeting.id IS NULL THEN
    PERFORM public.council_attendance_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.has_council_role(
    v_uid, v_meeting.council_id, 'chair'::public.academic_council_member_role
  ) THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_FINALIZE_CHAIR_REQUIRED');
  END IF;

  IF v_meeting.status IN (
    'in_session'::public.academic_council_meeting_status,
    'minutes_draft'::public.academic_council_meeting_status,
    'minutes_locked'::public.academic_council_meeting_status,
    'archived'::public.academic_council_meeting_status
  ) THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_LOCKED');
  END IF;

  v_roll := public.council_ensure_attendance_roll(p_meeting_id, v_uid);

  SELECT * INTO v_roll
  FROM public.academic_council_meeting_attendance_rolls
  WHERE id = v_roll.id
  FOR UPDATE;

  IF v_roll.status = 'finalized'::public.academic_council_attendance_roll_status THEN
    PERFORM public.council_attendance_deny('COUNCIL_ATTENDANCE_ALREADY_FINALIZED');
  END IF;

  v_eval := public.council_evaluate_quorum_internal(p_meeting_id, v_uid, true);

  UPDATE public.academic_council_meeting_attendance_rolls
  SET status = 'finalized'::public.academic_council_attendance_roll_status,
      finalized_at = now(),
      finalized_by = v_uid,
      updated_at = now()
  WHERE id = v_roll.id
  RETURNING * INTO v_roll;

  PERFORM public.council_attendance_emit_audit(
    p_meeting_id,
    v_meeting.council_id,
    v_uid,
    'attendance_finalized',
    'academic_council_meeting_attendance_roll',
    v_roll.id,
    jsonb_build_object(
      'evaluation_id', v_eval.id,
      'quorum_met', v_eval.quorum_met,
      'eligible_member_count', v_eval.eligible_member_count,
      'present_member_count', v_eval.present_member_count,
      'required_member_count', v_eval.required_member_count,
      'policy_version', v_eval.policy_version
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', p_meeting_id,
    'roll_id', v_roll.id,
    'evaluation_id', v_eval.id,
    'eligible_member_count', v_eval.eligible_member_count,
    'present_member_count', v_eval.present_member_count,
    'required_member_count', v_eval.required_member_count,
    'quorum_met', v_eval.quorum_met,
    'evaluated_at', v_eval.evaluated_at,
    'evaluated_by', v_eval.evaluated_by,
    'policy_version', v_eval.policy_version,
    'finalized_at', v_roll.finalized_at,
    'finalized_by', v_roll.finalized_by
  );
END;
$$;

-- Authoritative session gate for C1/C4: true only when finalized AND quorum_met.
CREATE OR REPLACE FUNCTION public.meeting_has_valid_quorum(p_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_roll public.academic_council_meeting_attendance_rolls%ROWTYPE;
  v_eval public.academic_council_meeting_quorum_evaluations%ROWTYPE;
  v_policy public.academic_council_quorum_policies%ROWTYPE;
  v_council_id uuid;
BEGIN
  IF p_meeting_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT council_id INTO v_council_id
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id;

  IF v_council_id IS NULL THEN
    RETURN false;
  END IF;

  -- Fail closed when no approved policy exists.
  v_policy := public.council_current_approved_quorum_policy(v_council_id);
  IF v_policy.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_roll
  FROM public.academic_council_meeting_attendance_rolls
  WHERE meeting_id = p_meeting_id;

  IF v_roll.id IS NULL
     OR v_roll.status <> 'finalized'::public.academic_council_attendance_roll_status THEN
    RETURN false;
  END IF;

  SELECT * INTO v_eval
  FROM public.academic_council_meeting_quorum_evaluations e
  WHERE e.meeting_id = p_meeting_id
    AND e.is_final = true
  ORDER BY e.evaluated_at DESC
  LIMIT 1;

  IF v_eval.id IS NULL THEN
    RETURN false;
  END IF;

  RETURN coalesce(v_eval.quorum_met, false);
END;
$$;

REVOKE ALL ON FUNCTION public.council_approve_quorum_policy(
  uuid, public.academic_council_quorum_threshold_kind, integer, integer, integer
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_council_meeting_attendance(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_council_meeting_quorum(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_council_meeting_attendance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_has_valid_quorum(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.council_approve_quorum_policy(
  uuid, public.academic_council_quorum_threshold_kind, integer, integer, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_council_meeting_attendance(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_council_meeting_quorum(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_council_meeting_attendance(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meeting_has_valid_quorum(uuid)
  TO authenticated, service_role;

COMMIT;
