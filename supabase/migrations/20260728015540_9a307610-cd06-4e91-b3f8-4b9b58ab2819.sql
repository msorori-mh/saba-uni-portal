-- SOURCE-ONLY DRAFT - NOT APPLIED TO PRODUCTION
-- Track: PORTAL-B1-PAYMENT-CONFIRMATION-AUTHORIZATION-HARDENING-01 / order 28
-- Forward-only. Requires explicit single-migration approval before apply.
-- Companion preflight/post-verifier:
--   docs/migration-drafts/b1-backend-verifiers/28-B1_28_PAYMENT_CONFIRMATION_AUTHORIZATION_HARDENING_01-PREFLIGHT.sql
--   docs/migration-drafts/b1-backend-verifiers/28-B1_28_PAYMENT_CONFIRMATION_AUTHORIZATION_HARDENING_01-POST-VERIFIER.sql
--
-- PURPOSE
-- Remove the payment-confirmation authorization bypasses for B1 canonical
-- services only:
--   * is_current_user_admin_actor() early RETURN in the assert helper
--   * has_any_role(revenue_finance_officer|finance_officer) without any runtime
--     assignment
--   * is_current_user_admin_actor() OR user_matches_workflow_runtime_step()
--     step check (admin bypass of the runtime assignee)
-- B1 payment confirmation now routes through the SAME central contract used by
-- act_on_b1_student_request_step_atomic:
--     public.can_current_user_act_on_step(step_id, 'confirm_payment')
-- which already enforces: active step, exactly one assignment identity, direct
-- assignee match, exact processing unit/role binding, config<->runtime
-- correspondence, predecessors satisfied, B1 runtime step contract and a
-- single resolving transition. No duplicated authorization logic is introduced.
--
-- NON-B1 IMPACT: none. The legacy branch keeps the applied behaviour verbatim
-- (assert_can_confirm_student_request_fee_payment + admin/assignee check), so
-- enrollment_certificate and every other non-B1 service are untouched. The
-- assert helper itself is intentionally NOT modified, because it is the legacy
-- contract; B1 simply no longer calls it.

