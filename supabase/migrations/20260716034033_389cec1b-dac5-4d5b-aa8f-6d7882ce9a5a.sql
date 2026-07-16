-- ============================================================================
-- DRAFT (SOURCE-ONLY, NOT APPLIED)
-- File location intentionally OUTSIDE supabase/migrations to prevent
-- automatic application. To apply, move this file into supabase/migrations/
-- with an appropriate timestamped filename after human review.
--
-- Purpose: correction to the student_request_completed notification path.
--   1) DB-level UNIQUE partial index preventing duplicate completion
--      notifications per (user, type, reference_type, reference_id).
--   2) Rewrite archive_enrollment_certificate_from_workflow_step:
--      - REMOVE notification insert from the "previously archived" branch.
--      - Keep notification insert ONLY on the real successful transition
--        to archived.
--      - Use INSERT ... ON CONFLICT DO NOTHING instead of WHERE NOT EXISTS.
--      - Title: "اكتمل طلبك وأصبحت الوثيقة جاهزة"
--      - Message: "رقم الطلب: <request_number> — رقم الوثيقة: <document_number>"
--        (no link, no pdf_url, no verification_code, no storage path).
--      - Do NOT change validation, workflow_events, or any other behavior.
-- ============================================================================

-- 1) UNIQUE partial index (idempotency guarantee at the schema level).
CREATE UNIQUE INDEX IF NOT EXISTS notifications_student_request_completed_uniq
  ON public.notifications (user_id, notification_type, reference_type, reference_id)
  WHERE notification_type = 'student_request_completed'
    AND reference_type    = 'student_request'
    AND reference_id      IS NOT NULL;

-- 2) Replace the function. Only the notification-related blocks change;
--    all other logic (auth check, locking, validation, workflow_events
--    insert, transition lookup, updates) is preserved verbatim from the
--    currently-deployed definition.
CREATE OR REPLACE FUNCTION public.archive_enrollment_certificate_from_workflow_step(
  p_step_id uuid,
  p_comment text DEFAULT NULL::text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_req public.student_requests%ROWTYPE;
  v_doc public.official_documents%ROWTYPE;
  v_registrar_ok boolean := false;
  v_dean_ok boolean := false;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_actor_unit_id uuid;
  v_actor_role_id uuid;
  v_student_user_id uuid;
  v_notif_title text;
  v_notif_message text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_current_user_act_on_step(p_step_id, 'archive') THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ هذا الإجراء على هذه الخطوة' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخطوة غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  IF v_step.status = 'completed' AND v_step.decision = 'archived' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'step_id', p_step_id, 'status', 'archived');
  END IF;

  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c WHERE c.id = v_step.workflow_step_id;
  SELECT r.* INTO v_req FROM public.student_requests r WHERE r.id = v_step.student_request_id FOR UPDATE;

  IF v_step.status IS DISTINCT FROM 'active'
     OR COALESCE(v_step.step_key, '') IS DISTINCT FROM 'archive'
     OR COALESCE(v_config.action_type, '') IS DISTINCT FROM 'archive'
  THEN
    RAISE EXCEPTION 'خطوة الأرشفة ليست النشطة أو غير متوافقة' USING ERRCODE = '22023';
  END IF;
  IF v_req.status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'لا يمكن أرشفة طلب مرفوض أو ملغى' USING ERRCODE = '22023';
  END IF;

  SELECT d.* INTO v_doc FROM public.official_documents d
  WHERE d.student_request_id = v_req.id AND d.status IS DISTINCT FROM 'cancelled'
  ORDER BY d.issued_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد وثيقة مرتبطة بالطلب' USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- Previously-archived recovery branch.
  -- CORRECTION: no notification is created here. Notifications are only
  -- emitted on the real transition into archived below.
  -- --------------------------------------------------------------------------
  IF v_doc.status = 'archived' THEN
    UPDATE public.student_request_workflow_steps
    SET status = 'completed', decision = 'archived', completed_by = COALESCE(completed_by, v_uid),
        completed_at = COALESCE(completed_at, now()), updated_at = now()
    WHERE id = v_step.id AND status IS DISTINCT FROM 'completed';
    UPDATE public.student_requests
    SET status = 'completed', updated_at = now()
    WHERE id = v_req.id AND status IS DISTINCT FROM 'completed';

    RETURN jsonb_build_object('success', true, 'idempotent', true, 'document_id', v_doc.id);
  END IF;

  IF v_doc.status IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'الأرشفة تتطلب وثيقة صادرة' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(v_doc.pdf_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'الملف الفعلي للوثيقة غير موجود' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id AND s.step_key = 'registrar_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_registrar_ok;
  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id AND s.step_key = 'dean_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_dean_ok;
  IF NOT v_registrar_ok OR NOT v_dean_ok THEN
    RAISE EXCEPTION 'التوقيعات يجب أن تكون مكتملة قبل الأرشفة' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'archived'
  ORDER BY t.is_default DESC, t.created_at LIMIT 1;
  IF v_transition.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد انتقال للنتيجة archived' USING ERRCODE = '22023';
  END IF;

  UPDATE public.official_documents
  SET status = 'archived', updated_at = now()
  WHERE id = v_doc.id AND status = 'issued';

  UPDATE public.student_request_workflow_steps
  SET status = 'completed', decision = 'archived', comment = p_comment,
      completed_by = v_uid, completed_at = now(), updated_at = now()
  WHERE id = v_step.id;

  UPDATE public.student_requests
  SET status = 'completed', updated_at = now()
  WHERE id = v_req.id;

  SELECT a.unit_id, a.role_id INTO v_actor_unit_id, v_actor_role_id
  FROM public.current_user_processing_assignments() a
  WHERE a.unit_id IS NOT DISTINCT FROM v_step.processing_unit_id LIMIT 1;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type,
    actor_user_id, actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_req.id, v_step.id, 'archived',
    v_uid,
    COALESCE(v_actor_unit_id, v_step.processing_unit_id),
    COALESCE(v_actor_role_id, v_step.processing_role_id),
    p_comment,
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'action', 'archive', 'action_result', 'archived', 'document_id', v_doc.id
    ),
    true
  );

  -- --------------------------------------------------------------------------
  -- Successful transition into archived: emit exactly one student-facing
  -- notification. Idempotency is enforced by the UNIQUE partial index
  -- above via ON CONFLICT DO NOTHING (safe under retries + concurrency).
  -- Message intentionally contains ONLY request_number and document_number:
  -- no link, no pdf_url, no verification_code, no storage path.
  -- --------------------------------------------------------------------------
  SELECT sp.user_id INTO v_student_user_id
  FROM public.student_profiles sp WHERE sp.id = v_req.student_profile_id;
  IF v_student_user_id IS NOT NULL THEN
    v_notif_title := 'اكتمل طلبك وأصبحت الوثيقة جاهزة';
    v_notif_message := 'رقم الطلب: ' || COALESCE(v_req.request_number, '')
      || ' — رقم الوثيقة: ' || COALESCE(v_doc.document_number, '');
    INSERT INTO public.notifications (
      user_id, title, message, notification_type, reference_type, reference_id
    )
    VALUES (
      v_student_user_id, v_notif_title, v_notif_message,
      'student_request_completed', 'student_request', v_req.id
    )
    ON CONFLICT (
      user_id,
      notification_type,
      reference_type,
      reference_id
    )
    WHERE notification_type = 'student_request_completed'
      AND reference_type = 'student_request'
      AND reference_id IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'idempotent', false, 'step_id', p_step_id,
    'document_id', v_doc.id, 'request_status', 'completed'
  );
END;
$function$;
