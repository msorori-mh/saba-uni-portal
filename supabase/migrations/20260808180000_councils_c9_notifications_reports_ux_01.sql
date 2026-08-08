-- =====================================================================
-- ACADEMIC-COUNCILS-C9-NOTIFICATIONS-REPORTS-UX-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   Council-specific in-app notification foundation with event/outbox
--   architecture compatible with later email integration.
--   Server-side recipient eligibility derivation, no cross-council leaks,
--   historical PII exposure controls.
--   Report-ready read-model helpers built on top of C7 read models.
--   Dashboard RPCs for chair, secretary, member, and admin views.
--   No email/SMS provider integration.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard: C7 audit/archive must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_audit_events') IS NULL THEN
    RAISE EXCEPTION 'C9 notifications and operational UX requires C7 audit/archive foundation';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Notification event types
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'academic_council_notification_event'
  ) THEN
    CREATE TYPE public.academic_council_notification_event AS ENUM (
      'meeting_scheduled',
      'intake_opened',
      'intake_closing',
      'intake_closed',
      'topic_submitted',
      'topic_needs_completion',
      'topic_accepted',
      'topic_rejected',
      'agenda_ready',
      'attendance_recording_required',
      'meeting_session_ready',
      'decision_assigned',
      'decision_approaching_due',
      'decision_overdue',
      'meeting_archived'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) In-app notifications table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  council_id      uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES public.academic_council_meetings(id) ON DELETE CASCADE,
  event_type      public.academic_council_notification_event NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  title           text NOT NULL,
  body            text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read         boolean NOT NULL DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acn_user_created
  ON public.academic_council_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acn_user_unread
  ON public.academic_council_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_acn_council_event
  ON public.academic_council_notifications(council_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acn_entity
  ON public.academic_council_notifications(entity_type, entity_id, created_at DESC);

ALTER TABLE public.academic_council_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academic_council_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.academic_council_notifications TO authenticated;
GRANT ALL ON TABLE public.academic_council_notifications TO service_role;

DROP POLICY IF EXISTS "ac_notifications_select_own" ON public.academic_council_notifications;
CREATE POLICY "ac_notifications_select_own"
  ON public.academic_council_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ac_notifications_update_own_read" ON public.academic_council_notifications;
CREATE POLICY "ac_notifications_update_own_read"
  ON public.academic_council_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3) Notification outbox (event-driven, email-ready)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  event_type      public.academic_council_notification_event NOT NULL,
  council_id      uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES public.academic_council_meetings(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  entity_id       uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error           text
);

CREATE INDEX IF NOT EXISTS idx_acno_unprocessed
  ON public.academic_council_notification_outbox(processed_at, created_at)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acno_council_event
  ON public.academic_council_notification_outbox(council_id, event_type, created_at DESC);

ALTER TABLE public.academic_council_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academic_council_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.academic_council_notification_outbox TO service_role;

DROP POLICY IF EXISTS "ac_notification_outbox_service_only" ON public.academic_council_notification_outbox;
CREATE POLICY "ac_notification_outbox_service_only"
  ON public.academic_council_notification_outbox
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 4) Notification helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_notification_auth_uid()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, auth.uid());
$$;

