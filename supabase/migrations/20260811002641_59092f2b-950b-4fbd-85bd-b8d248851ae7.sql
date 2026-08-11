-- Add 'decision_issued' council notification event fanned out to all meeting attendees.

CREATE OR REPLACE FUNCTION public.create_council_notification(p_user_id uuid, p_event_type text, p_council_id uuid, p_meeting_id uuid DEFAULT NULL::uuid, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_title text;
  v_body text;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
BEGIN
  -- INTERNAL_ONLY helper: never trust caller-supplied title/body.
  -- p_title/p_body retained for signature stability but are ignored.
  PERFORM p_title, p_body;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_USER_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_council_id IS NULL THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_COUNCIL_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN (
    'meeting_scheduled', 'intake_opened', 'intake_closing', 'intake_closed',
    'topic_submitted', 'needs_completion', 'accepted', 'rejected',
    'agenda_ready', 'attendance_requested', 'session_ready',
    'decision_assigned', 'decision_issued', 'decision_nearing_deadline', 'decision_overdue',
    'meeting_archived'
  ) THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_EVENT_TYPE_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.academic_councils c WHERE c.id = p_council_id) THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_COUNCIL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_meeting_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.academic_council_meetings m
      WHERE m.id = p_meeting_id AND m.council_id = p_council_id
    ) THEN
      RAISE EXCEPTION 'COUNCIL_NOTIFICATION_MEETING_COUNCIL_MISMATCH' USING ERRCODE = '22023';
    END IF;
  END IF;

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
    WHEN 'decision_issued' THEN 'اعتماد قرار نهائي'
    WHEN 'decision_nearing_deadline' THEN 'قرار يقترب من تاريخ الاستحقاق'
    WHEN 'decision_overdue' THEN 'قرار متأخر عن التنفيذ'
    WHEN 'meeting_archived' THEN 'تم أرشفة الاجتماع'
  END;

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
    WHEN 'decision_issued' THEN 'تم اعتماد قرار نهائي في اجتماع حضرته. يمكنك الاطلاع على نص القرار وتفاصيل التنفيذ.'
    WHEN 'decision_nearing_deadline' THEN 'قرار موجه للتنفيذ يقترب من موعد استحقاقه.'
    WHEN 'decision_overdue' THEN 'قرار متأخر عن التنفيذ. يرجى تحديث مجريات التنفيذ فوراً.'
    WHEN 'meeting_archived' THEN 'تمت أرشفة الاجتماع وتحويل محضره للسجل التاريخي.'
  END;

  -- Strip client-forgeable freeform keys; keep only safe server metadata keys.
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'meeting_number', v_payload->'meeting_number',
    'title', v_payload->'title',
    'scheduled_at', v_payload->'scheduled_at',
    'from_status', v_payload->'from_status',
    'to_status', v_payload->'to_status',
    'topic_title', v_payload->'topic_title',
    'status', v_payload->'status',
    'review_note', v_payload->'review_note',
    'decision_number', v_payload->'decision_number',
    'responsible_user_id', v_payload->'responsible_user_id',
    'due_date', v_payload->'due_date'
  ));

  INSERT INTO public.academic_council_notifications (
    user_id, event_type, council_id, meeting_id, entity_type, entity_id, title, body, payload
  ) VALUES (
    p_user_id, p_event_type, p_council_id, p_meeting_id, p_entity_type, p_entity_id, v_title, v_body, v_payload
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_council_notification_recipients(p_council_id uuid, p_event_type text, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_meeting_id uuid;
BEGIN
  IF p_council_id IS NULL THEN RETURN; END IF;

  -- decision_issued targets everyone recorded as attending that meeting
  IF p_event_type = 'decision_issued' THEN
    BEGIN
      v_meeting_id := (p_context->>'meeting_id')::uuid;
    EXCEPTION WHEN others THEN
      v_meeting_id := NULL;
    END;
    IF v_meeting_id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT DISTINCT a.user_id
    FROM public.academic_council_meeting_attendance a
    JOIN public.academic_council_meetings mt ON mt.id = a.meeting_id
    WHERE a.meeting_id = v_meeting_id
      AND mt.council_id = p_council_id
      AND a.attendance_state IN ('present', 'present_remote');
    RETURN;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_council_notification(p_event_type text, p_council_id uuid, p_meeting_id uuid DEFAULT NULL::uuid, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  -- INTERNAL_ONLY: recipients and message text are derived server-side.
  IF p_event_type IS NULL OR p_event_type NOT IN (
    'meeting_scheduled', 'intake_opened', 'intake_closing', 'intake_closed',
    'topic_submitted', 'needs_completion', 'accepted', 'rejected',
    'agenda_ready', 'attendance_requested', 'session_ready',
    'decision_assigned', 'decision_issued', 'decision_nearing_deadline', 'decision_overdue',
    'meeting_archived'
  ) THEN
    RAISE EXCEPTION 'COUNCIL_NOTIFICATION_EVENT_TYPE_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  FOR v_user_id IN
    SELECT r.user_id FROM public.get_council_notification_recipients(p_council_id, p_event_type, coalesce(p_payload, '{}'::jsonb)) r
  LOOP
    PERFORM public.create_council_notification(
      v_user_id, p_event_type, p_council_id, p_meeting_id,
      p_entity_type, p_entity_id, NULL, NULL, coalesce(p_payload, '{}'::jsonb)
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_ac_decision_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- Final approved decision: notify every recorded attendee of the meeting.
    PERFORM public.dispatch_council_notification(
      'decision_issued', v_council_id, NEW.meeting_id, 'academic_council_decisions', NEW.id,
      jsonb_build_object(
        'meeting_id', NEW.meeting_id,
        'decision_number', NEW.canonical_decision_number,
        'title', NEW.title,
        'due_date', NEW.due_date
      )
    );
  END IF;
  -- decision_overdue is deadline-driven (not emitted on status=completed).

  RETURN NEW;
END;
$function$;