CREATE OR REPLACE FUNCTION public.confirm_student_request_fee_payment(
  p_request_id uuid,
  p_payment_reference text,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_runtime_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assessment public.student_request_fee_assessments%ROWTYPE;
  v_request public.student_requests%ROWTYPE;
  v_canonical text;
  v_is_b1 boolean := false;
  v_active_count integer;
  v_transition_count integer;
  v_next_step_id uuid;
  v_ref text;
  v_user_id uuid;
BEGIN
  -- (1) authenticated
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'معرّف الطلب مطلوب' USING ERRCODE = '22023'; END IF;
  v_ref := NULLIF(btrim(p_payment_reference), '');
  IF v_ref IS NULL THEN RAISE EXCEPTION 'مرجع الدفع مطلوب' USING ERRCODE = '22023'; END IF;

  SELECT r.* INTO v_request FROM public.student_requests r WHERE r.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- (2) B1 canonical scope resolution (stored aliases included)
  v_is_b1 := public.is_b1_stored_request_type(v_request.request_type);
  v_canonical := CASE v_request.request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request.request_type
  END;

  IF NOT v_is_b1 THEN
    -- LEGACY (non-B1) PATH - preserved verbatim.
    PERFORM public.assert_can_confirm_student_request_fee_payment();
    IF NOT public.can_current_user_access_request(p_request_id) THEN
      RAISE EXCEPTION 'غير مصرح بالوصول إلى هذا الطلب' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- B1 PATH - strict direct-assignee only; every broad-role bypass removed.
    -- (9) expected request status: a payment step can only exist on a live request.
    IF v_request.status NOT IN ('submitted', 'in_progress', 'under_review', 'pending_payment') THEN
      RAISE EXCEPTION 'B1_REQUEST_STATUS_NOT_ACTIONABLE:%', v_request.status USING ERRCODE = '42501';
    END IF;
    IF public.is_owner_of_request(v_uid, p_request_id) THEN
      RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Active runtime step (3)
  SELECT s.* INTO v_runtime_step FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id AND s.status = 'active'
  ORDER BY s.step_order LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'لا توجد خطوة نشطة' USING ERRCODE = '42501'; END IF;

  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c
  WHERE c.id = v_runtime_step.workflow_step_id;
  IF v_config.action_type IS DISTINCT FROM 'confirm_payment' THEN
    RAISE EXCEPTION 'الخطوة الحالية ليست تأكيد دفع' USING ERRCODE = '42501';
  END IF;

  IF v_is_b1 THEN
    -- (4)(5)(6)(7) single central contract: direct assignee only, exactly one
    -- assignment identity, exact unit/role binding, config<->runtime match,
    -- predecessors satisfied, one resolving transition.
    IF NOT public.can_current_user_act_on_step(v_runtime_step.id, 'confirm_payment') THEN
      RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps prior
      WHERE prior.student_request_id = v_runtime_step.student_request_id
        AND prior.step_order < v_runtime_step.step_order
        AND prior.status NOT IN ('completed', 'skipped')
    ) THEN
      RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_runtime_step.workflow_id
      AND t.from_step_id = v_runtime_step.workflow_step_id
      AND t.action_result = 'payment_confirmed';
    IF v_transition_count <> 1 THEN
      RAISE EXCEPTION 'B1_TRANSITION_MUST_RESOLVE_ONCE:%', v_transition_count;
    END IF;
  ELSE
    -- LEGACY step check preserved verbatim (admin actor allowed off the B1 path).
    IF NOT public.is_current_user_admin_actor()
       AND NOT public.user_matches_workflow_runtime_step(v_runtime_step.id) THEN
      RAISE EXCEPTION 'غير مصرح بتنفيذ الخطوة الحالية' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- (8) fee assessment prerequisite + (10) idempotency.
  -- Authorization is fully resolved above, so a replay can never leak state to
  -- an unauthorized caller.
  SELECT fa.* INTO v_assessment FROM public.student_request_fee_assessments fa
  WHERE fa.request_id = p_request_id AND fa.payment_status = 'paid'
    AND fa.payment_reference = v_ref
  ORDER BY fa.payment_confirmed_at DESC NULLS LAST LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'assessment_id', v_assessment.id,
      'payment_status', 'paid', 'payment_reference', v_ref,
      'next_step_id', NULL, 'notify_student', false, 'idempotent_replay', true);
  END IF;

  SELECT fa.* INTO v_assessment FROM public.student_request_fee_assessments fa
  WHERE fa.request_id = p_request_id AND fa.payment_status = 'pending_payment'
  ORDER BY fa.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'لا يوجد تقييم رسوم بانتظار الدفع' USING ERRCODE = '42501'; END IF;

  IF v_assessment.payment_confirmed_at IS NOT NULL OR v_assessment.payment_status = 'paid' THEN
    RAISE EXCEPTION 'تم تأكيد الدفع مسبقاً' USING ERRCODE = '23505';
  END IF;

  UPDATE public.student_request_fee_assessments
  SET payment_status = 'paid', payment_confirmed_by = v_uid, payment_confirmed_at = now(),
    payment_reference = v_ref, hafiza_reference = COALESCE(hafiza_reference, v_ref),
    notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE id = v_assessment.id;

  v_next_step_id := public.apply_student_request_workflow_transition(
    p_request_id, v_runtime_step.id, 'payment_confirmed', v_uid);

  -- Exactly one active step must remain (or none on a terminal transition).
  IF v_is_b1 THEN
    SELECT count(*) INTO v_active_count FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = p_request_id AND s.status = 'active';
    IF v_active_count <> (CASE WHEN v_next_step_id IS NULL THEN 0 ELSE 1 END) THEN
      RAISE EXCEPTION 'B1_ACTIVE_STEP_INVARIANT_FAILED';
    END IF;
  END IF;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    p_request_id, v_runtime_step.id, 'completed', v_uid,
    v_runtime_step.processing_unit_id, v_runtime_step.processing_role_id,
    'تم تأكيد سداد الرسوم',
    jsonb_build_object('assessment_id', v_assessment.id, 'payment_reference', v_ref,
      'amount', v_assessment.amount, 'action_result', 'payment_confirmed'),
    true
  );

  SELECT sp.user_id INTO v_user_id FROM public.student_requests sr
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id WHERE sr.id = p_request_id;
  IF v_user_id IS NOT NULL THEN
    PERFORM public.create_notification(v_user_id, 'تأكيد سداد الرسوم',
      'تم تأكيد سداد رسوم طلبك بمبلغ ' || v_assessment.amount::text || ' YER (مرجع: ' || v_ref || ').',
      'request', 'student_request', p_request_id);
  END IF;

  PERFORM public.log_audit('student_request_fee_assessment'::text, v_assessment.id::uuid,
    'fee_payment_confirmed'::text,
    jsonb_build_object('payment_status', 'pending_payment')::jsonb,
    jsonb_build_object('payment_status', 'paid', 'payment_reference', v_ref,
      'request_id', p_request_id, 'b1_strict', v_is_b1)::jsonb,
    'Fee payment confirmed for student request'::text, v_uid::uuid);

  RETURN jsonb_build_object('success', true, 'assessment_id', v_assessment.id,
    'payment_status', 'paid', 'payment_reference', v_ref,
    'next_step_id', v_next_step_id, 'notify_student', true,
    'idempotent_replay', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) TO service_role;