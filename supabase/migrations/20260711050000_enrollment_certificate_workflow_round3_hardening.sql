-- STUDENT-REQUEST-ENROLLMENT-CERTIFICATE-WORKFLOW-FOUNDATION-01A — ROUND 3
-- Hardens fee workflow execution:
--   1) the actor must match the active runtime step (admin override only),
--   2) no-fee requests mark intermediate finance confirmation steps as skipped.
--
-- Requires:
--   20260711040000_enrollment_certificate_workflow_foundation_01a.sql
--
-- No seed and no production data changes are performed by this migration file.

-- =============================================================================
-- 1. assess_student_request_fee
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assess_student_request_fee(
  p_request_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount numeric(12, 2);
  v_runtime_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assessment_id uuid;
  v_payment_status text;
  v_action_result text;
  v_next_step_id uuid;
  v_next_step_order integer;
  v_visible boolean := false;
  v_event_type text;
  v_user_id uuid;
BEGIN
  PERFORM public.assert_can_assess_student_request_fee();

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  v_amount := COALESCE(p_amount, 0);
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون >= 0'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى هذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_runtime_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id
    AND s.status = 'active'
  ORDER BY s.step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد خطوة نشطة'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_runtime_step.workflow_step_id;

  IF v_config.action_type IS DISTINCT FROM 'assess_fee' THEN
    RAISE EXCEPTION 'الخطوة الحالية ليست تقييم رسوم'
      USING ERRCODE = '42501';
  END IF;

  -- Access to the request is not enough: the actor must be assigned to the
  -- currently active fee-assessment step. Admin/system_admin remain the only
  -- explicit override through is_current_user_admin_actor().
  IF NOT public.is_current_user_admin_actor()
     AND NOT public.user_matches_workflow_runtime_step(v_runtime_step.id) THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ الخطوة الحالية'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_request_fee_assessments fa
    WHERE fa.request_id = p_request_id
      AND fa.payment_status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'يوجد تقييم رسوم نشط لهذا الطلب'
      USING ERRCODE = '23505';
  END IF;

  IF v_amount = 0 THEN
    v_payment_status := 'not_required';
    v_action_result := 'fee_not_required';
    v_visible := false;
    v_event_type := 'completed';
  ELSE
    v_payment_status := 'pending_payment';
    v_action_result := 'payment_required';
    v_visible := true;
    v_event_type := 'payment_requested';
  END IF;

  INSERT INTO public.student_request_fee_assessments (
    request_id,
    amount,
    currency,
    assessed_by,
    assessed_at,
    payment_status,
    notes
  )
  VALUES (
    p_request_id,
    v_amount,
    'YER',
    v_uid,
    now(),
    v_payment_status,
    p_notes
  )
  RETURNING id INTO v_assessment_id;

  v_next_step_id := public.apply_student_request_workflow_transition(
    p_request_id,
    v_runtime_step.id,
    v_action_result,
    v_uid
  );

  -- Runtime initialization creates all workflow steps in advance. When the
  -- no-fee branch jumps over finance, mark only intermediate confirm_payment
  -- steps as skipped so they never remain pending or appear in finance inboxes.
  IF v_amount = 0 AND v_next_step_id IS NOT NULL THEN
    SELECT s.step_order INTO v_next_step_order
    FROM public.student_request_workflow_steps s
    WHERE s.id = v_next_step_id;

    WITH skipped_payment_steps AS (
      UPDATE public.student_request_workflow_steps s
      SET
        status = 'skipped',
        decision = 'skipped',
        completed_by = v_uid,
        completed_at = now(),
        comment = 'تم تجاوز خطوة المالية لعدم وجود رسوم',
        updated_at = now()
      FROM public.request_type_workflow_steps c
      WHERE s.student_request_id = p_request_id
        AND s.workflow_id = v_runtime_step.workflow_id
        AND s.workflow_step_id = c.id
        AND c.action_type = 'confirm_payment'
        AND s.status = 'pending'
        AND s.step_order > v_runtime_step.step_order
        AND s.step_order < v_next_step_order
      RETURNING
        s.id AS runtime_step_id,
        s.processing_unit_id,
        s.processing_role_id,
        s.step_key,
        s.step_order
    )
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
    SELECT
      p_request_id,
      skipped.runtime_step_id,
      'completed',
      v_uid,
      skipped.processing_unit_id,
      skipped.processing_role_id,
      'تم تجاوز خطوة المالية لعدم وجود رسوم',
      jsonb_build_object(
        'step_key', skipped.step_key,
        'step_order', skipped.step_order,
        'decision', 'skipped',
        'reason', 'fee_not_required',
        'action_result', v_action_result
      ),
      false
    FROM skipped_payment_steps skipped;
  END IF;

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
    p_request_id,
    v_runtime_step.id,
    v_event_type,
    v_uid,
    v_runtime_step.processing_unit_id,
    v_runtime_step.processing_role_id,
    CASE
      WHEN v_amount = 0 THEN 'لا رسوم مطلوبة'
      ELSE 'تم تحديد رسوم بقيمة ' || v_amount::text || ' YER'
    END,
    jsonb_build_object(
      'assessment_id', v_assessment_id,
      'amount', v_amount,
      'currency', 'YER',
      'payment_status', v_payment_status,
      'action_result', v_action_result
    ),
    v_visible
  );

  -- No payment notification is created for amount = 0.
  IF v_amount > 0 THEN
    SELECT sp.user_id INTO v_user_id
    FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = p_request_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_user_id,
        'طلب دفع رسوم',
        'تم تحديد رسوم بقيمة ' || v_amount::text || ' YER لطلبك. يرجى إتمام السداد.',
        'request',
        'student_request',
        p_request_id
      );
    END IF;
  END IF;

  PERFORM public.log_audit(
    'student_request_fee_assessment'::text,
    v_assessment_id::uuid,
    'fee_assessed'::text,
    NULL::jsonb,
    jsonb_build_object(
      'request_id', p_request_id,
      'amount', v_amount,
      'payment_status', v_payment_status
    )::jsonb,
    'Fee assessed for student request'::text,
    v_uid::uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'assessment_id', v_assessment_id,
    'amount', v_amount,
    'payment_status', v_payment_status,
    'action_result', v_action_result,
    'next_step_id', v_next_step_id,
    'notify_student', v_amount > 0
  );
