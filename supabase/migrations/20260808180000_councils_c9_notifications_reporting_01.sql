-- =====================================================================
-- ACADEMIC-COUNCILS-C9-NOTIFICATIONS-REPORTING-01
-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
--
-- Scope:
--   In-app council notifications with server-side recipient derivation.
--   No external email/SMS provider; append/outbox-friendly for later integration.
--   Reporting RPCs built from C0-C8 evidence with server-enforced role scoping.
--   No public/student publication; historical notifications respect current PII access.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Guard: C7 audit/archive must exist
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academic_council_audit_events') IS NULL THEN
    RAISE EXCEPTION 'C9 notifications and reporting requires C7 audit_events foundation';
  END IF;
  IF to_regprocedure('public.archive_council_meeting(uuid)') IS NULL THEN
    RAISE EXCEPTION 'C9 notifications and reporting requires C7 archive_council_meeting';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Extend public.notifications type constraint for council events
--    (defensive: notifications table may not exist in isolated test harness)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_chk;
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_chk
      CHECK (notification_type IN ('request','grade','finance','payment_receipt','system','council'));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) Council notification outbox table (append-only, privacy-aware)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_council_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  council_id      uuid NOT NULL REFERENCES public.academic_councils(id) ON DELETE RESTRICT,
  meeting_id      uuid REFERENCES public.academic_council_meetings(id) ON DELETE RESTRICT,
  entity_type     text,
  entity_id       uuid,
  title           text NOT NULL,
  body            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read         boolean NOT NULL DEFAULT false,
  read_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ac_notifications_user ON public.academic_council_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ac_notifications_council ON public.academic_council_notifications(council_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ac_notifications_unread ON public.academic_council_notifications(user_id, is_read);

ALTER TABLE public.academic_council_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.academic_council_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.academic_council_notifications TO authenticated;
GRANT ALL ON TABLE public.academic_council_notifications TO service_role;

DO $c9_notif_policy_prestate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'academic_council_notifications'
      AND policyname = 'ac_notifications_select_own'
  ) THEN
    RAISE EXCEPTION 'C9_POLICY_UNEXPECTEDLY_EXISTS:ac_notifications_select_own';
  END IF;
END
$c9_notif_policy_prestate$;

CREATE POLICY "ac_notifications_select_own"
  ON public.academic_council_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ac_notifications_update_own_read"
  ON public.academic_council_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Immutable fields guard on user updates
CREATE OR REPLACE FUNCTION public.tg_ac_notifications_protect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_ID_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_USER_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.event_type IS DISTINCT FROM OLD.event_type THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_EVENT_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.council_id IS DISTINCT FROM OLD.council_id THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_COUNCIL_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.meeting_id IS DISTINCT FROM OLD.meeting_id THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_MEETING_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_ENTITY_TYPE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_ENTITY_ID_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_TITLE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_BODY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_PAYLOAD_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_CREATED_AT_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  NEW.read_at := CASE WHEN NEW.is_read THEN COALESCE(OLD.read_at, now()) ELSE NULL END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_notifications_protect ON public.academic_council_notifications;
CREATE TRIGGER trg_ac_notifications_protect
  BEFORE UPDATE ON public.academic_council_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_notifications_protect();

