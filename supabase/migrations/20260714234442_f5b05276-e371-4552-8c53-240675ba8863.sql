-- =============================================================================
-- ENROLLMENT-CERTIFICATE-POST-ZERO-FEE-EXECUTION-CONTRACT-REMEDIATION-01
-- G1 of PR #124 sequential apply. Functions only — no data mutation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action(p_action text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_action IN (
    'approve',
    'reject',
    'return',
    'comment',
    'request_attachment',
    'request_payment',
    'sign',
    'archive',
    'issue_document',
    'complete',
    'skip'
  );
$$;

COMMENT ON FUNCTION public.is_valid_actor_request_action(text) IS
  'Whitelist of actor actions for staff workflow steps. Includes sign '
  '(post–zero-fee enrollment certificate remediation 01).';

CREATE OR REPLACE FUNCTION public.act_on_student_request_step(
  p_step_id uuid,
  p_action text,
  p_comment text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_action_result text;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_event_type text;
  v_visible_to_student boolean := false;
  v_new_step_status text;
  v_new_request_status text;
  v_decision text;
  v_next_runtime_step_id uuid;
  v_actor_unit_id uuid;
  v_actor_role_id uuid;
  v_required_action_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_current_user_act_on_step(p_step_id, p_action) THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ هذا الإجراء على هذه الخطوة'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخطوة غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;

  IF p_action IN ('reject', 'return') AND COALESCE(btrim(p_comment), '') = '' THEN
    RAISE EXCEPTION 'التعليق مطلوب لهذا الإجراء'
      USING ERRCODE = '22023';
  END IF;

  IF p_action = 'comment' THEN
    INSERT INTO public.student_request_workflow_events (
      student_request_id,
      workflow_step_runtime_id,
      event_type,
      actor_user_id,
      actor_unit_id,
      actor_role_id,
      message_ar,
      payload,
      visible_to_student
    )
    VALUES (
      v_step.student_request_id,
      v_step.id,
      'commented',
      v_uid,
      v_step.processing_unit_id,
      v_step.processing_role_id,
      p_comment,
      COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('action', p_action),
      false
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', p_action,
      'step_id', p_step_id,
      'terminal', false
    );
  END IF;

  IF v_step.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'الخطوة ليست نشطة — لا يمكن تنفيذ الإجراء'
      USING ERRCODE = '22023';
  END IF;

  v_required_action_type := CASE p_action
    WHEN 'sign' THEN 'sign'
    WHEN 'issue_document' THEN 'issue_document'
    WHEN 'archive' THEN 'archive'
    ELSE NULL
  END;

  IF v_required_action_type IS NOT NULL THEN
    IF COALESCE(v_config.action_type, '') IS DISTINCT FROM v_required_action_type THEN
      RAISE EXCEPTION 'الإجراء % غير متوافق مع نوع الخطوة %',
        p_action, COALESCE(v_config.action_type, 'null')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_action = 'approve' AND COALESCE(v_config.action_type, '') = 'sign' THEN
    RAISE EXCEPTION 'خطوة التوقيع تتطلب إجراء sign وليس approve'
      USING ERRCODE = '22023';
  END IF;

  IF p_action = 'issue_document' THEN
    RAISE EXCEPTION
      'DOCUMENT_ISSUANCE_EXECUTION_CONTRACT_MISSING: عقد إصدار شهادة القيد من خطوة workflow غير مكتمل — لا يوجد ربط student_request_id بـ official_documents ولا مسار إصدار طلب آمن'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'archive' THEN
    RAISE EXCEPTION
      'ARCHIVE_REQUIRES_ISSUED_DOCUMENT_CONTRACT: الأرشفة متوقفة حتى يكتمل عقد إصدار الوثيقة وربطها بالطلب'
      USING ERRCODE = 'P0001';
  END IF;

  v_action_result := CASE p_action
    WHEN 'approve' THEN 'approve'
    WHEN 'reject' THEN 'reject'
    WHEN 'return' THEN 'return'
    WHEN 'request_attachment' THEN 'request_attachment'
    WHEN 'request_payment' THEN 'request_payment'
    WHEN 'skip' THEN 'skip'
    WHEN 'complete' THEN 'complete'
    WHEN 'sign' THEN 'signed'
    WHEN 'archive' THEN 'archived'
    WHEN 'issue_document' THEN 'issued'
    ELSE NULL
  END;

  IF v_action_result IS NULL THEN
    RAISE EXCEPTION 'إجراء غير مدعوم: %', p_action
      USING ERRCODE = '22023';
  END IF;

  v_event_type := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'request_attachment' THEN 'attachment_requested'
    WHEN 'request_payment' THEN 'payment_requested'
    WHEN 'sign' THEN 'signed'
    WHEN 'archive' THEN 'archived'
    WHEN 'issue_document' THEN 'document_issued'
    WHEN 'complete' THEN 'completed'
    WHEN 'skip' THEN 'approved'
    ELSE 'commented'
  END;

  v_visible_to_student := p_action IN (
    'approve', 'reject', 'return', 'request_attachment',
    'request_payment', 'complete', 'issue_document', 'sign'
  );

  v_decision := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'skip' THEN 'skipped'
    WHEN 'complete' THEN 'completed'
    WHEN 'sign' THEN 'signed'
    WHEN 'issue_document' THEN 'issued'
    WHEN 'archive' THEN 'archived'
    ELSE NULL
  END;

  IF v_step.workflow_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد workflow مرتبط بهذه الخطوة'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = v_action_result
  ORDER BY t.is_default DESC, t.created_at
  LIMIT 1;

  IF v_transition.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد انتقال للنتيجة: %', v_action_result
      USING ERRCODE = '22023';
  END IF;

  IF v_transition.to_step_id IS NOT NULL THEN
    SELECT s.id INTO v_next_runtime_step_id
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_step.student_request_id
      AND s.workflow_step_id = v_transition.to_step_id
    LIMIT 1;

    IF v_next_runtime_step_id IS NULL THEN
      RAISE EXCEPTION 'الخطوة التالية غير مهيأة في runtime — أُلغيت المعاملة دون تغيير'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_new_step_status := CASE p_action
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'skip' THEN 'skipped'
    ELSE 'completed'
  END;

  UPDATE public.student_request_workflow_steps
  SET
    status = v_new_step_status,
    decision = v_decision,
    comment = p_comment,
    completed_by = v_uid,
    completed_at = now(),
    updated_at = now()
  WHERE id = v_step.id;

  SELECT a.unit_id, a.role_id
  INTO v_actor_unit_id, v_actor_role_id
  FROM public.current_user_processing_assignments() a
  WHERE a.unit_id IS NOT DISTINCT FROM v_step.processing_unit_id
  LIMIT 1;

  v_actor_unit_id := COALESCE(v_actor_unit_id, v_step.processing_unit_id);
  v_actor_role_id := COALESCE(v_actor_role_id, v_step.processing_role_id);

  INSERT INTO public.student_request_workflow_events (
    student_request_id,
    workflow_step_runtime_id,
    event_type,
    actor_user_id,
    actor_unit_id,
    actor_role_id,
    message_ar,
    payload,
    visible_to_student
  )
  VALUES (
    v_step.student_request_id,
    v_step.id,
    v_event_type,
    v_uid,
    v_actor_unit_id,
    v_actor_role_id,
    p_comment,
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'action', p_action,
      'action_result', v_action_result,
      'previous_status', v_step.status,
      'new_step_status', v_new_step_status
    ),
    v_visible_to_student
  );

  v_new_request_status := NULL;

  IF v_transition.to_step_id IS NOT NULL THEN
    UPDATE public.student_request_workflow_steps
    SET status = 'active', entered_at = now(), updated_at = now()
    WHERE id = v_next_runtime_step_id
      AND status IS DISTINCT FROM 'active';

    INSERT INTO public.student_request_workflow_events (
      student_request_id,
      workflow_step_runtime_id,
      event_type,
      actor_user_id,
      actor_unit_id,
      actor_role_id,
      message_ar,
      payload,
      visible_to_student
    )
    VALUES (
      v_step.student_request_id,
      v_next_runtime_step_id,
      'step_entered',
      v_uid,
      NULL,
      NULL,
      'دخول خطوة جديدة',
      jsonb_build_object(
        'from_step_id', v_step.id,
        'transition_id', v_transition.id,
        'action_result', v_action_result
      ),
      false
    );
  ELSE
    v_new_request_status := CASE p_action
      WHEN 'reject' THEN 'rejected'
      WHEN 'complete' THEN 'completed'
      WHEN 'issue_document' THEN 'completed'
      WHEN 'archive' THEN 'archived'
      ELSE 'completed'
    END;

    UPDATE public.student_requests
    SET status = v_new_request_status, updated_at = now()
    WHERE id = v_step.student_request_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'action_result', v_action_result,
    'step_id', p_step_id,
    'next_step_id', v_next_runtime_step_id,
    'request_status', v_new_request_status,
    'transition_applied', true,
    'terminal', v_transition.to_step_id IS NULL
  );
END;
$$;

COMMENT ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb) IS
  'Staff workflow actor. Maps sign→signed with fail-closed transitions. '
  'issue_document/archive raise DOCUMENT_ISSUANCE / ARCHIVE contract HOLD '
  'until request-scoped enrollment_certificate issuance exists. '
  'auth.uid() required; no service-role auth bypass.';

REVOKE ALL ON FUNCTION public.is_valid_actor_request_action(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_actor_request_action(text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb)
  TO authenticated;