END;
$$;

COMMENT ON FUNCTION public.assess_student_request_fee(uuid, numeric, text) IS
  'Assesses fee only for the assigned active assess_fee step. amount=0 skips intermediate finance confirmation runtime steps; amount>0 routes to payment.';

-- =============================================================================
-- 2. confirm_student_request_fee_payment
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_student_request_fee_payment(
  p_request_id uuid,
  p_payment_reference text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_runtime_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assessment public.student_request_fee_assessments%ROWTYPE;
  v_next_step_id uuid;
  v_ref text;
  v_user_id uuid;
BEGIN
  PERFORM public.assert_can_confirm_student_request_fee_payment();

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  v_ref := NULLIF(btrim(p_payment_reference), '');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'مرجع الدفع مطلوب'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى هذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  SELECT fa.* INTO v_assessment
  FROM public.student_request_fee_assessments fa
  WHERE fa.request_id = p_request_id
    AND fa.payment_status = 'pending_payment'
  ORDER BY fa.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يوجد تقييم رسوم بانتظار الدفع'
      USING ERRCODE = '42501';
  END IF;

  IF v_assessment.payment_confirmed_at IS NOT NULL OR v_assessment.payment_status = 'paid' THEN
    RAISE EXCEPTION 'تم تأكيد الدفع مسبقاً'
      USING ERRCODE = '23505';
  END IF;

  SELECT s.* INTO v_runtime_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id
    AND s.status = 'active'
  ORDER BY s.step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد خطوة نشطة'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_runtime_step.workflow_step_id;

  IF v_config.action_type IS DISTINCT FROM 'confirm_payment' THEN
    RAISE EXCEPTION 'الخطوة الحالية ليست تأكيد دفع'
      USING ERRCODE = '42501';
  END IF;

  -- Access to the request is not enough: the actor must be assigned to the
  -- active finance-confirmation step. Admin/system_admin remain the override.
  IF NOT public.is_current_user_admin_actor()
     AND NOT public.user_matches_workflow_runtime_step(v_runtime_step.id) THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ الخطوة الحالية'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_request_fee_assessments
  SET
    payment_status = 'paid',
    payment_confirmed_by = v_uid,
    payment_confirmed_at = now(),
    payment_reference = v_ref,
    hafiza_reference = COALESCE(hafiza_reference, v_ref),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = v_assessment.id;

  v_next_step_id := public.apply_student_request_workflow_transition(
    p_request_id,
    v_runtime_step.id,
    'payment_confirmed',
    v_uid
  );

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
    p_request_id,
    v_runtime_step.id,
    'completed',
    v_uid,
    v_runtime_step.processing_unit_id,
    v_runtime_step.processing_role_id,
    'تم تأكيد سداد الرسوم',
    jsonb_build_object(
      'assessment_id', v_assessment.id,
      'payment_reference', v_ref,
      'amount', v_assessment.amount,
      'action_result', 'payment_confirmed'
    ),
    true
  );

  SELECT sp.user_id INTO v_user_id
  FROM public.student_requests sr
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  WHERE sr.id = p_request_id;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_user_id,
      'تأكيد سداد الرسوم',
      'تم تأكيد سداد رسوم طلبك بمبلغ ' || v_assessment.amount::text || ' YER (مرجع: ' || v_ref || ').',
      'request',
      'student_request',
      p_request_id
    );
  END IF;

  PERFORM public.log_audit(
    'student_request_fee_assessment'::text,
    v_assessment.id::uuid,
    'fee_payment_confirmed'::text,
    jsonb_build_object('payment_status', 'pending_payment')::jsonb,
    jsonb_build_object(
      'payment_status', 'paid',
      'payment_reference', v_ref,
      'request_id', p_request_id
    )::jsonb,
    'Fee payment confirmed for student request'::text,
    v_uid::uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'assessment_id', v_assessment.id,
    'payment_status', 'paid',
    'payment_reference', v_ref,
    'next_step_id', v_next_step_id,
    'notify_student', true
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) IS
  'Confirms payment only for the assigned active confirm_payment runtime step.';

-- Preserve explicit authenticated-only execution grants.
REVOKE ALL ON FUNCTION public.assess_student_request_fee(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assess_student_request_fee(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) TO authenticated;