-- ---------------------------------------------------------------------
-- 3) Council notification helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_attendance_require_auth_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_council_notification(
  p_user_id uuid,
  p_event_type text,
  p_council_id uuid,
  p_meeting_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_title text := p_title;
  v_body text := p_body;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_council_id IS NULL THEN RETURN NULL; END IF;

  IF v_title IS NULL THEN
    v_title := CASE p_event_type
      WHEN 'meeting_scheduled' THEN 'تم جدولة اجتماع جديد'
      WHEN 'intake_opened' THEN 'فتح استقبال الموضوعات'
      WHEN 'intake_closing' THEN 'استقبال الموضوعات على وشك الإغلاق'
      WHEN 'intake_closed' THEN 'إغلاق استقبال الموضوعات'
      WHEN 'topic_submitted' THEN 'موضوع جديد مقدم للمجلس'
      WHEN 'needs_completion' THEN 'موضوع يحتاج استكمالاً'
      WHEN 'accepted' THEN 'قبول موضوع للمجلس'
      WHEN 'rejected' THEN 'رفض موضوع'
      WHEN 'agenda_ready' THEN 'جدول الأعمال جاهز'
      WHEN 'attendance_requested' THEN 'طلب تأكيد الحضور'
      WHEN 'session_ready' THEN 'الجلسة جاهزة للانعقاد'
      WHEN 'decision_assigned' THEN 'قرار موجه لك للتنفيذ'
      WHEN 'decision_nearing_deadline' THEN 'قرار يقترب من تاريخ الاستحقاق'
      WHEN 'decision_overdue' THEN 'قرار متأخر عن التنفيذ'
      WHEN 'meeting_archived' THEN 'تم أرشفة الاجتماع'
      ELSE 'إشعار مجلس أكاديمي'
    END;
  END IF;

  IF v_body IS NULL THEN
    v_body := CASE p_event_type
      WHEN 'meeting_scheduled' THEN 'تم جدولة اجتماع جديد للمجلس. يمكنك الاطلاع على التفاصيل.'
      WHEN 'intake_opened' THEN 'فُتح استقبال الموضوعات لاجتماع قادم. بإمكانك تقديم موضوع حسب صلاحياتك.'
      WHEN 'intake_closing' THEN 'استقبال الموضوعات سيُغلق قريباً. يرجى إنهاء ما يلزم.'
      WHEN 'intake_closed' THEN 'أُغلق استقبال الموضوعات. سيتم البدء بإعداد جدول الأعمال.'
      WHEN 'topic_submitted' THEN 'تم تقديم موضوع جديد للمجلس وهو قيد المراجعة.'
      WHEN 'needs_completion' THEN 'موضوع مقدم يحتاج إلى استكمال بيانات قبل المتابعة.'
      WHEN 'accepted' THEN 'تم قبول موضوع وإدراجه ضمن بنود جدول الأعمال المحتملة.'
      WHEN 'rejected' THEN 'تم رفض موضوع. يمكنك مراجعة الملاحظات.'
      WHEN 'agenda_ready' THEN 'جدول أعمال الاجتماع جاهز للاطلاع والتحضير.'
      WHEN 'attendance_requested' THEN 'يُرجى تأكيد حضورك لاجتماع المجلس القادم.'
      WHEN 'session_ready' THEN 'الجلسة جاهزة للانعقاد. يمكنك المشاركة عند بدء التصويت.'
      WHEN 'decision_assigned' THEN 'تم توجيه قرار للتنفيذ من قبلك. راجع التفاصيل والموعد المحدد.'
      WHEN 'decision_nearing_deadline' THEN 'قرار موجه للتنفيذ يقترب من موعد استحقاقه.'
      WHEN 'decision_overdue' THEN 'قرار متأخر عن التنفيذ. يرجى تحديث مجريات التنفيذ فوراً.'
      WHEN 'meeting_archived' THEN 'تمت أرشفة الاجتماع وتحويل محضره للسجل التاريخي.'
      ELSE 'لديك إشعار جديد من المجلس الأكاديمي.'
    END;
  END IF;

  INSERT INTO public.academic_council_notifications (
    user_id, event_type, council_id, meeting_id, entity_type, entity_id, title, body, payload
  ) VALUES (
    p_user_id, p_event_type, p_council_id, p_meeting_id, p_entity_type, p_entity_id, v_title, v_body, p_payload
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_notification_recipients(
  p_council_id uuid,
  p_event_type text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_council_id IS NULL THEN RETURN; END IF;

  -- decision_* events target responsible actor + chair/secretary oversight
  IF p_event_type IN ('decision_assigned', 'decision_nearing_deadline', 'decision_overdue') THEN
    RETURN QUERY
    SELECT DISTINCT m.user_id
    FROM public.academic_council_members m
    WHERE m.council_id = p_council_id
      AND m.is_active = true
      AND m.active_to IS NULL
      AND (
        m.member_role IN ('chair', 'secretary')
        OR m.user_id = (p_context->>'responsible_user_id')::uuid
      );
    RETURN;
  END IF;

  -- attendance_requested targets all current members/viewers
  IF p_event_type = 'attendance_requested' THEN
    RETURN QUERY
    SELECT DISTINCT m.user_id
    FROM public.academic_council_members m
    WHERE m.council_id = p_council_id
      AND m.is_active = true
      AND m.active_to IS NULL;
    RETURN;
  END IF;

  -- Default: notify all active council members
  RETURN QUERY
  SELECT DISTINCT m.user_id
  FROM public.academic_council_members m
  WHERE m.council_id = p_council_id
    AND m.is_active = true
    AND m.active_to IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_council_notification(
  p_event_type text,
  p_council_id uuid,
  p_meeting_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_body text;
BEGIN
  SELECT
    CASE p_event_type
      WHEN 'meeting_scheduled' THEN 'تم جدولة اجتماع جديد'
      WHEN 'intake_opened' THEN 'فتح استقبال الموضوعات'
      WHEN 'intake_closing' THEN 'استقبال الموضوعات على وشك الإغلاق'
      WHEN 'intake_closed' THEN 'إغلاق استقبال الموضوعات'
      WHEN 'topic_submitted' THEN 'موضوع جديد مقدم للمجلس'
      WHEN 'needs_completion' THEN 'موضوع يحتاج استكمالاً'
      WHEN 'accepted' THEN 'قبول موضوع للمجلس'
      WHEN 'rejected' THEN 'رفض موضوع'
      WHEN 'agenda_ready' THEN 'جدول الأعمال جاهز'
      WHEN 'attendance_requested' THEN 'طلب تأكيد الحضور'
      WHEN 'session_ready' THEN 'الجلسة جاهزة للانعقاد'
      WHEN 'decision_assigned' THEN 'قرار موجه لك للتنفيذ'
      WHEN 'decision_nearing_deadline' THEN 'قرار يقترب من تاريخ الاستحقاق'
      WHEN 'decision_overdue' THEN 'قرار متأخر عن التنفيذ'
      WHEN 'meeting_archived' THEN 'تم أرشفة الاجتماع'
      ELSE 'إشعار مجلس أكاديمي'
    END,
    CASE p_event_type
      WHEN 'meeting_scheduled' THEN 'تم جدولة اجتماع جديد للمجلس. يمكنك الاطلاع على التفاصيل.'
      WHEN 'intake_opened' THEN 'فُتح استقبال الموضوعات لاجتماع قادم. بإمكانك تقديم موضوع حسب صلاحياتك.'
      WHEN 'intake_closing' THEN 'استقبال الموضوعات سيُغلق قريباً. يرجى إنهاء ما يلزم.'
      WHEN 'intake_closed' THEN 'أُغلق استقبال الموضوعات. سيتم البدء بإعداد جدول الأعمال.'
      WHEN 'topic_submitted' THEN 'تم تقديم موضوع جديد للمجلس وهو قيد المراجعة.'
      WHEN 'needs_completion' THEN 'موضوع مقدم يحتاج إلى استكمال بيانات قبل المتابعة.'
      WHEN 'accepted' THEN 'تم قبول موضوع وإدراجه ضمن بنود جدول الأعمال المحتملة.'
      WHEN 'rejected' THEN 'تم رفض موضوع. يمكنك مراجعة الملاحظات.'
      WHEN 'agenda_ready' THEN 'جدول أعمال الاجتماع جاهز للاطلاع والتحضير.'
      WHEN 'attendance_requested' THEN 'يُرجى تأكيد حضورك لاجتماع المجلس القادم.'
      WHEN 'session_ready' THEN 'الجلسة جاهزة للانعقاد. يمكنك المشاركة عند بدء التصويت.'
      WHEN 'decision_assigned' THEN 'تم توجيه قرار للتنفيذ من قبلك. راجع التفاصيل والموعد المحدد.'
      WHEN 'decision_nearing_deadline' THEN 'قرار موجه للتنفيذ يقترب من موعد استحقاقه.'
      WHEN 'decision_overdue' THEN 'قرار متأخر عن التنفيذ. يرجى تحديث مجريات التنفيذ فوراً.'
      WHEN 'meeting_archived' THEN 'تمت أرشفة الاجتماع وتحويل محضره للسجل التاريخي.'
      ELSE 'لديك إشعار جديد من المجلس الأكاديمي.'
    END
  INTO v_title, v_body;

  FOR v_user_id IN
    SELECT r.user_id FROM public.get_council_notification_recipients(p_council_id, p_event_type, p_payload) r
  LOOP
    PERFORM public.create_council_notification(
      v_user_id, p_event_type, p_council_id, p_meeting_id,
      p_entity_type, p_entity_id, v_title, v_body, p_payload
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- 4) User-facing notification RPCs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_council_notifications(p_limit integer DEFAULT 50)
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
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'event_type', n.event_type,
    'council_id', n.council_id,
    'council_name', c.name,
    'meeting_id', n.meeting_id,
    'entity_type', n.entity_type,
    'entity_id', n.entity_id,
    'title', n.title,
    'body', n.body,
    'is_read', n.is_read,
    'created_at', n.created_at,
    'payload', n.payload
  ) ORDER BY n.created_at DESC), '[]'::jsonb) INTO v_list
  FROM public.academic_council_notifications n
  JOIN public.academic_councils c ON c.id = n.council_id
  WHERE n.user_id = v_uid
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

CREATE OR REPLACE FUNCTION public.acknowledge_council_notification(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  UPDATE public.academic_council_notifications
  SET is_read = true, read_at = now()
  WHERE id = p_notification_id AND user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_NOT_FOUND_OR_ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Notification event triggers on council lifecycle
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ac_meeting_schedule_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.dispatch_council_notification(
    'meeting_scheduled', NEW.council_id, NEW.id, 'academic_council_meetings', NEW.id,
    jsonb_build_object('meeting_number', NEW.meeting_number, 'title', NEW.title, 'scheduled_at', NEW.scheduled_at)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_meeting_schedule_notify ON public.academic_council_meetings;
CREATE TRIGGER trg_ac_meeting_schedule_notify
  AFTER INSERT ON public.academic_council_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_meeting_schedule_notify();

CREATE OR REPLACE FUNCTION public.tg_ac_meeting_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_event := CASE NEW.status
    WHEN 'intake_open' THEN 'intake_opened'
    WHEN 'intake_closed' THEN 'intake_closed'
    WHEN 'agenda_ready' THEN 'agenda_ready'
    WHEN 'in_session' THEN 'session_ready'
    WHEN 'archived' THEN 'meeting_archived'
    ELSE NULL
  END;

  IF v_event IS NOT NULL THEN
    PERFORM public.dispatch_council_notification(
      v_event, NEW.council_id, NEW.id, 'academic_council_meetings', NEW.id,
      jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_meeting_status_notify ON public.academic_council_meetings;
CREATE TRIGGER trg_ac_meeting_status_notify
  AFTER UPDATE OF status ON public.academic_council_meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_meeting_status_notify();

CREATE OR REPLACE FUNCTION public.tg_ac_topic_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_event := CASE NEW.status
    WHEN 'submitted' THEN 'topic_submitted'
    WHEN 'needs_completion' THEN 'needs_completion'
    WHEN 'accepted_for_agenda' THEN 'accepted'
    WHEN 'rejected' THEN 'rejected'
    ELSE NULL
  END;

  IF v_event IS NOT NULL THEN
    PERFORM public.dispatch_council_notification(
      v_event, NEW.council_id, NEW.meeting_id, 'academic_council_topics', NEW.id,
      jsonb_build_object('topic_title', NEW.title, 'status', NEW.status, 'review_note', NEW.review_note)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_topic_status_notify ON public.academic_council_topics;
CREATE TRIGGER trg_ac_topic_status_notify
  AFTER INSERT OR UPDATE OF status ON public.academic_council_topics
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_topic_status_notify();

CREATE OR REPLACE FUNCTION public.tg_ac_decision_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_council_id uuid;
BEGIN
  SELECT council_id INTO v_council_id
  FROM public.academic_council_meetings
  WHERE id = NEW.meeting_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_council_notification(
      'decision_assigned', v_council_id, NEW.meeting_id, 'academic_council_decisions', NEW.id,
      jsonb_build_object(
        'decision_number', NEW.canonical_decision_number,
        'title', NEW.title,
        'responsible_user_id', NEW.responsible_user_id,
        'due_date', NEW.due_date
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    PERFORM public.dispatch_council_notification(
      'decision_overdue', v_council_id, NEW.meeting_id, 'academic_council_decisions', NEW.id,
      jsonb_build_object(
        'decision_number', NEW.canonical_decision_number,
        'title', NEW.title,
        'responsible_user_id', NEW.responsible_user_id,
        'due_date', NEW.due_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_decision_notify ON public.academic_council_decisions;
CREATE TRIGGER trg_ac_decision_notify
  AFTER INSERT OR UPDATE OF status ON public.academic_council_decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_ac_decision_notify();

-- ---------------------------------------------------------------------
-- 6) Reporting RPCs (server-enforced membership scoping)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_council_report_meetings_by_period(
  p_council_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'meeting_id', m.id,
      'meeting_number', m.meeting_number,
      'title', m.title,
      'scheduled_at', m.scheduled_at,
      'status', m.status,
      'location', m.location
    ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
    FROM public.academic_council_meetings m
    WHERE m.council_id = p_council_id
      AND (p_from IS NULL OR m.scheduled_at::date >= p_from)
      AND (p_to IS NULL OR m.scheduled_at::date <= p_to)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_attendance_rate(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'council_id', p_council_id,
      'meetings_with_rolls', count(DISTINCT r.meeting_id),
      'total_eligible', count(a.id),
      'present_count', count(*) FILTER (WHERE a.attendance_state IN ('present', 'present_remote')),
      'absent_count', count(*) FILTER (WHERE a.attendance_state = 'absent'),
      'attendance_rate', CASE WHEN count(a.id) > 0
        THEN round(100.0 * count(*) FILTER (WHERE a.attendance_state IN ('present', 'present_remote')) / count(a.id), 2)
        ELSE 0
      END
    )
    FROM public.academic_council_meeting_attendance_rolls r
    JOIN public.academic_council_meeting_attendance a ON a.meeting_id = r.meeting_id
    JOIN public.academic_council_meetings m ON m.id = r.meeting_id
    WHERE m.council_id = p_council_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_quorum_history(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'meeting_id', m.id,
      'meeting_number', m.meeting_number,
      'scheduled_at', m.scheduled_at,
      'quorum_met', e.quorum_met,
      'present_count', e.present_member_count,
      'required_count', e.required_member_count,
      'evaluated_at', e.evaluated_at
    ) ORDER BY e.evaluated_at DESC), '[]'::jsonb)
    FROM public.academic_council_meeting_quorum_evaluations e
    JOIN public.academic_council_meetings m ON m.id = e.meeting_id
    WHERE m.council_id = p_council_id AND e.is_final = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_topic_disposition(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'council_id', p_council_id,
      'total', count(*),
      'by_status', coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
    )
    FROM (
      SELECT status, count(*) AS cnt
      FROM public.academic_council_topics
      WHERE council_id = p_council_id
      GROUP BY status
    ) s
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_agenda_completion(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'meeting_id', m.id,
      'meeting_number', m.meeting_number,
      'title', m.title,
      'total_items', count(i.id),
      'approved_items', count(*) FILTER (WHERE i.is_approved = true),
      'resolved_items', count(*) FILTER (WHERE i.session_status = 'resolved'),
      'pending_items', count(*) FILTER (WHERE i.session_status = 'pending')
    ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
    FROM public.academic_council_meetings m
    LEFT JOIN public.academic_council_agenda_items i ON i.meeting_id = m.id
    WHERE m.council_id = p_council_id
    GROUP BY m.id, m.meeting_number, m.title, m.scheduled_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_vote_result_summary(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'agenda_item_id', r.agenda_item_id,
      'meeting_id', i.meeting_id,
      'title', i.title,
      'yes_count', r.yes_count,
      'no_count', r.no_count,
      'abstain_count', r.abstain_count,
      'total_votes', r.total_votes,
      'outcome', r.outcome
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM public.academic_council_vote_results r
    JOIN public.academic_council_agenda_items i ON i.id = r.agenda_item_id
    JOIN public.academic_council_meetings m ON m.id = i.meeting_id
    WHERE m.council_id = p_council_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_decision_execution_status(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'council_id', p_council_id,
      'total', count(*),
      'issued', count(*) FILTER (WHERE d.status = 'issued'),
      'in_progress', count(*) FILTER (WHERE d.status = 'in_progress'),
      'completed', count(*) FILTER (WHERE d.status = 'completed'),
      'blocked', count(*) FILTER (WHERE d.status = 'blocked'),
      'overdue', count(*) FILTER (WHERE d.due_date < CURRENT_DATE AND d.status <> 'completed')
    )
    FROM public.academic_council_decisions d
    JOIN public.academic_council_meetings m ON m.id = d.meeting_id
    WHERE m.council_id = p_council_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_overdue_decisions(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'decision_id', d.id,
      'canonical_number', d.canonical_decision_number,
      'title', d.title,
      'status', d.status,
      'responsible_user_id', d.responsible_user_id,
      'responsible_unit', d.responsible_unit,
      'due_date', d.due_date,
      'days_overdue', CURRENT_DATE - d.due_date
    ) ORDER BY d.due_date ASC), '[]'::jsonb)
    FROM public.academic_council_decisions d
    JOIN public.academic_council_meetings m ON m.id = d.meeting_id
    WHERE m.council_id = p_council_id
      AND d.due_date < CURRENT_DATE
      AND d.status <> 'completed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_meeting_duration(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'meeting_id', m.id,
      'meeting_number', m.meeting_number,
      'scheduled_at', m.scheduled_at,
      'opened_at', m.opened_at,
      'closed_at', m.closed_at,
      'duration_minutes', CASE
        WHEN m.opened_at IS NOT NULL AND m.closed_at IS NOT NULL
        THEN extract(epoch FROM (m.closed_at - m.opened_at)) / 60
        ELSE NULL
      END
    ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
    FROM public.academic_council_meetings m
    WHERE m.council_id = p_council_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_archive_status(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'council_id', p_council_id,
      'total_meetings', count(*),
      'archived', count(*) FILTER (WHERE status = 'archived'),
      'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
      'active_lifecycle', count(*) FILTER (WHERE status NOT IN ('archived', 'cancelled')),
      'meetings', coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', id,
        'meeting_number', meeting_number,
        'title', title,
        'status', status,
        'archived_at', CASE WHEN status = 'archived' THEN updated_at ELSE NULL END
      ) ORDER BY meeting_number DESC), '[]'::jsonb)
    )
    FROM public.academic_council_meetings
    WHERE council_id = p_council_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_report_council_activity(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'council_id', p_council_id,
      'active_member_count', (
        SELECT count(*) FROM public.academic_council_members
        WHERE council_id = p_council_id AND is_active = true AND active_to IS NULL
      ),
      'total_meetings', (SELECT count(*) FROM public.academic_council_meetings WHERE council_id = p_council_id),
      'total_topics', (SELECT count(*) FROM public.academic_council_topics WHERE council_id = p_council_id),
      'total_decisions', (
        SELECT count(*) FROM public.academic_council_decisions d
        JOIN public.academic_council_meetings m ON m.id = d.meeting_id
        WHERE m.council_id = p_council_id
      ),
      'total_votes', (
        SELECT count(*) FROM public.academic_council_votes v
        JOIN public.academic_council_agenda_items i ON i.id = v.agenda_item_id
        JOIN public.academic_council_meetings m ON m.id = i.meeting_id
        WHERE m.council_id = p_council_id
      ),
      'last_event_at', (
        SELECT max(created_at) FROM public.academic_council_audit_events
        WHERE council_id = p_council_id
      )
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7) Dashboard RPCs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_council_chair_dashboard(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT public.has_council_role(v_uid, p_council_id, 'chair'::public.academic_council_member_role) THEN
    RAISE EXCEPTION 'COUNCIL_CHAIR_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'upcoming_meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'meeting_number', m.meeting_number,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'status', m.status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id
        AND m.scheduled_at >= now()
        AND m.status NOT IN ('archived', 'cancelled')
    ),
    'intake_open_meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'intake_opens_at', m.intake_opens_at,
        'intake_closes_at', m.intake_closes_at
      ) ORDER BY m.intake_closes_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id AND m.status = 'intake_open'
    ),
    'topics_needing_review', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'topic_id', t.id,
        'title', t.title,
        'status', t.status,
        'submitted_by', t.submitted_by,
        'meeting_id', t.meeting_id
      ) ORDER BY t.created_at ASC), '[]'::jsonb)
      FROM public.academic_council_topics t
      WHERE t.council_id = p_council_id
        AND t.status IN ('submitted', 'under_review', 'needs_completion')
    ),
    'meetings_awaiting_agenda_finalization', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'status', m.status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id AND m.status = 'intake_closed'
    ),
    'meetings_awaiting_session', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'scheduled_at', m.scheduled_at
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id AND m.status = 'agenda_ready'
    ),
    'minutes_awaiting_approval', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'minutes_status', min.status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      JOIN public.academic_council_minutes min ON min.meeting_id = m.id
      WHERE m.council_id = p_council_id AND m.status = 'minutes_review'
    ),
    'overdue_decisions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'decision_id', d.id,
        'canonical_number', d.canonical_decision_number,
        'title', d.title,
        'due_date', d.due_date
      ) ORDER BY d.due_date ASC), '[]'::jsonb)
      FROM public.academic_council_decisions d
      JOIN public.academic_council_meetings m ON m.id = d.meeting_id
      WHERE m.council_id = p_council_id
        AND d.due_date < CURRENT_DATE
        AND d.status <> 'completed'
    ),
    'meetings_ready_to_archive', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'status', m.status
      ) ORDER BY m.meeting_number ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id
        AND m.status = 'minutes_locked'
    )
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
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (
    public.has_council_role(v_uid, p_council_id, 'secretary'::public.academic_council_member_role)
    OR public.has_council_role(v_uid, p_council_id, 'chair'::public.academic_council_member_role)
  ) THEN
    RAISE EXCEPTION 'COUNCIL_SECRETARY_AUTHORITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'topic_preparation_queue', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'topic_id', t.id,
        'title', t.title,
        'status', t.status,
        'submitted_by', t.submitted_by
      ) ORDER BY t.created_at ASC), '[]'::jsonb)
      FROM public.academic_council_topics t
      WHERE t.council_id = p_council_id AND t.status IN ('submitted', 'needs_completion', 'under_review')
    ),
    'agenda_prep_meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'status', m.status,
        'agenda_item_count', (SELECT count(*) FROM public.academic_council_agenda_items i WHERE i.meeting_id = m.id)
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id AND m.status IN ('intake_closed', 'agenda_ready')
    ),
    'attendance_work', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'roll_status', r.status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      LEFT JOIN public.academic_council_meeting_attendance_rolls r ON r.meeting_id = m.id
      WHERE m.council_id = p_council_id
        AND m.status IN ('intake_closed', 'agenda_ready', 'in_session')
    ),
    'minutes_drafts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'minutes_status', min.status,
        'is_locked', min.is_locked
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      LEFT JOIN public.academic_council_minutes min ON min.meeting_id = m.id
      WHERE m.council_id = p_council_id AND m.status IN ('minutes_draft', 'minutes_review')
    ),
    'decision_followup', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'decision_id', d.id,
        'canonical_number', d.canonical_decision_number,
        'title', d.title,
        'status', d.status,
        'due_date', d.due_date,
        'responsible_unit', d.responsible_unit
      ) ORDER BY d.due_date ASC), '[]'::jsonb)
      FROM public.academic_council_decisions d
      JOIN public.academic_council_meetings m ON m.id = d.meeting_id
      WHERE m.council_id = p_council_id AND d.status <> 'completed'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_council_member_workspace(p_council_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := public.council_attendance_require_auth_uid();
BEGIN
  IF NOT (public.is_council_admin(v_uid) OR public.is_council_member(v_uid, p_council_id)) THEN
    RAISE EXCEPTION 'COUNCIL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'council_id', p_council_id,
    'upcoming_meetings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'meeting_number', m.meeting_number,
        'title', m.title,
        'scheduled_at', m.scheduled_at,
        'status', m.status
      ) ORDER BY m.scheduled_at ASC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      WHERE m.council_id = p_council_id
        AND m.scheduled_at >= now()
        AND m.status NOT IN ('archived', 'cancelled')
    ),
    'agenda_items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'agenda_item_id', i.id,
        'meeting_id', i.meeting_id,
        'title', i.title,
        'order_index', i.order_index,
        'is_approved', i.is_approved,
        'session_status', i.session_status
      ) ORDER BY i.meeting_id, i.order_index), '[]'::jsonb)
      FROM public.academic_council_agenda_items i
      JOIN public.academic_council_meetings m ON m.id = i.meeting_id
      WHERE m.council_id = p_council_id
    ),
    'open_votes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'agenda_item_id', i.id,
        'meeting_id', i.meeting_id,
        'title', i.title,
        'session_status', i.session_status
      ) ORDER BY i.order_index), '[]'::jsonb)
      FROM public.academic_council_agenda_items i
      JOIN public.academic_council_meetings m ON m.id = i.meeting_id
      WHERE m.council_id = p_council_id AND i.session_status = 'voting_open'
    ),
    'minutes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'is_locked', min.is_locked
      ) ORDER BY m.scheduled_at DESC), '[]'::jsonb)
      FROM public.academic_council_meetings m
      LEFT JOIN public.academic_council_minutes min ON min.meeting_id = m.id
      WHERE m.council_id = p_council_id AND min.id IS NOT NULL
    ),
    'decisions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'decision_id', d.id,
        'canonical_number', d.canonical_decision_number,
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