-- Build safe Arabic message metadata. Never includes raw RPC/SQL errors or
-- newly inaccessible PII. Attachments/due dates are only included when the
-- recipient still has council access.
CREATE OR REPLACE FUNCTION public.build_council_notification_message(
  p_event public.academic_council_notification_event,
  p_council_name text,
  p_meeting_title text DEFAULT NULL,
  p_topic_title text DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_title text;
  v_body text;
BEGIN
  CASE p_event
    WHEN 'meeting_scheduled' THEN
      v_title := 'اجتماع مجلس جديد';
      v_body := format('تم جدولة اجتماع %s لـ %s%s.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'),
                       CASE WHEN p_extra ? 'scheduled_at'
                            THEN ' بتاريخ ' || (p_extra->>'scheduled_at')
                            ELSE '' END);
    WHEN 'intake_opened' THEN
      v_title := 'فتح استقبال الموضوعات';
      v_body := format('فُتح استقبال الموضوعات للاجتماع %s في %s.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'intake_closing' THEN
      v_title := 'استقبال الموضوعات على وشك الإغلاق';
      v_body := format('يُغلق استقبال الموضوعات للاجتماع %s في %s قريباً.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'intake_closed' THEN
      v_title := 'إغلاق استقبال الموضوعات';
      v_body := format('أُغلق استقبال الموضوعات للاجتماع %s في %s.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'topic_submitted' THEN
      v_title := 'موضوع جديد مقدّم';
      v_body := format('قُدّم الموضوع "%s" إلى %s%s.',
                       coalesce(p_topic_title, '—'),
                       coalesce(p_council_name, '—'),
                       CASE WHEN p_actor_name IS NOT NULL
                            THEN ' بواسطة ' || p_actor_name ELSE '' END);
    WHEN 'topic_needs_completion' THEN
      v_title := 'موضوع يحتاج استكمالاً';
      v_body := format('الموضوع "%s" في %s يحتاج إلى استكمال قبل المراجعة.',
                       coalesce(p_topic_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'topic_accepted' THEN
      v_title := 'قبول موضوع في جدول الأعمال';
      v_body := format('قُبل الموضوع "%s" ووُضع في جدول أعمال %s.',
                       coalesce(p_topic_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'topic_rejected' THEN
      v_title := 'رفض موضوع';
      v_body := format('رُفض الموضوع "%s" في %s.',
                       coalesce(p_topic_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'agenda_ready' THEN
      v_title := 'جدول الأعمال جاهز';
      v_body := format('أصبح جدول أعمال الاجتماع %s في %s جاهزاً للاعتماد.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'attendance_recording_required' THEN
      v_title := 'تسجيل الحضور مطلوب';
      v_body := format('اجتماع %s في %s يحتاج إلى تسجيل الحضور.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'meeting_session_ready' THEN
      v_title := 'الجلسة جاهزة';
      v_body := format('الاجتماع %s في %s جاهز لبدء الجلسة والتصويت.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    WHEN 'decision_assigned' THEN
      v_title := 'قرار موجّه إليك';
      v_body := format('تم توجيه قرار من %s إليك%s.',
                       coalesce(p_council_name, '—'),
                       CASE WHEN p_extra ? 'due_date'
                            THEN '، تاريخ الاستحقاق ' || (p_extra->>'due_date')
                            ELSE '' END);
    WHEN 'decision_approaching_due' THEN
      v_title := 'قرار على وشك استحقاقه';
      v_body := format('قرار في %s يقترب تاريخ استحقاقه%s.',
                       coalesce(p_council_name, '—'),
                       CASE WHEN p_extra ? 'due_date'
                            THEN ' (' || (p_extra->>'due_date') || ')'
                            ELSE '' END);
    WHEN 'decision_overdue' THEN
      v_title := 'قرار متأخر';
      v_body := format('قرار في %s تجاوز تاريخ استحقاقه%s.',
                       coalesce(p_council_name, '—'),
                       CASE WHEN p_extra ? 'due_date'
                            THEN ' (' || (p_extra->>'due_date') || ')'
                            ELSE '' END);
    WHEN 'meeting_archived' THEN
      v_title := 'أرشفة اجتماع';
      v_body := format('أُرشف الاجتماع %s في %s.',
                       coalesce(p_meeting_title, '—'),
                       coalesce(p_council_name, '—'));
    ELSE
      v_title := 'إشعار مجلس أكاديمي';
      v_body := 'حدث جديد في أحد المجالس الأكاديمية.';
  END CASE;

  RETURN jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'event_type', p_event,
    'council_name', p_council_name,
    'meeting_title', p_meeting_title,
    'topic_title', p_topic_title,
    'actor_name', p_actor_name,
    'extra', p_extra
  );
END;
$$;

-- Derive recipient users server-side. No cross-council leaks.
CREATE OR REPLACE FUNCTION public.get_council_notification_recipients(
  p_council_id uuid,
  p_event public.academic_council_notification_event,
  p_target_user_id uuid DEFAULT NULL,
  p_target_roles public.academic_council_member_role[] DEFAULT NULL
)
RETURNS TABLE(user_id uuid, member_role public.academic_council_member_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.user_id, m.member_role
  FROM public.academic_council_members m
  WHERE m.council_id = p_council_id
    AND m.is_active = true
    AND (m.active_to IS NULL OR m.active_to > CURRENT_DATE)
    AND (p_target_user_id IS NULL OR m.user_id = p_target_user_id)
    AND (p_target_roles IS NULL OR m.member_role = ANY(p_target_roles));
$$;

-- Core insert helper.
CREATE OR REPLACE FUNCTION public.create_council_notification(
  p_user_id uuid,
  p_council_id uuid,
  p_event public.academic_council_notification_event,
  p_entity_type text,
  p_entity_id uuid,
  p_meeting_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.academic_council_notifications (
    user_id, council_id, meeting_id, event_type, entity_type, entity_id,
    title, body, metadata
  ) VALUES (
    p_user_id, p_council_id, p_meeting_id, p_event, p_entity_type, p_entity_id,
    coalesce(p_title, 'إشعار مجلس أكاديمي'),
    coalesce(p_body, 'حدث جديد في أحد المجالس الأكاديمية.'),
    p_metadata
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Outbox enqueue helper.
CREATE OR REPLACE FUNCTION public.enqueue_council_notification(
  p_event public.academic_council_notification_event,
  p_council_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_meeting_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.academic_council_notification_outbox (
    event_type, council_id, meeting_id, entity_type, entity_id, payload
  ) VALUES (
    p_event, p_council_id, p_meeting_id, p_entity_type, p_entity_id, p_payload
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Process a single outbox row into per-recipient notifications.
CREATE OR REPLACE FUNCTION public.process_council_notification_outbox(
  p_outbox_id uuid DEFAULT NULL,
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.academic_council_notification_outbox%ROWTYPE;
  v_council public.academic_councils%ROWTYPE;
  v_meeting public.academic_council_meetings%ROWTYPE;
  v_topic public.academic_council_topics%ROWTYPE;
  v_actor_name text;
  v_msg jsonb;
  v_rec record;
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_target_user uuid;
  v_target_roles public.academic_council_member_role[];
  v_processed integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.academic_council_notification_outbox
    WHERE processed_at IS NULL
      AND (p_outbox_id IS NULL OR id = p_outbox_id)
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_council FROM public.academic_councils WHERE id = v_row.council_id;
    SELECT * INTO v_meeting FROM public.academic_council_meetings WHERE id = v_row.meeting_id;
    SELECT * INTO v_topic FROM public.academic_council_topics WHERE id = v_row.entity_id;

    v_target_user := NULL;
    v_target_roles := NULL;

    IF v_row.event_type = 'decision_assigned' THEN
      v_target_user := (v_row.payload->>'responsible_user_id')::uuid;
    ELSIF v_row.event_type IN ('topic_submitted', 'topic_needs_completion', 'topic_accepted', 'topic_rejected') THEN
      v_target_roles := ARRAY['chair', 'secretary']::public.academic_council_member_role[];
    ELSIF v_row.event_type IN ('meeting_scheduled', 'intake_opened', 'intake_closing', 'intake_closed', 'agenda_ready',
                                'attendance_recording_required', 'meeting_session_ready', 'meeting_archived') THEN
      v_target_roles := ARRAY['chair', 'secretary', 'member', 'vice_chair']::public.academic_council_member_role[];
    ELSIF v_row.event_type IN ('decision_approaching_due', 'decision_overdue') THEN
      v_target_user := (v_row.payload->>'responsible_user_id')::uuid;
    END IF;

    v_msg := public.build_council_notification_message(
      v_row.event_type,
      v_council.name,
      v_meeting.title,
      v_topic.title,
      v_actor_name,
      v_row.payload
    );

    FOR v_rec IN
      SELECT * FROM public.get_council_notification_recipients(
        v_row.council_id, v_row.event_type, v_target_user, v_target_roles
      )
    LOOP
      v_created_ids := array_append(v_created_ids, public.create_council_notification(
        v_rec.user_id,
        v_row.council_id,
        v_row.event_type,
        v_row.entity_type,
        v_row.entity_id,
        v_row.meeting_id,
        v_msg->>'title',
        v_msg->>'body',
        jsonb_build_object(
          'outbox_id', v_row.id,
          'recipient_role', v_rec.member_role,
          'event_meta', v_row.payload
        )
      ));
    END LOOP;

    UPDATE public.academic_council_notification_outbox
    SET processed_at = now()
    WHERE id = v_row.id;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'notification_ids', v_created_ids);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Triggers that enqueue notification events
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ac_meeting_notification_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_council_notification(
      'meeting_scheduled', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
      jsonb_build_object('scheduled_at', NEW.scheduled_at, 'location', NEW.location)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'intake_open' THEN
        PERFORM public.enqueue_council_notification(
          'intake_opened', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
          jsonb_build_object('intake_opens_at', NEW.intake_opens_at, 'intake_closes_at', NEW.intake_closes_at)
        );
      ELSIF OLD.status = 'intake_open' AND NEW.status = 'intake_closed' THEN
        PERFORM public.enqueue_council_notification(
          'intake_closed', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
          jsonb_build_object('intake_closes_at', NEW.intake_closes_at)
        );
      ELSIF NEW.status = 'agenda_ready' THEN
        PERFORM public.enqueue_council_notification(
          'agenda_ready', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
          '{}'::jsonb
        );
      ELSIF NEW.status = 'in_session' THEN
        PERFORM public.enqueue_council_notification(
          'meeting_session_ready', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
          '{}'::jsonb
        );
      ELSIF NEW.status = 'archived' THEN
        PERFORM public.enqueue_council_notification(
          'meeting_archived', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
          jsonb_build_object('archived_at', NEW.updated_at)
        );
      END IF;
    END IF;

    IF OLD.intake_closes_at IS DISTINCT FROM NEW.intake_closes_at
       AND NEW.status = 'intake_open'
       AND NEW.intake_closes_at IS NOT NULL
       AND NEW.intake_closes_at <= now() + interval '24 hours' THEN
      PERFORM public.enqueue_council_notification(
        'intake_closing', NEW.council_id, 'academic_council_meetings', NEW.id, NEW.id,
        jsonb_build_object('intake_closes_at', NEW.intake_closes_at)
      );
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_meeting_notifications ON public.academic_council_meetings;
CREATE TRIGGER trg_ac_meeting_notifications
  AFTER INSERT OR UPDATE ON public.academic_council_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_meeting_notification_events();

CREATE OR REPLACE FUNCTION public.tg_ac_topic_notification_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.academic_council_notification_event;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'submitted' THEN
    v_event := 'topic_submitted';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'needs_completion' THEN
      v_event := 'topic_needs_completion';
    ELSIF NEW.status = 'accepted_for_agenda' THEN
      v_event := 'topic_accepted';
    ELSIF NEW.status = 'rejected' THEN
      v_event := 'topic_rejected';
    END IF;
  END IF;

  IF v_event IS NOT NULL THEN
    PERFORM public.enqueue_council_notification(
      v_event, NEW.council_id, 'academic_council_topics', NEW.id, NEW.meeting_id,
      jsonb_build_object(
        'submitted_by', NEW.submitted_by,
        'reviewed_by', NEW.reviewed_by,
        'review_note', NEW.review_note
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_topic_notifications ON public.academic_council_topics;
CREATE TRIGGER trg_ac_topic_notifications
  AFTER INSERT OR UPDATE ON public.academic_council_topics
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_topic_notification_events();

CREATE OR REPLACE FUNCTION public.tg_ac_agenda_notification_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_council_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_approved IS DISTINCT FROM NEW.is_approved AND NEW.is_approved = true THEN
    SELECT council_id INTO v_council_id
    FROM public.academic_council_meetings WHERE id = NEW.meeting_id;
    PERFORM public.enqueue_council_notification(
      'agenda_ready', v_council_id, 'academic_council_agenda_items', NEW.id, NEW.meeting_id,
      jsonb_build_object('order_index', NEW.order_index)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_agenda_notifications ON public.academic_council_agenda_items;
CREATE TRIGGER trg_ac_agenda_notifications
  AFTER UPDATE ON public.academic_council_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_agenda_notification_events();

CREATE OR REPLACE FUNCTION public.tg_ac_attendance_roll_notification_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_council_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT council_id INTO v_council_id
    FROM public.academic_council_meetings WHERE id = NEW.meeting_id;
    PERFORM public.enqueue_council_notification(
      'attendance_recording_required', v_council_id, 'academic_council_meeting_attendance_rolls', NEW.id, NEW.meeting_id,
      jsonb_build_object('roll_id', NEW.id)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_attendance_roll_notifications ON public.academic_council_meeting_attendance_rolls;
CREATE TRIGGER trg_ac_attendance_roll_notifications
  AFTER INSERT ON public.academic_council_meeting_attendance_rolls
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_attendance_roll_notification_events();

CREATE OR REPLACE FUNCTION public.tg_ac_decision_notification_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_council_id uuid;
BEGIN
  SELECT council_id INTO v_council_id
  FROM public.academic_council_meetings WHERE id = NEW.meeting_id;

  IF TG_OP = 'INSERT' AND NEW.responsible_user_id IS NOT NULL THEN
    PERFORM public.enqueue_council_notification(
      'decision_assigned', v_council_id, 'academic_council_decisions', NEW.id, NEW.meeting_id,
      jsonb_build_object(
        'responsible_user_id', NEW.responsible_user_id,
        'due_date', NEW.due_date,
        'canonical_decision_number', NEW.canonical_decision_number
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.responsible_user_id IS DISTINCT FROM NEW.responsible_user_id
        AND NEW.responsible_user_id IS NOT NULL THEN
    PERFORM public.enqueue_council_notification(
      'decision_assigned', v_council_id, 'academic_council_decisions', NEW.id, NEW.meeting_id,
      jsonb_build_object(
        'responsible_user_id', NEW.responsible_user_id,
        'due_date', NEW.due_date,
        'canonical_decision_number', NEW.canonical_decision_number
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_decision_notifications ON public.academic_council_decisions;
CREATE TRIGGER trg_ac_decision_notifications
  AFTER INSERT OR UPDATE ON public.academic_council_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_decision_notification_events();

-- ---------------------------------------------------------------------
-- 6) RPCs for notifications
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_council_notifications(
  p_unread_only boolean DEFAULT false,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
  v_list jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'notification_id', n.id,
    'event_type', n.event_type,
    'council_id', n.council_id,
    'meeting_id', n.meeting_id,
    'entity_type', n.entity_type,
    'entity_id', n.entity_id,
    'title', n.title,
    'body', n.body,
    'metadata', n.metadata,
    'is_read', n.is_read,
    'created_at', n.created_at,
    'read_at', n.read_at
  ) ORDER BY n.created_at DESC), '[]'::jsonb) INTO v_list
  FROM public.academic_council_notifications n
  WHERE n.user_id = v_uid
    AND (NOT p_unread_only OR n.is_read = false)
  LIMIT p_limit;

  RETURN jsonb_build_object(
    'notifications', v_list,
    'unread_count', (
      SELECT count(*) FROM public.academic_council_notifications
      WHERE user_id = v_uid AND is_read = false
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_council_notification_read(
  p_notification_id uuid,
  p_is_read boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
  v_updated integer;
BEGIN
  UPDATE public.academic_council_notifications
  SET is_read = p_is_read,
      read_at = CASE WHEN p_is_read THEN now() ELSE NULL END
  WHERE id = p_notification_id AND user_id = v_uid;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_NOT_FOUND_OR_ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'is_read', p_is_read);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_council_decision_due_dates(
  p_approach_days integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.academic_council_decisions%ROWTYPE;
  v_council_id uuid;
  v_event public.academic_council_notification_event;
  v_due date;
BEGIN
  FOR v_row IN
    SELECT d.*
    FROM public.academic_council_decisions d
    JOIN public.academic_council_meetings m ON m.id = d.meeting_id
    WHERE d.status <> 'completed'
      AND d.due_date IS NOT NULL
  LOOP
    SELECT council_id INTO v_council_id FROM public.academic_council_meetings WHERE id = v_row.meeting_id;
    v_due := v_row.due_date;

    IF v_due < CURRENT_DATE THEN
      v_event := 'decision_overdue';
    ELSIF v_due <= CURRENT_DATE + p_approach_days THEN
      v_event := 'decision_approaching_due';
    ELSE
      CONTINUE;
    END IF;

    PERFORM public.enqueue_council_notification(
      v_event, v_council_id, 'academic_council_decisions', v_row.id, v_row.meeting_id,
      jsonb_build_object(
        'responsible_user_id', v_row.responsible_user_id,
        'due_date', v_row.due_date,
        'canonical_decision_number', v_row.canonical_decision_number,
        'days_until_due', v_due - CURRENT_DATE
      )
    );
  END LOOP;

  RETURN public.process_council_notification_outbox(NULL, 1000);
END;
$$;

-- ---------------------------------------------------------------------
-- 7) Report helpers (built on C7 read models)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_council_report_meeting_summary(
  p_council_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'period_from', p_from,
    'period_to', p_to,
    'total_meetings', (
      SELECT count(*) FROM public.academic_council_meetings
      WHERE council_id = p_council_id
        AND (p_from IS NULL OR scheduled_at >= p_from)
        AND (p_to IS NULL OR scheduled_at <= p_to)
    ),
    'by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, count(*) AS cnt
        FROM public.academic_council_meetings
        WHERE council_id = p_council_id
          AND (p_from IS NULL OR scheduled_at >= p_from)
          AND (p_to IS NULL OR scheduled_at <= p_to)
        GROUP BY status
      ) s
    ),
    'meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', id,
        'meeting_number', meeting_number,
        'title', title,
        'scheduled_at', scheduled_at,
        'status', status
      ) ORDER BY scheduled_at DESC), '[]'::jsonb)
      FROM public.academic_council_meetings
      WHERE council_id = p_council_id
        AND (p_from IS NULL OR scheduled_at >= p_from)
        AND (p_to IS NULL OR scheduled_at <= p_to)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_attendance_rate(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
  v_total_sessions integer;
  v_avg_rate numeric;
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), coalesce(avg(
    CASE WHEN eligible_member_count > 0
         THEN present_member_count::numeric / eligible_member_count::numeric
         ELSE 0 END
  ), 0)
  INTO v_total_sessions, v_avg_rate
  FROM public.academic_council_meeting_quorum_evaluations q
  JOIN public.academic_council_meetings m ON m.id = q.meeting_id
  WHERE m.council_id = p_council_id AND q.is_final = true;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'total_evaluated_sessions', v_total_sessions,
    'average_attendance_rate', round(v_avg_rate, 4),
    'meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'meeting_number', m.meeting_number,
        'scheduled_at', m.scheduled_at,
        'eligible', q.eligible_member_count,
        'present', q.present_member_count,
        'rate', CASE WHEN q.eligible_member_count > 0
                     THEN round(q.present_member_count::numeric / q.eligible_member_count::numeric, 4)
                     ELSE 0 END
      ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
      FROM public.academic_council_meeting_quorum_evaluations q
      JOIN public.academic_council_meetings m ON m.id = q.meeting_id
      WHERE m.council_id = p_council_id AND q.is_final = true
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_quorum_history(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'quorum_checks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'meeting_number', m.meeting_number,
        'scheduled_at', m.scheduled_at,
        'quorum_met', q.quorum_met,
        'required', q.required_member_count,
        'present', q.present_member_count,
        'evaluated_at', q.evaluated_at,
        'is_final', q.is_final
      ) ORDER BY q.evaluated_at DESC), '[]'::jsonb)
      FROM public.academic_council_meeting_quorum_evaluations q
      JOIN public.academic_council_meetings m ON m.id = q.meeting_id
      WHERE m.council_id = p_council_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_topic_disposition(
  p_council_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'total_topics', (
      SELECT count(*) FROM public.academic_council_topics
      WHERE council_id = p_council_id
        AND (p_from IS NULL OR created_at >= p_from)
        AND (p_to IS NULL OR created_at <= p_to)
    ),
    'by_status', (
      SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, count(*) AS cnt
        FROM public.academic_council_topics
        WHERE council_id = p_council_id
          AND (p_from IS NULL OR created_at >= p_from)
          AND (p_to IS NULL OR created_at <= p_to)
        GROUP BY status
      ) s
    ),
    'topics', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'topic_id', id,
        'title', title,
        'status', status,
        'submitted_at', submitted_at,
        'submitted_by', submitted_by
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM public.academic_council_topics
      WHERE council_id = p_council_id
        AND (p_from IS NULL OR created_at >= p_from)
        AND (p_to IS NULL OR created_at <= p_to)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_agenda_completion(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'meetings_with_agenda', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'meeting_number', m.meeting_number,
        'title', m.title,
        'total_items', total_items,
        'approved_items', approved_items,
        'completion_rate', CASE WHEN total_items > 0
                                THEN round(approved_items::numeric / total_items::numeric, 4)
                                ELSE 0 END
      ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
      FROM (
        SELECT a.meeting_id,
               count(*) AS total_items,
               count(*) FILTER (WHERE a.is_approved) AS approved_items
        FROM public.academic_council_agenda_items a
        JOIN public.academic_council_meetings m ON m.id = a.meeting_id
        WHERE m.council_id = p_council_id
        GROUP BY a.meeting_id
      ) agg
      JOIN public.academic_council_meetings m ON m.id = agg.meeting_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_voting_summary(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'total_voted_items', (
      SELECT count(*) FROM public.academic_council_vote_results r
      JOIN public.academic_council_meetings m ON m.id = r.meeting_id
      WHERE m.council_id = p_council_id
    ),
    'by_outcome', (
      SELECT coalesce(jsonb_object_agg(coalesce(outcome, 'unknown'), cnt), '{}'::jsonb)
      FROM (
        SELECT r.outcome, count(*) AS cnt
        FROM public.academic_council_vote_results r
        JOIN public.academic_council_meetings m ON m.id = r.meeting_id
        WHERE m.council_id = p_council_id
        GROUP BY r.outcome
      ) s
    ),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'agenda_item_id', a.id,
        'meeting_id', m.id,
        'title', a.title,
        'outcome', r.outcome,
        'yes', r.yes_count,
        'no', r.no_count,
        'abstain', r.abstain_count,
        'total', r.total_votes
      ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
      FROM public.academic_council_vote_results r
      JOIN public.academic_council_agenda_items a ON a.id = r.agenda_item_id
      JOIN public.academic_council_meetings m ON m.id = r.meeting_id
      WHERE m.council_id = p_council_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_decision_status(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_council_decision_followup_dashboard(p_council_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_decision_overdue(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_council_overdue_decisions(p_council_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_meeting_archive(
  p_council_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_council_archive_summary(p_council_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_activity_period(
  p_council_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'period_from', p_from,
    'period_to', p_to,
    'meetings_count', (
      SELECT count(*) FROM public.academic_council_meetings
      WHERE council_id = p_council_id
        AND (p_from IS NULL OR created_at >= p_from)
        AND (p_to IS NULL OR created_at <= p_to)
    ),
    'topics_count', (
      SELECT count(*) FROM public.academic_council_topics
      WHERE council_id = p_council_id
        AND (p_from IS NULL OR created_at >= p_from)
        AND (p_to IS NULL OR created_at <= p_to)
    ),
    'decisions_count', (
      SELECT count(*) FROM public.academic_council_decisions d
      JOIN public.academic_council_meetings m ON m.id = d.meeting_id
      WHERE m.council_id = p_council_id
        AND (p_from IS NULL OR d.created_at >= p_from)
        AND (p_to IS NULL OR d.created_at <= p_to)
    ),
    'votes_count', (
      SELECT count(*) FROM public.academic_council_votes v
      JOIN public.academic_council_meetings m ON m.id = v.meeting_id
      WHERE m.council_id = p_council_id
        AND (p_from IS NULL OR v.cast_at >= p_from)
        AND (p_to IS NULL OR v.cast_at <= p_to)
    ),
    'archived_meetings_count', (
      SELECT count(*) FROM public.academic_council_meetings
      WHERE council_id = p_council_id AND status = 'archived'
        AND (p_from IS NULL OR updated_at >= p_from)
        AND (p_to IS NULL OR updated_at <= p_to)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 8) Dashboard RPCs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_council_chair_dashboard(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT public.has_council_role(v_uid, p_council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'upcoming_meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', id,
        'meeting_number', meeting_number,
        'title', title,
        'scheduled_at', scheduled_at,
        'status', status
      ) ORDER BY scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings
      WHERE council_id = p_council_id
        AND status <> 'archived'
        AND scheduled_at >= now() - interval '1 day'
    ),
    'topics_requiring_action', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'topic_id', id,
        'title', title,
        'status', status,
        'submitted_at', submitted_at
      ) ORDER BY submitted_at ASC), '[]'::jsonb)
      FROM public.academic_council_topics
      WHERE council_id = p_council_id
        AND status IN ('submitted', 'needs_completion', 'under_review')
    ),
    'agenda_readiness', public.get_council_report_agenda_completion(p_council_id),
    'quorum_readiness', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'roll_status', r.status,
        'quorum_met', q.quorum_met
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      LEFT JOIN public.academic_council_meeting_attendance_rolls r ON r.meeting_id = m.id
      LEFT JOIN public.academic_council_meeting_quorum_evaluations q
        ON q.meeting_id = m.id AND q.is_final = true
      WHERE m.council_id = p_council_id
        AND m.status IN ('scheduled', 'intake_open', 'intake_closed', 'agenda_ready')
    ),
    'overdue_decisions', public.get_council_overdue_decisions(p_council_id),
    'archive_status', public.get_council_archive_summary(p_council_id),
    'metrics', public.get_council_meeting_metrics(p_council_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_secretary_dashboard(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.has_council_role(v_uid, p_council_id, 'secretary'::public.academic_council_member_role)
          OR public.has_council_role(v_uid, p_council_id, 'chair'::public.academic_council_member_role)) THEN
    RAISE EXCEPTION 'COUNCIL_SECRETARY_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'topics_requiring_preparation', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'topic_id', id,
        'title', title,
        'status', status,
        'submitted_at', submitted_at
      ) ORDER BY submitted_at ASC), '[]'::jsonb)
      FROM public.academic_council_topics
      WHERE council_id = p_council_id
        AND status IN ('submitted', 'needs_completion', 'accepted_for_agenda')
    ),
    'attendance_tasks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'roll_status', r.status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      LEFT JOIN public.academic_council_meeting_attendance_rolls r ON r.meeting_id = m.id
      WHERE m.council_id = p_council_id
        AND m.status IN ('scheduled', 'intake_open', 'intake_closed', 'agenda_ready', 'in_session')
    ),
    'minutes_drafts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'minutes_status', coalesce(min.status, 'minutes_draft'),
        'is_locked', coalesce(min.is_locked, false)
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      LEFT JOIN public.academic_council_minutes min ON min.meeting_id = m.id
      WHERE m.council_id = p_council_id
        AND m.status IN ('in_session', 'minutes_draft', 'minutes_locked')
    ),
    'decision_followups', public.get_council_decision_followup_dashboard(p_council_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_member_dashboard(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', id,
        'meeting_number', meeting_number,
        'title', title,
        'scheduled_at', scheduled_at,
        'status', status
      ) ORDER BY scheduled_at DESC), '[]'::jsonb)
      FROM public.academic_council_meetings
      WHERE council_id = p_council_id
    ),
    'topics', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'topic_id', id,
        'title', title,
        'status', status,
        'submitted_at', submitted_at
      ) ORDER BY submitted_at DESC), '[]'::jsonb)
      FROM public.academic_council_topics
      WHERE council_id = p_council_id
    ),
    'votes_requiring_action', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'agenda_item_id', a.id,
        'meeting_id', m.id,
        'title', a.title,
        'session_status', a.session_status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_agenda_items a
      JOIN public.academic_council_meetings m ON m.id = a.meeting_id
      WHERE m.council_id = p_council_id
        AND a.session_status = 'voting_open'
        AND NOT EXISTS (
          SELECT 1 FROM public.academic_council_votes v
          WHERE v.agenda_item_id = a.id AND v.voter_user_id = v_uid
        )
    ),
    'visible_minutes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'is_locked', min.is_locked
      ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      JOIN public.academic_council_minutes min ON min.meeting_id = m.id
      WHERE m.council_id = p_council_id AND min.is_locked = true
    ),
    'visible_decisions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'decision_id', d.id,
        'title', d.title,
        'status', d.status,
        'due_date', d.due_date
      ) ORDER BY d.created_at DESC), '[]'::jsonb)
      FROM public.academic_council_decisions d
      JOIN public.academic_council_meetings m ON m.id = d.meeting_id
      WHERE m.council_id = p_council_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_admin_operational_dashboard(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_notification_auth_uid();
BEGIN
  IF NOT public.is_council_admin(v_uid) THEN
    RAISE EXCEPTION 'COUNCIL_ADMIN_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'membership_count', (
      SELECT count(*) FROM public.academic_council_members
      WHERE council_id = p_council_id AND is_active = true
    ),
    'membership_by_role', (
      SELECT coalesce(jsonb_object_agg(member_role, cnt), '{}'::jsonb)
      FROM (
        SELECT member_role, count(*) AS cnt
        FROM public.academic_council_members
        WHERE council_id = p_council_id AND is_active = true
        GROUP BY member_role
      ) s
    ),
    'meeting_metrics', public.get_council_meeting_metrics(p_council_id),
    'notification_volume', (
      SELECT count(*) FROM public.academic_council_notification_outbox
      WHERE council_id = p_council_id
    ),
    'unprocessed_outbox_count', (
      SELECT count(*) FROM public.academic_council_notification_outbox
      WHERE council_id = p_council_id AND processed_at IS NULL
    ),
    'audit_event_count', (
      SELECT count(*) FROM public.academic_council_audit_events
      WHERE council_id = p_council_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 9) Grants
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_my_council_notifications(boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_council_notification_read(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_council_decision_due_dates(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_council_notification_outbox(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_council_notification(uuid, uuid, public.academic_council_notification_event, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_council_notification(public.academic_council_notification_event, uuid, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_notification_recipients(uuid, public.academic_council_notification_event, uuid, public.academic_council_member_role[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_council_notifications(boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_council_notification_read(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_council_decision_due_dates(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_council_notification_outbox(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_council_notification(uuid, uuid, public.academic_council_notification_event, text, uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_council_notification(public.academic_council_notification_event, uuid, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_council_notification_recipients(uuid, public.academic_council_notification_event, uuid, public.academic_council_member_role[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_council_report_meeting_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_attendance_rate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_quorum_history(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_topic_disposition(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_agenda_completion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_voting_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_decision_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_decision_overdue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_meeting_archive(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_activity_period(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_chair_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_secretary_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_member_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_admin_operational_dashboard(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_council_report_meeting_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_attendance_rate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_quorum_history(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_topic_disposition(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_agenda_completion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_voting_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_decision_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_decision_overdue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_meeting_archive(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_activity_period(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_chair_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_secretary_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_member_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_admin_operational_dashboard(uuid) TO authenticated, service_role;

COMMIT;
