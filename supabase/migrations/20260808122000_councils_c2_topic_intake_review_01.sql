-- =====================================================================
-- ACADEMIC-COUNCILS-C2-TOPIC-INTAKE-REVIEW-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   1) Intake-window helpers for topic submission
--   2) Split review authority: secretary prepare / chair final
--   3) Canonical topic lifecycle enforcement (trigger + RPC)
--   4) Replace C0 topic RPCs to require meeting intake + exact transitions
--   5) Keep write surface RPC-only (no DROP POLICY; deny-all policies untouched)
--
-- Non-goals:
--   production apply / deploy / publish / feature flags
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_topics') IS NULL
     OR to_regclass('public.academic_council_meetings') IS NULL
     OR to_regprocedure('public.council_require_auth_uid()') IS NULL
     OR to_regprocedure('public.council_deny(text)') IS NULL THEN
    RAISE EXCEPTION 'councils C2 requires C0 topic/meeting RPCs and lifecycle tables';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Intake helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_submit_to_council_meeting_intake(_user uuid, _meeting uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_meetings m
    JOIN public.academic_council_members mb
      ON mb.council_id = m.council_id
     AND mb.user_id = _user
     AND mb.is_active = true
     AND (mb.active_to IS NULL OR mb.active_to >= CURRENT_DATE)
     AND mb.member_role IN (
       'chair'::public.academic_council_member_role,
       'vice_chair'::public.academic_council_member_role,
       'secretary'::public.academic_council_member_role,
       'member'::public.academic_council_member_role
     )
    WHERE m.id = _meeting
      AND m.status = 'intake_open'::public.academic_council_meeting_status
      AND (m.intake_opens_at IS NULL OR m.intake_opens_at <= now())
      AND (m.intake_closes_at IS NULL OR m.intake_closes_at >= now())
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Review authority split
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_review_council_topic_prepare(_user uuid, _topic uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_topics t
    JOIN public.academic_council_members mb
      ON mb.council_id = t.council_id
     AND mb.user_id = _user
     AND mb.is_active = true
     AND (mb.active_to IS NULL OR mb.active_to >= CURRENT_DATE)
     AND mb.member_role IN (
       'chair'::public.academic_council_member_role,
       'secretary'::public.academic_council_member_role
     )
    WHERE t.id = _topic
  );
$$;

CREATE OR REPLACE FUNCTION public.can_review_council_topic_final(_user uuid, _topic uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academic_council_topics t
    JOIN public.academic_council_members mb
      ON mb.council_id = t.council_id
     AND mb.user_id = _user
     AND mb.is_active = true
     AND (mb.active_to IS NULL OR mb.active_to >= CURRENT_DATE)
     AND mb.member_role = 'chair'::public.academic_council_member_role
    WHERE t.id = _topic
  );
$$;

CREATE OR REPLACE FUNCTION public.council_topic_transition_is_legal(
  p_from public.academic_council_topic_status,
  p_to public.academic_council_topic_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_from = 'draft'::public.academic_council_topic_status
         AND p_to = 'submitted'::public.academic_council_topic_status THEN true
    WHEN p_from = 'submitted'::public.academic_council_topic_status
         AND p_to = 'under_review'::public.academic_council_topic_status THEN true
    WHEN p_from = 'under_review'::public.academic_council_topic_status
         AND p_to = 'needs_completion'::public.academic_council_topic_status THEN true
    WHEN p_from = 'under_review'::public.academic_council_topic_status
         AND p_to = 'accepted_for_agenda'::public.academic_council_topic_status THEN true
    WHEN p_from = 'under_review'::public.academic_council_topic_status
         AND p_to = 'rejected'::public.academic_council_topic_status THEN true
    WHEN p_from = 'needs_completion'::public.academic_council_topic_status
         AND p_to = 'submitted'::public.academic_council_topic_status THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_submit_to_council_meeting_intake(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_council_topic_prepare(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_council_topic_final(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.council_topic_transition_is_legal(
  public.academic_council_topic_status, public.academic_council_topic_status
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_submit_to_council_meeting_intake(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_review_council_topic_prepare(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_review_council_topic_final(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.council_topic_transition_is_legal(
  public.academic_council_topic_status, public.academic_council_topic_status
) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Lifecycle trigger (defense in depth under SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_enforce_council_topic_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
      RAISE EXCEPTION 'COUNCIL_TOPIC_SUBMITTED_BY_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF NEW.council_id IS DISTINCT FROM OLD.council_id THEN
      RAISE EXCEPTION 'COUNCIL_TOPIC_COUNCIL_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    -- After first submission, meeting_id is immutable.
    IF OLD.status IS DISTINCT FROM 'draft'::public.academic_council_topic_status
       AND NEW.meeting_id IS DISTINCT FROM OLD.meeting_id THEN
      RAISE EXCEPTION 'COUNCIL_TOPIC_MEETING_IMMUTABLE' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT public.council_topic_transition_is_legal(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'COUNCIL_TOPIC_INVALID_TRANSITION' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_enforce_council_topic_lifecycle() FROM PUBLIC, anon;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_actopics_lifecycle'
      AND tgrelid = 'public.academic_council_topics'::regclass
  ) THEN
    CREATE TRIGGER trg_actopics_lifecycle
      BEFORE UPDATE ON public.academic_council_topics
      FOR EACH ROW
      EXECUTE FUNCTION public.tg_enforce_council_topic_lifecycle();
  END IF;
END
$mig$;

-- ---------------------------------------------------------------------
-- 4) Replace topic RPCs (intake-aware submit + authority-split review)
-- ---------------------------------------------------------------------

-- Drop prior C0 overload (no meeting_id) then recreate intake-aware signature.
DROP FUNCTION IF EXISTS public.council_submit_topic(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.council_submit_topic(
  p_council_id uuid,
  p_meeting_id uuid,
  p_title text,
  p_body text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_id uuid;
  v_status public.academic_council_topic_status;
  v_body text;
BEGIN
  IF p_council_id IS NULL OR p_meeting_id IS NULL OR nullif(btrim(p_title), '') IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF v_meeting.council_id IS DISTINCT FROM p_council_id THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_MEETING_MISMATCH');
  END IF;

  IF NOT public.can_submit_to_council_meeting_intake(v_uid, p_meeting_id) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_INTAKE_DENIED');
  END IF;

  v_body := COALESCE(nullif(btrim(COALESCE(p_body, '')), ''), btrim(p_title));

  INSERT INTO public.academic_council_topics (
    council_id, meeting_id, title, body, category,
    submitted_by, status, submitted_at
  ) VALUES (
    p_council_id, p_meeting_id, btrim(p_title), v_body,
    nullif(btrim(COALESCE(p_category, '')), ''),
    v_uid, 'submitted'::public.academic_council_topic_status, now()
  )
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object(
    'ok', true,
    'topic_id', v_id,
    'status', v_status,
    'meeting_id', p_meeting_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.council_resubmit_topic(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_topics%ROWTYPE;
BEGIN
  IF p_topic_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_row
  FROM public.academic_council_topics
  WHERE id = p_topic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_FOUND');
  END IF;

  IF v_row.submitted_by IS DISTINCT FROM v_uid THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_OWNER_DENIED');
  END IF;

  IF v_row.status IS DISTINCT FROM 'needs_completion'::public.academic_council_topic_status THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_RESUBMITTABLE');
  END IF;

  IF v_row.meeting_id IS NULL
     OR NOT public.can_submit_to_council_meeting_intake(v_uid, v_row.meeting_id) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_INTAKE_DENIED');
  END IF;

  UPDATE public.academic_council_topics
  SET status = 'submitted'::public.academic_council_topic_status,
      submitted_at = now(),
      reviewed_by = NULL,
      review_note = NULL,
      updated_at = now()
  WHERE id = p_topic_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'topic_id', v_row.id, 'status', v_row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.council_review_topic(
  p_topic_id uuid,
  p_status public.academic_council_topic_status,
  p_review_note text DEFAULT NULL,
  p_expected_status public.academic_council_topic_status DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_topics%ROWTYPE;
  v_note text;
BEGIN
  IF p_topic_id IS NULL OR p_status IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_row
  FROM public.academic_council_topics
  WHERE id = p_topic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_FOUND');
  END IF;

  IF p_expected_status IS NOT NULL AND v_row.status IS DISTINCT FROM p_expected_status THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_STALE_STATE');
  END IF;

  IF NOT public.council_topic_transition_is_legal(v_row.status, p_status) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_INVALID_TRANSITION');
  END IF;

  -- Secretary: submitted→under_review, under_review→needs_completion
  -- Chair: those plus under_review→accepted_for_agenda|rejected
  IF p_status IN (
    'under_review'::public.academic_council_topic_status,
    'needs_completion'::public.academic_council_topic_status
  ) THEN
    IF NOT public.can_review_council_topic_prepare(v_uid, p_topic_id) THEN
      PERFORM public.council_deny('COUNCIL_TOPIC_REVIEW_DENIED');
    END IF;
  ELSIF p_status IN (
    'accepted_for_agenda'::public.academic_council_topic_status,
    'rejected'::public.academic_council_topic_status
  ) THEN
    IF NOT public.can_review_council_topic_final(v_uid, p_topic_id) THEN
      PERFORM public.council_deny('COUNCIL_TOPIC_FINAL_DENIED');
    END IF;
  ELSE
    PERFORM public.council_deny('COUNCIL_TOPIC_REVIEW_STATUS_DENIED');
  END IF;

  v_note := nullif(btrim(COALESCE(p_review_note, '')), '');
  IF p_status = 'needs_completion'::public.academic_council_topic_status
     AND v_note IS NULL THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_REVIEW_NOTE_REQUIRED');
  END IF;

  UPDATE public.academic_council_topics
  SET status = p_status,
      review_note = CASE
        WHEN p_review_note IS NULL THEN review_note
        ELSE v_note
      END,
      reviewed_by = v_uid,
      updated_at = now()
  WHERE id = p_topic_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'topic_id', v_row.id,
    'status', v_row.status,
    'reviewed_by', v_row.reviewed_by
  );
END;
$$;

-- Owner draft allowlist remains; ensure needs_completion edits cannot touch governance fields.
CREATE OR REPLACE FUNCTION public.council_update_own_topic_draft(
  p_topic_id uuid,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_topics%ROWTYPE;
BEGIN
  IF p_topic_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_row
  FROM public.academic_council_topics
  WHERE id = p_topic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_FOUND');
  END IF;

  IF v_row.submitted_by IS DISTINCT FROM v_uid THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_OWNER_DENIED');
  END IF;

  IF v_row.status NOT IN (
    'draft'::public.academic_council_topic_status,
    'needs_completion'::public.academic_council_topic_status
  ) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_EDITABLE');
  END IF;

  UPDATE public.academic_council_topics
  SET title = COALESCE(nullif(btrim(p_title), ''), title),
      body = COALESCE(nullif(btrim(p_body), ''), body),
      category = CASE
        WHEN p_category IS NULL THEN category
        ELSE nullif(btrim(p_category), '')
      END,
      updated_at = now()
  WHERE id = p_topic_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'topic_id', v_row.id,
    'status', v_row.status
  );
END;
$$;

-- Agenda add: only accepted_for_agenda topics
CREATE OR REPLACE FUNCTION public.council_add_topic_to_agenda(
  p_meeting_id uuid,
  p_topic_id uuid,
  p_order_index integer DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_topic public.academic_council_topics%ROWTYPE;
  v_order integer;
  v_id uuid;
BEGIN
  IF p_meeting_id IS NULL OR p_topic_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting
  FROM public.academic_council_meetings
  WHERE id = p_meeting_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_WRITE_DENIED');
  END IF;

  IF v_meeting.status NOT IN (
    'intake_closed'::public.academic_council_meeting_status,
    'agenda_ready'::public.academic_council_meeting_status
  ) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_MEETING_STATE_DENIED');
  END IF;

  SELECT * INTO v_topic
  FROM public.academic_council_topics
  WHERE id = p_topic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_FOUND');
  END IF;

  IF v_topic.council_id IS DISTINCT FROM v_meeting.council_id THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_MEETING_MISMATCH');
  END IF;

  IF v_topic.status IS DISTINCT FROM 'accepted_for_agenda'::public.academic_council_topic_status THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_ACCEPTED_FOR_AGENDA');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.academic_council_agenda_items ai
    WHERE ai.meeting_id = p_meeting_id AND ai.topic_id = p_topic_id
  ) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_TOPIC_ALREADY_ADDED');
  END IF;

  IF p_order_index IS NULL THEN
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
    FROM public.academic_council_agenda_items
    WHERE meeting_id = p_meeting_id;
  ELSE
    v_order := p_order_index;
  END IF;

  INSERT INTO public.academic_council_agenda_items (
    meeting_id, topic_id, title, order_index, notes, created_by, updated_by
  ) VALUES (
    p_meeting_id, p_topic_id, v_topic.title, v_order,
    nullif(btrim(COALESCE(p_notes, '')), ''), v_uid, v_uid
  )
  RETURNING id INTO v_id;

  -- Bind topic to this meeting if still unset.
  UPDATE public.academic_council_topics
  SET meeting_id = COALESCE(meeting_id, p_meeting_id),
      updated_at = now()
  WHERE id = p_topic_id;

  RETURN jsonb_build_object(
    'ok', true,
    'agenda_item_id', v_id,
    'meeting_id', p_meeting_id,
    'topic_id', p_topic_id,
    'order_index', v_order
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Privileges
-- ---------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'council_submit_topic(uuid,uuid,text,text,text)',
    'council_resubmit_topic(uuid)',
    'council_review_topic(uuid,public.academic_council_topic_status,text,public.academic_council_topic_status)',
    'council_update_own_topic_draft(uuid,text,text,text)',
    'council_add_topic_to_agenda(uuid,uuid,integer,text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- Drop obsolete C0 review signature if still present (4-arg with meeting uuid).
DROP FUNCTION IF EXISTS public.council_review_topic(
  uuid, public.academic_council_topic_status, text, uuid
);

COMMIT;
