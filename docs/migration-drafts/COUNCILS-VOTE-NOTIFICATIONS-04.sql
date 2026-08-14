-- =====================================================================
-- DRAFT ONLY — NOT APPLIED TO PRODUCTION
-- Package: COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
-- Part 2/3: Voting-cycle notifications + delayed reminder (server-side)
--
-- Events: vote_opened | vote_reminder_5m | vote_completed | vote_closed
--         | vote_result_ready
-- Privacy: no notification ever carries an individual vote direction.
-- Dedupe: DB-backed unique key, never application memory.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- A) Vote open timestamp + DB-backed dedupe key
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_council_agenda_items
  ADD COLUMN IF NOT EXISTS vote_opened_at timestamptz;

ALTER TABLE public.academic_council_notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ac_notifications_dedupe_key
  ON public.academic_council_notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- B) Vote notification emitter (own allowlist, own safe payload)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_emit_vote_notification(
  p_user_id uuid,
  p_event_type text,
  p_council_id uuid,
  p_meeting_id uuid,
  p_agenda_item_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
  v_body text;
  v_payload jsonb;
  v_dedupe text;
  v_id uuid;
BEGIN
  IF p_event_type NOT IN (
    'vote_opened', 'vote_reminder_5m', 'vote_completed', 'vote_closed', 'vote_result_ready'
  ) THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_EVENT_TYPE_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  v_title := CASE p_event_type
    WHEN 'vote_opened' THEN 'فُتح التصويت على بند'
    WHEN 'vote_reminder_5m' THEN 'تذكير: تصويتك ما زال مطلوباً'
    WHEN 'vote_completed' THEN 'اكتملت جميع الأصوات على البند'
    WHEN 'vote_closed' THEN 'أُغلق التصويت على البند'
    WHEN 'vote_result_ready' THEN 'تم البت في البند والنتيجة متاحة'
  END;

  v_body := CASE p_event_type
    WHEN 'vote_opened' THEN 'تم فتح باب التصويت على أحد بنود جدول الأعمال. يمكنك الدخول والتصويت الآن.'
    WHEN 'vote_reminder_5m' THEN 'ما زال تصويتك مطلوباً على بند مفتوح للتصويت في الجلسة الجارية.'
    WHEN 'vote_completed' THEN 'اكتملت جميع الأصوات المؤهلة على البند. يمكن الآن إغلاق التصويت واحتساب النتيجة.'
    WHEN 'vote_closed' THEN 'أُغلق التصويت على البند وجارٍ احتساب النتيجة.'
    WHEN 'vote_result_ready' THEN 'تم البت في البند والنتيجة متاحة للاطلاع.'
  END;

  -- Safe payload allowlist: progress + outcome only. No vote_value, ever.
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'agenda_item_id', to_jsonb(p_agenda_item_id),
    'agenda_title', p_payload->'agenda_title',
    'eligible', p_payload->'eligible',
    'cast', p_payload->'cast',
    'pending', p_payload->'pending',
    'outcome', p_payload->'outcome'
  ));

  v_dedupe := p_event_type || ':' || p_agenda_item_id::text || ':' || p_user_id::text;

  INSERT INTO public.academic_council_notifications (
    user_id, event_type, council_id, meeting_id, entity_type, entity_id,
    title, body, payload, dedupe_key
  ) VALUES (
    p_user_id, p_event_type, p_council_id, p_meeting_id,
    'academic_council_agenda_items', p_agenda_item_id,
    v_title, v_body, v_payload, v_dedupe
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.council_emit_vote_notification(uuid, text, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.council_emit_vote_notification(uuid, text, uuid, uuid, uuid, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------
-- C) Event fan-out by recipient rule
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_dispatch_vote_event(
  p_agenda_item_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.academic_council_agenda_items%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_eligible int;
  v_cast int;
  v_payload jsonb;
  v_uid uuid;
  v_sent int := 0;
BEGIN
  SELECT * INTO v_item FROM public.academic_council_agenda_items WHERE id = p_agenda_item_id;
  IF v_item.id IS NULL THEN RETURN 0; END IF;
  SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_item.meeting_id;

  SELECT count(*) INTO v_eligible FROM public.council_agenda_item_eligible_voters(p_agenda_item_id);
  SELECT count(*) INTO v_cast FROM public.academic_council_votes WHERE agenda_item_id = p_agenda_item_id;

  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'agenda_title', v_item.title,
    'eligible', v_eligible,
    'cast', v_cast,
    'pending', greatest(v_eligible - v_cast, 0)
  );

  FOR v_uid IN
    SELECT DISTINCT u FROM (
      -- eligible voters: opened / reminder / completed status copy
      SELECT e.user_id AS u
      FROM public.council_agenda_item_eligible_voters(p_agenda_item_id) e
      WHERE p_event_type IN ('vote_opened', 'vote_completed', 'vote_closed', 'vote_result_ready')
      UNION
      -- pending voters only, for the delayed reminder
      SELECT e.user_id
      FROM public.council_agenda_item_eligible_voters(p_agenda_item_id) e
      WHERE p_event_type = 'vote_reminder_5m'
        AND NOT EXISTS (
          SELECT 1 FROM public.academic_council_votes v
          WHERE v.agenda_item_id = p_agenda_item_id AND v.voter_user_id = e.user_id
        )
      UNION
      -- chair + secretary oversight on completion
      SELECT m.user_id
      FROM public.academic_council_members m
      WHERE p_event_type = 'vote_completed'
        AND m.council_id = v_meeting.council_id
        AND coalesce(m.is_active, true)
        AND m.member_role IN ('chair'::public.academic_council_member_role,
                              'secretary'::public.academic_council_member_role)
    ) recipients
  LOOP
    IF public.council_emit_vote_notification(
      v_uid, p_event_type, v_meeting.council_id, v_meeting.id, p_agenda_item_id, v_payload
    ) IS NOT NULL THEN
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.council_dispatch_vote_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.council_dispatch_vote_event(uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- D) open_agenda_item_vote: stamp vote_opened_at + notify eligible voters
-- ---------------------------------------------------------------------
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

  IF v_item.session_status NOT IN (
    'pending'::public.academic_council_agenda_item_session_status,
    'in_discussion'::public.academic_council_agenda_item_session_status
  ) THEN
    RAISE EXCEPTION 'COUNCIL_VOTE_OPEN_INVALID_STATE' USING ERRCODE = '22000';
  END IF;

  UPDATE public.academic_council_agenda_items
  SET session_status = 'voting_open'::public.academic_council_agenda_item_session_status,
      vote_opened_at = now(),
      updated_at = now(),
      updated_by = v_uid
  WHERE id = p_agenda_item_id;

  PERFORM public.council_attendance_emit_audit(
    v_meeting.id, v_meeting.council_id, v_uid,
    'vote_opened', 'academic_council_agenda_items', p_agenda_item_id,
    jsonb_build_object('item_id', p_agenda_item_id)
  );

  PERFORM public.council_dispatch_vote_event(p_agenda_item_id, 'vote_opened');

  RETURN jsonb_build_object('success', true, 'agenda_item_id', p_agenda_item_id, 'session_status', 'voting_open');
END;
$$;

REVOKE ALL ON FUNCTION public.open_agenda_item_vote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_agenda_item_vote(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- E) Delayed reminder sweep — service_role only, idempotent, DB-deduped
--     NOTE: this makes the system SCHEDULER-READY. It is not a guaranteed
--     background reminder until an external scheduler calls it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_dispatch_due_vote_reminders(
  p_delay interval DEFAULT interval '5 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item uuid;
  v_items int := 0;
  v_sent int := 0;
BEGIN
  FOR v_item IN
    SELECT i.id
    FROM public.academic_council_agenda_items i
    JOIN public.academic_council_meetings m ON m.id = i.meeting_id
    WHERE i.session_status = 'voting_open'::public.academic_council_agenda_item_session_status
      AND m.status = 'in_session'::public.academic_council_meeting_status
      AND i.vote_opened_at IS NOT NULL
      AND now() - i.vote_opened_at >= p_delay
  LOOP
    v_items := v_items + 1;
    v_sent := v_sent + public.council_dispatch_vote_event(v_item, 'vote_reminder_5m');
  END LOOP;

  RETURN jsonb_build_object('items_scanned', v_items, 'reminders_sent', v_sent);
END;
$$;

REVOKE ALL ON FUNCTION public.council_dispatch_due_vote_reminders(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.council_dispatch_due_vote_reminders(interval) TO service_role;

-- ---------------------------------------------------------------------
-- F) Result notification fires only AFTER a result actually exists
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_notify_vote_result_ready(p_agenda_item_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outcome text;
BEGIN
  SELECT r.outcome INTO v_outcome
  FROM public.academic_council_vote_results r
  WHERE r.agenda_item_id = p_agenda_item_id
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_outcome IS NULL THEN
    RETURN 0; -- no computed result yet: never announce a result early
  END IF;

  RETURN public.council_dispatch_vote_event(
    p_agenda_item_id, 'vote_result_ready', jsonb_build_object('outcome', to_jsonb(v_outcome))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.council_notify_vote_result_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.council_notify_vote_result_ready(uuid) TO service_role;

COMMIT;
