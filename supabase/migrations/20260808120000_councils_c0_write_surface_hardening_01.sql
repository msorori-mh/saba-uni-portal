-- =====================================================================
-- ACADEMIC-COUNCILS-C0-DIRECT-WRITE-SURFACE-HARDENING-03
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   1) Revoke authenticated direct INSERT/UPDATE/DELETE on all 8 council tables
--   2) Keep SELECT (RLS-scoped)
--   3) Convert existing write RLS policies to explicit deny-all (no policy object removal)
--   4) Remove system_admin/admin automatic academic-decision bypass from operational helpers
--   5) Expose narrow action RPCs for existing operational capabilities only
--
-- Non-goals:
--   attendance / voting / minutes / decisions lifecycle RPCs
--   production apply / deploy / publish
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard: tables must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_councils') IS NULL
     OR to_regclass('public.academic_council_members') IS NULL
     OR to_regclass('public.academic_council_meetings') IS NULL
     OR to_regclass('public.academic_council_topics') IS NULL
     OR to_regclass('public.academic_council_agenda_items') IS NULL
     OR to_regclass('public.academic_council_minutes') IS NULL
     OR to_regclass('public.academic_council_decisions') IS NULL THEN
    RAISE EXCEPTION 'councils C0 hardening requires academic council lifecycle tables';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Academic operational helpers: membership-derived authority only