CREATE OR REPLACE FUNCTION public.get_council_responsible_decisions(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := coalesce(p_user_id, public.council_attendance_require_auth_uid());
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'decision_id', d.id,
      'canonical_number', d.canonical_decision_number,
      'title', d.title,
      'body', d.body,
      'status', d.status,
      'due_date', d.due_date,
      'execution_note', d.execution_note,
      'evidence_metadata', d.evidence_metadata,
      'meeting_id', d.meeting_id,
      'council_id', m.council_id,
      'council_name', c.name
    ) ORDER BY d.due_date ASC), '[]'::jsonb)
    FROM public.academic_council_decisions d
    JOIN public.academic_council_meetings m ON m.id = d.meeting_id
    JOIN public.academic_councils c ON c.id = m.council_id
    WHERE d.responsible_user_id = v_uid
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 8) Grants / Revokes
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_council_notification(uuid, text, uuid, uuid, text, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_notification_recipients(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispatch_council_notification(text, uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_council_notifications(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acknowledge_council_notification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_meetings_by_period(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_attendance_rate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_quorum_history(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_topic_disposition(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_agenda_completion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_vote_result_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_decision_execution_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_overdue_decisions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_meeting_duration(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_archive_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_report_council_activity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_chair_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_secretary_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_member_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_council_responsible_decisions(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_council_notification(uuid, text, uuid, uuid, text, uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_notification_recipients(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_council_notification(text, uuid, uuid, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_council_notifications(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_council_notification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_meetings_by_period(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_attendance_rate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_quorum_history(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_topic_disposition(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_agenda_completion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_vote_result_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_decision_execution_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_overdue_decisions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_meeting_duration(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_archive_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_report_council_activity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_chair_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_secretary_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_member_workspace(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_council_responsible_decisions(uuid) TO authenticated, service_role;

COMMIT;