--    Technical admin (system_admin/admin) retains SELECT via is_council_admin
--    and membership provisioning via can_manage_council.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_council_agenda(_user uuid, _council uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_council_role(_user, _council, 'chair'::public.academic_council_member_role)
      OR public.has_council_role(_user, _council, 'secretary'::public.academic_council_member_role);
$$;

CREATE OR REPLACE FUNCTION public.can_schedule_council_meeting(_user uuid, _council uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_council_role(
    _user,
    _council,
    'chair'::public.academic_council_member_role
  );
$$;

-- can_manage_council keeps is_council_admin for institutional membership provisioning.
CREATE OR REPLACE FUNCTION public.can_manage_council(_user uuid, _council uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_council_admin(_user)
      OR public.has_council_role(_user, _council, 'chair'::public.academic_council_member_role);
$$;

REVOKE ALL ON FUNCTION public.can_write_council_agenda(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_schedule_council_meeting(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_council(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_council_agenda(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_schedule_council_meeting(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_council(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Revoke direct client mutation grants (SELECT retained)
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_councils FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_members FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_meetings FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_topics FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_agenda_items FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_minutes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_decisions FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.academic_councils TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_members TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_meetings TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_topics TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_agenda_items TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_minutes TO authenticated, service_role;
GRANT SELECT ON TABLE public.academic_council_decisions TO authenticated, service_role;

GRANT ALL ON TABLE public.academic_councils TO service_role;
GRANT ALL ON TABLE public.academic_council_members TO service_role;
GRANT ALL ON TABLE public.academic_council_meetings TO service_role;
GRANT ALL ON TABLE public.academic_council_topics TO service_role;
GRANT ALL ON TABLE public.academic_council_agenda_items TO service_role;
GRANT ALL ON TABLE public.academic_council_minutes TO service_role;
GRANT ALL ON TABLE public.academic_council_decisions TO service_role;

-- The attachments table is an optional predecessor in some disposable harnesses
-- but is present in production.  Re-scope it when it exists.
DO $$
BEGIN
  IF to_regclass('public.academic_council_topic_attachments') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.academic_council_topic_attachments FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.academic_council_topic_attachments TO authenticated, service_role;
    GRANT ALL ON TABLE public.academic_council_topic_attachments TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2b) Write RLS: keep policy objects, convert to explicit deny-all
--     Defense in depth with table REVOKE above. Fail closed if any
--     expected predecessor write policy is absent or mistyped.
--     SELECT policies are intentionally untouched.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('academic_councils',              'councils_insert_admin',           'INSERT'),
      ('academic_councils',              'councils_update_admin_or_chair',  'UPDATE'),
      ('academic_council_members',       'council_members_insert',          'INSERT'),
      ('academic_council_members',       'council_members_update',          'UPDATE'),
      ('academic_council_meetings',      'meetings_insert',                 'INSERT'),
      ('academic_council_meetings',      'meetings_update',                 'UPDATE'),
      ('academic_council_topics',        'topics_insert_member',            'INSERT'),
      ('academic_council_topics',        'topics_update_owner_draft',       'UPDATE'),
      ('academic_council_agenda_items',  'agenda_insert',                   'INSERT'),
      ('academic_council_agenda_items',  'agenda_update',                   'UPDATE'),
      ('academic_council_minutes',       'minutes_insert_secretary',        'INSERT'),
      ('academic_council_minutes',       'minutes_update_before_lock',      'UPDATE'),
      ('academic_council_decisions',     'decisions_insert',                'INSERT'),
      ('academic_council_decisions',     'decisions_update',                'UPDATE')
    ) AS t(tablename, policyname, cmd)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = r.tablename
        AND p.policyname = r.policyname
        AND p.cmd = r.cmd
    ) THEN
      RAISE EXCEPTION
        'councils C0 hardening fail-closed: expected write policy % on public.% (cmd %) absent or unexpected identity',
        r.policyname, r.tablename, r.cmd;
    END IF;
  END LOOP;
END $$;

-- INSERT policies → WITH CHECK (false)
ALTER POLICY "councils_insert_admin"
  ON public.academic_councils
  WITH CHECK (false);

ALTER POLICY "council_members_insert"
  ON public.academic_council_members
  WITH CHECK (false);

ALTER POLICY "meetings_insert"
  ON public.academic_council_meetings
  WITH CHECK (false);

ALTER POLICY "topics_insert_member"
  ON public.academic_council_topics
  WITH CHECK (false);

ALTER POLICY "agenda_insert"
  ON public.academic_council_agenda_items
  WITH CHECK (false);

ALTER POLICY "minutes_insert_secretary"
  ON public.academic_council_minutes
  WITH CHECK (false);

ALTER POLICY "decisions_insert"
  ON public.academic_council_decisions
  WITH CHECK (false);

-- UPDATE policies → USING (false) WITH CHECK (false)
ALTER POLICY "councils_update_admin_or_chair"
  ON public.academic_councils
  USING (false)
  WITH CHECK (false);

ALTER POLICY "council_members_update"
  ON public.academic_council_members
  USING (false)
  WITH CHECK (false);

ALTER POLICY "meetings_update"
  ON public.academic_council_meetings
  USING (false)
  WITH CHECK (false);

ALTER POLICY "topics_update_owner_draft"
  ON public.academic_council_topics
  USING (false)
  WITH CHECK (false);

ALTER POLICY "agenda_update"
  ON public.academic_council_agenda_items
  USING (false)
  WITH CHECK (false);

ALTER POLICY "minutes_update_before_lock"
  ON public.academic_council_minutes
  USING (false)
  WITH CHECK (false);

ALTER POLICY "decisions_update"
  ON public.academic_council_decisions
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 3) Internal auth helper (not granted to clients)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_require_auth_uid()
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

CREATE OR REPLACE FUNCTION public.council_deny(p_code text DEFAULT 'COUNCIL_ACCESS_DENIED')
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

REVOKE ALL ON FUNCTION public.council_require_auth_uid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.council_deny(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Membership provisioning RPCs (admin OR chair)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_link_membership(
  p_council_id uuid,
  p_user_id uuid,
  p_member_role public.academic_council_member_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_existing public.academic_council_members%ROWTYPE;
  v_id uuid;
  v_reactivated boolean := false;
BEGIN
  IF p_council_id IS NULL OR p_user_id IS NULL OR p_member_role IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  IF p_member_role NOT IN (
    'chair'::public.academic_council_member_role,
    'secretary'::public.academic_council_member_role,
    'member'::public.academic_council_member_role,
    'viewer'::public.academic_council_member_role
  ) THEN
    PERFORM public.council_deny('COUNCIL_INVALID_MEMBER_ROLE');
  END IF;

  IF NOT public.can_manage_council(v_uid, p_council_id) THEN
    PERFORM public.council_deny('COUNCIL_MEMBERSHIP_DENIED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_councils c
    WHERE c.id = p_council_id AND c.is_active = true
  ) THEN
    PERFORM public.council_deny('COUNCIL_NOT_FOUND');
  END IF;

  SELECT * INTO v_existing
  FROM public.academic_council_members m
  WHERE m.council_id = p_council_id
    AND m.user_id = p_user_id
    AND m.is_active = true
    AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEMBERSHIP_ALREADY_ACTIVE');
  END IF;

  SELECT * INTO v_existing
  FROM public.academic_council_members m
  WHERE m.council_id = p_council_id
    AND m.user_id = p_user_id
    AND NOT (m.is_active = true AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE))
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.academic_council_members
    SET is_active = true,
        active_to = NULL,
        member_role = p_member_role,
        updated_by = v_uid,
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
    v_reactivated := true;
  ELSE
    INSERT INTO public.academic_council_members (
      council_id, user_id, member_role, is_active, created_by, updated_by
    ) VALUES (
      p_council_id, p_user_id, p_member_role, true, v_uid, v_uid
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_id,
    'reactivated', v_reactivated
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.council_deactivate_membership(p_membership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_members%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_row
  FROM public.academic_council_members
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEMBERSHIP_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_council(v_uid, v_row.council_id) THEN
    PERFORM public.council_deny('COUNCIL_MEMBERSHIP_DENIED');
  END IF;

  IF NOT (v_row.is_active = true AND (v_row.active_to IS NULL OR v_row.active_to > CURRENT_DATE)) THEN
    PERFORM public.council_deny('COUNCIL_MEMBERSHIP_ALREADY_INACTIVE');
  END IF;

  UPDATE public.academic_council_members
  SET is_active = false,
      active_to = CURRENT_DATE,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_membership_id;

  RETURN jsonb_build_object('ok', true, 'membership_id', p_membership_id);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Meeting schedule / metadata RPCs (chair membership only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_schedule_meeting(
  p_council_id uuid,
  p_title text,
  p_scheduled_at timestamptz,
  p_location text DEFAULT NULL,
  p_intake_opens_at timestamptz DEFAULT NULL,
  p_intake_closes_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_number integer;
  v_id uuid;
  v_status public.academic_council_meeting_status;
BEGIN
  IF p_council_id IS NULL OR p_scheduled_at IS NULL OR nullif(btrim(p_title), '') IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  IF NOT public.can_schedule_council_meeting(v_uid, p_council_id) THEN
    PERFORM public.council_deny('COUNCIL_SCHEDULE_DENIED');
  END IF;

  SELECT COALESCE(MAX(m.meeting_number), 0) + 1
  INTO v_number
  FROM public.academic_council_meetings m
  WHERE m.council_id = p_council_id;

  INSERT INTO public.academic_council_meetings (
    council_id, title, scheduled_at, location,
    intake_opens_at, intake_closes_at, notes,
    meeting_number, status, created_by, updated_by
  ) VALUES (
    p_council_id, btrim(p_title), p_scheduled_at, nullif(btrim(COALESCE(p_location, '')), ''),
    p_intake_opens_at, p_intake_closes_at, nullif(btrim(COALESCE(p_notes, '')), ''),
    v_number, 'scheduled'::public.academic_council_meeting_status, v_uid, v_uid
  )
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', v_id,
    'meeting_number', v_number,
    'status', v_status
  );
END;
$$;

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

  -- Disallow academic advancement statuses here; finalize RPC owns agenda_ready.
  IF p_status IS NOT NULL AND p_status IN (
    'agenda_ready'::public.academic_council_meeting_status,
    'in_session'::public.academic_council_meeting_status,
    'minutes_draft'::public.academic_council_meeting_status,
    'minutes_locked'::public.academic_council_meeting_status,
    'archived'::public.academic_council_meeting_status
  ) THEN
    PERFORM public.council_deny('COUNCIL_MEETING_ADVANCE_DENIED');
  END IF;

  UPDATE public.academic_council_meetings
  SET title = COALESCE(nullif(btrim(p_title), ''), title),
      scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
      location = CASE WHEN p_location IS NULL THEN location ELSE nullif(btrim(p_location), '') END,
      intake_opens_at = COALESCE(p_intake_opens_at, intake_opens_at),
      intake_closes_at = COALESCE(p_intake_closes_at, intake_closes_at),
      notes = CASE WHEN p_notes IS NULL THEN notes ELSE nullif(btrim(p_notes), '') END,
      status = COALESCE(p_status, status),
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
-- 6) Topic submit / own-draft update / review
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_submit_topic(
  p_council_id uuid,
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
  v_id uuid;
  v_status public.academic_council_topic_status;
  v_body text;
BEGIN
  IF p_council_id IS NULL OR nullif(btrim(p_title), '') IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  IF NOT public.can_submit_council_topic(v_uid, p_council_id) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_SUBMIT_DENIED');
  END IF;

  v_body := COALESCE(nullif(btrim(COALESCE(p_body, '')), ''), btrim(p_title));

  INSERT INTO public.academic_council_topics (
    council_id, title, body, category,
    submitted_by, status, submitted_at, meeting_id
  ) VALUES (
    p_council_id, btrim(p_title), v_body, nullif(btrim(COALESCE(p_category, '')), ''),
    v_uid, 'submitted'::public.academic_council_topic_status, now(), NULL
  )
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object('ok', true, 'topic_id', v_id, 'status', v_status);
END;
$$;

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

  -- Allowlist only: title / body / category. Ownership + governance fields are immutable here.
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

CREATE OR REPLACE FUNCTION public.council_review_topic(
  p_topic_id uuid,
  p_status public.academic_council_topic_status,
  p_review_note text DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_topics%ROWTYPE;
  v_meeting_council uuid;
BEGIN
  IF p_topic_id IS NULL OR p_status IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  IF p_status NOT IN (
    'under_review'::public.academic_council_topic_status,
    'needs_completion'::public.academic_council_topic_status,
    'accepted_for_agenda'::public.academic_council_topic_status,
    'deferred'::public.academic_council_topic_status,
    'rejected'::public.academic_council_topic_status
  ) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_REVIEW_STATUS_DENIED');
  END IF;

  SELECT * INTO v_row
  FROM public.academic_council_topics
  WHERE id = p_topic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_FOUND');
  END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_row.council_id) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_REVIEW_DENIED');
  END IF;

  IF p_meeting_id IS NOT NULL THEN
    SELECT mt.council_id INTO v_meeting_council
    FROM public.academic_council_meetings mt
    WHERE mt.id = p_meeting_id;
    IF v_meeting_council IS NULL OR v_meeting_council IS DISTINCT FROM v_row.council_id THEN
      PERFORM public.council_deny('COUNCIL_TOPIC_MEETING_MISMATCH');
    END IF;
  END IF;

  UPDATE public.academic_council_topics
  SET status = p_status,
      review_note = CASE
        WHEN p_review_note IS NULL THEN review_note
        ELSE nullif(btrim(p_review_note), '')
      END,
      reviewed_by = CASE
        WHEN p_review_note IS NULL THEN reviewed_by
        ELSE v_uid
      END,
      meeting_id = CASE
        WHEN p_status = 'accepted_for_agenda'::public.academic_council_topic_status
             AND p_meeting_id IS NOT NULL THEN p_meeting_id
        ELSE meeting_id
      END,
      -- Immutable ownership fields intentionally not assigned:
      -- council_id, submitted_by remain unchanged.
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

-- ---------------------------------------------------------------------
-- 7) Agenda curation RPCs (chair/secretary membership)
-- ---------------------------------------------------------------------
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

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_DENIED');
  END IF;

  SELECT * INTO v_topic FROM public.academic_council_topics WHERE id = p_topic_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_FOUND');
  END IF;

  IF v_topic.council_id IS DISTINCT FROM v_meeting.council_id THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_MEETING_MISMATCH');
  END IF;

  IF v_topic.status IS DISTINCT FROM 'accepted_for_agenda'::public.academic_council_topic_status THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_NOT_ACCEPTED');
  END IF;

  IF v_topic.meeting_id IS NOT NULL AND v_topic.meeting_id IS DISTINCT FROM p_meeting_id THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_MEETING_MISMATCH');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.academic_council_agenda_items a
    WHERE a.meeting_id = p_meeting_id AND a.topic_id = p_topic_id
  ) THEN
    PERFORM public.council_deny('COUNCIL_TOPIC_ALREADY_ON_AGENDA');
  END IF;

  v_order := COALESCE(
    p_order_index,
    (SELECT COALESCE(MAX(a.order_index), 0) + 1
     FROM public.academic_council_agenda_items a
     WHERE a.meeting_id = p_meeting_id)
  );

  INSERT INTO public.academic_council_agenda_items (
    meeting_id, topic_id, title, order_index, notes, created_by, updated_by
  ) VALUES (
    p_meeting_id, p_topic_id, v_topic.title, v_order,
    nullif(btrim(COALESCE(p_notes, '')), ''), v_uid, v_uid
  )
  RETURNING id INTO v_id;

  IF v_topic.meeting_id IS NULL THEN
    UPDATE public.academic_council_topics
    SET meeting_id = p_meeting_id, updated_at = now()
    WHERE id = p_topic_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'agenda_item_id', v_id, 'order_index', v_order);
END;
$$;

CREATE OR REPLACE FUNCTION public.council_add_manual_agenda_item(
  p_meeting_id uuid,
  p_title text,
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
  v_order integer;
  v_id uuid;
BEGIN
  IF p_meeting_id IS NULL OR nullif(btrim(p_title), '') IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_DENIED');
  END IF;

  v_order := COALESCE(
    p_order_index,
    (SELECT COALESCE(MAX(a.order_index), 0) + 1
     FROM public.academic_council_agenda_items a
     WHERE a.meeting_id = p_meeting_id)
  );

  INSERT INTO public.academic_council_agenda_items (
    meeting_id, topic_id, title, order_index, notes, created_by, updated_by
  ) VALUES (
    p_meeting_id, NULL, btrim(p_title), v_order,
    nullif(btrim(COALESCE(p_notes, '')), ''), v_uid, v_uid
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'agenda_item_id', v_id, 'order_index', v_order);
END;
$$;

CREATE OR REPLACE FUNCTION public.council_update_agenda_item(
  p_agenda_item_id uuid,
  p_title text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_order_index integer DEFAULT NULL,
  p_is_approved boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_row public.academic_council_agenda_items%ROWTYPE;
  v_council uuid;
BEGIN
  IF p_agenda_item_id IS NULL THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT a.* INTO v_row
  FROM public.academic_council_agenda_items a
  WHERE a.id = p_agenda_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_ITEM_NOT_FOUND');
  END IF;

  SELECT mt.council_id INTO v_council
  FROM public.academic_council_meetings mt
  WHERE mt.id = v_row.meeting_id;

  IF v_council IS NULL OR NOT public.can_write_council_agenda(v_uid, v_council) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_DENIED');
  END IF;

  UPDATE public.academic_council_agenda_items
  SET title = COALESCE(nullif(btrim(p_title), ''), title),
      notes = CASE WHEN p_notes IS NULL THEN notes ELSE nullif(btrim(p_notes), '') END,
      order_index = COALESCE(p_order_index, order_index),
      is_approved = COALESCE(p_is_approved, is_approved),
      approved_by = CASE
        WHEN p_is_approved IS TRUE THEN v_uid
        WHEN p_is_approved IS FALSE THEN NULL
        ELSE approved_by
      END,
      approved_at = CASE
        WHEN p_is_approved IS TRUE THEN now()
        WHEN p_is_approved IS FALSE THEN NULL
        ELSE approved_at
      END,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_agenda_item_id
  RETURNING id INTO v_row.id;

  RETURN jsonb_build_object('ok', true, 'agenda_item_id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.council_reorder_agenda_items(
  p_meeting_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_require_auth_uid();
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_count integer;
  v_input_count integer;
  v_dup integer;
  r record;
  i integer := 0;
BEGIN
  IF p_meeting_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    PERFORM public.council_deny('COUNCIL_INVALID_ARGS');
  END IF;

  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    PERFORM public.council_deny('COUNCIL_MEETING_NOT_FOUND');
  END IF;

  IF NOT public.can_write_council_agenda(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_DENIED');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.academic_council_agenda_items a
  WHERE a.meeting_id = p_meeting_id;

  SELECT COUNT(*) INTO v_input_count FROM jsonb_array_elements(p_items);
  IF v_count <> v_input_count OR v_input_count < 1 THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_REORDER_DENIED');
  END IF;

  SELECT COUNT(*) INTO v_dup
  FROM (
    SELECT (elem->>'agenda_item_id')::uuid AS id
    FROM jsonb_array_elements(p_items) elem
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.academic_council_agenda_items a
    WHERE a.id = s.id AND a.meeting_id = p_meeting_id
  );
  IF v_dup > 0 THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_REORDER_DENIED');
  END IF;

  SELECT COUNT(*) - COUNT(DISTINCT (elem->>'order_index')::integer) INTO v_dup
  FROM jsonb_array_elements(p_items) elem;
  IF v_dup <> 0 THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_REORDER_DENIED');
  END IF;

  FOR r IN
    SELECT (elem->>'agenda_item_id')::uuid AS agenda_item_id
    FROM jsonb_array_elements(p_items) elem
  LOOP
    i := i + 1;
    UPDATE public.academic_council_agenda_items
    SET order_index = 100000 + i,
        updated_by = v_uid,
        updated_at = now()
    WHERE id = r.agenda_item_id AND meeting_id = p_meeting_id;
  END LOOP;

  FOR r IN
    SELECT
      (elem->>'agenda_item_id')::uuid AS agenda_item_id,
      (elem->>'order_index')::integer AS order_index
    FROM jsonb_array_elements(p_items) elem
  LOOP
    UPDATE public.academic_council_agenda_items
    SET order_index = r.order_index,
        updated_by = v_uid,
        updated_at = now()
    WHERE id = r.agenda_item_id AND meeting_id = p_meeting_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', p_meeting_id,
    'updated_count', v_input_count
  );
END;
$$;

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

  -- Academic advancement: chair membership only (no system_admin/admin bypass).
  IF NOT public.can_schedule_council_meeting(v_uid, v_meeting.council_id) THEN
    PERFORM public.council_deny('COUNCIL_AGENDA_FINALIZE_DENIED');
  END IF;

  UPDATE public.academic_council_agenda_items
  SET is_approved = true,
      approved_by = v_uid,
      approved_at = now(),
      updated_by = v_uid,
      updated_at = now()
  WHERE meeting_id = p_meeting_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.academic_council_meetings
  SET status = 'agenda_ready'::public.academic_council_meeting_status,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = p_meeting_id;

  RETURN jsonb_build_object(
    'ok', true,
    'meeting_id', p_meeting_id,
    'status', 'agenda_ready',
    'approved_items_count', v_count
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 8) RPC privileges
-- ---------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'council_link_membership(uuid,uuid,public.academic_council_member_role)',
    'council_deactivate_membership(uuid)',
    'council_schedule_meeting(uuid,text,timestamptz,text,timestamptz,timestamptz,text)',
    'council_update_meeting_metadata(uuid,text,timestamptz,text,timestamptz,timestamptz,text,public.academic_council_meeting_status)',
    'council_submit_topic(uuid,text,text,text)',
    'council_update_own_topic_draft(uuid,text,text,text)',
    'council_review_topic(uuid,public.academic_council_topic_status,text,uuid)',
    'council_add_topic_to_agenda(uuid,uuid,integer,text)',
    'council_add_manual_agenda_item(uuid,text,integer,text)',
    'council_update_agenda_item(uuid,text,text,integer,boolean)',
    'council_reorder_agenda_items(uuid,jsonb)',
    'council_finalize_meeting_agenda(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

COMMIT;
