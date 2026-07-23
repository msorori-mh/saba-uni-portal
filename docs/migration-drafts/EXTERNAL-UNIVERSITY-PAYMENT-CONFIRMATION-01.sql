-- EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01
-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Migration 1/3. Constraint vocabulary + specialized exact-assignee RPC only.
-- The active payment_confirmation runtime step is awaiting_payment_confirmation.
-- Existing runtime step/event columns record actor, time, optional note and audit.

ALTER TABLE public.request_type_workflow_steps
  DROP CONSTRAINT IF EXISTS request_type_workflow_steps_action_type_chk;
-- Replacement vocabulary is a strict superset of the currently applied
-- constraint (20260711195110): 'assess_fee' is retained because the live
-- fee-assessment workflow requires it; 'clear' and
-- 'apply_decision' are the only additions.
ALTER TABLE public.request_type_workflow_steps
  ADD CONSTRAINT request_type_workflow_steps_action_type_chk
  CHECK (action_type IN (
    'review','approve','reject','comment','return_to_student','request_attachment',
    'request_payment','assess_fee','confirm_payment','archive','issue_document','complete',
    'sign','clear','apply_decision'
  ));

ALTER TABLE public.request_type_workflow_transitions
  DROP CONSTRAINT IF EXISTS request_type_workflow_transitions_action_result_chk;
ALTER TABLE public.request_type_workflow_transitions
  ADD CONSTRAINT request_type_workflow_transitions_action_result_chk
  CHECK (action_result IN (
    'submit','approve','approved','reject','return','request_attachment',
    'request_payment','fee_not_required','payment_required','payment_confirmed',
    'signed','issued','archived','reviewed','cleared','applied','skip','complete','cancel'
  ));

ALTER TABLE public.student_request_workflow_steps
  DROP CONSTRAINT IF EXISTS student_request_workflow_steps_decision_chk;
ALTER TABLE public.student_request_workflow_steps
  ADD CONSTRAINT student_request_workflow_steps_decision_chk
  CHECK (decision IS NULL OR decision IN (
    'approved','rejected','returned','skipped','completed','signed','issued',
    'archived','reviewed','cleared','applied','payment_confirmed','payment_not_confirmed'
  ));

ALTER TABLE public.student_request_workflow_events
  DROP CONSTRAINT IF EXISTS student_request_workflow_events_event_type_chk;
ALTER TABLE public.student_request_workflow_events
  ADD CONSTRAINT student_request_workflow_events_event_type_chk
  CHECK (event_type IN (
    'created','submitted','step_entered','assigned','commented','approved','rejected',
    'returned','attachment_requested','payment_requested','payment_confirmed',
    'payment_not_confirmed','reviewed','cleared','applied','signed','archived',
    'document_issued','completed','cancelled'
  ));

CREATE OR REPLACE FUNCTION public.record_external_university_payment_confirmation(
  p_step_id uuid,
  p_status text,
  p_note text DEFAULT NULL
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
  v_request_type text;
  v_unit_code text;
  v_role_code text;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_next_step_id uuid;
  v_direct_count integer;
  v_transition_count integer;
  v_actor_matches boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  PERFORM set_config('b1.specialized_action', '1', true);
  IF p_status NOT IN ('payment_confirmed', 'payment_not_confirmed') THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_PAYMENT_CONFIRMATION_STATUS' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND char_length(btrim(p_note)) > 2000 THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  -- Lock before authorization: the assignee and active state cannot change
  -- between authorization and mutation.
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.request_type, u.code, pr.code
  INTO v_request_type, v_unit_code, v_role_code
  FROM public.student_requests r
  LEFT JOIN public.request_processing_units u ON u.id = v_step.processing_unit_id
  LEFT JOIN public.request_processing_roles pr ON pr.id = v_step.processing_role_id
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  -- transfer and extra_chance are historical stored-code aliases for the two
  -- approved canonical services; they do not broaden the service policy.
  IF v_request_type NOT IN ('department_transfer','transfer','final_chance','extra_chance') THEN
    RAISE EXCEPTION 'REQUEST_TYPE_NOT_EXTERNAL_PAYMENT_SERVICE' USING ERRCODE = '22023';
  END IF;
  IF v_step.status IS DISTINCT FROM 'active'
     OR v_step.step_key IS DISTINCT FROM 'payment_confirmation'
     OR v_unit_code IS DISTINCT FROM 'finance'
     OR v_role_code IS DISTINCT FROM 'revenue_finance_officer' THEN
    RAISE EXCEPTION 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;
  IF NOT FOUND OR v_config.action_type IS DISTINCT FROM 'confirm_payment' THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_ACTION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  -- Direct assignment is mandatory and exclusive. No role-pool helper is called.
  v_direct_count := num_nonnulls(
    v_step.assigned_user_id,
    v_step.assigned_staff_profile_id,
    v_step.assigned_faculty_profile_id,
    v_step.assigned_position_assignment_id
  );
  IF v_direct_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_actor_matches :=
    v_step.assigned_user_id = v_uid
    OR EXISTS (SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = v_step.assigned_staff_profile_id AND sp.user_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.faculty_profiles fp
      WHERE fp.id = v_step.assigned_faculty_profile_id AND fp.user_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.position_assignments pa
      WHERE pa.id = v_step.assigned_position_assignment_id
        AND pa.user_id = v_uid AND pa.is_active = true
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE));
  IF NOT COALESCE(v_actor_matches, false) THEN
    RAISE EXCEPTION 'DIRECT_PAYMENT_ASSIGNEE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_has_exact_processing_binding(
    v_step.processing_unit_id, v_step.processing_role_id
  ) THEN
    RAISE EXCEPTION 'EXACT_FINANCE_PROCESSING_BINDING_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- A negative verification is audited but never completes or advances the step.
  IF p_status = 'payment_not_confirmed' THEN
    UPDATE public.student_request_workflow_steps
    SET decision = 'payment_not_confirmed', comment = NULLIF(btrim(p_note), ''),
        updated_at = now()
    WHERE id = v_step.id;

    INSERT INTO public.student_request_workflow_events (
      student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
      actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
    ) VALUES (
      v_step.student_request_id, v_step.id, 'payment_not_confirmed', v_uid,
      v_step.processing_unit_id, v_step.processing_role_id, NULLIF(btrim(p_note), ''),
      jsonb_build_object('action','confirm_payment','action_result','payment_not_confirmed'), true
    );

    RETURN jsonb_build_object(
      'success', true, 'status', 'payment_not_confirmed',
      'request_id', v_step.student_request_id, 'step_id', v_step.id,
      'transition_applied', false
    );
  END IF;

  SELECT count(*) INTO v_transition_count
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'payment_confirmed';
  IF v_transition_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'payment_confirmed'
  ORDER BY t.is_default DESC, t.created_at
  LIMIT 1;
  IF v_transition.id IS NULL OR v_transition.to_step_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMED_TRANSITION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_next_step_id
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = v_step.student_request_id
    AND s.workflow_step_id = v_transition.to_step_id
    AND s.status = 'pending'
  FOR UPDATE;
  IF v_next_step_id IS NULL THEN
    RAISE EXCEPTION 'NEXT_PAYMENT_WORKFLOW_STEP_NOT_READY' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.student_request_workflow_steps
  SET status = 'completed', decision = 'payment_confirmed',
      comment = NULLIF(btrim(p_note), ''), completed_by = v_uid,
      completed_at = now(), updated_at = now()
  WHERE id = v_step.id;

  UPDATE public.student_request_workflow_steps
  SET status = 'active', entered_at = now(), updated_at = now()
  WHERE id = v_next_step_id AND status = 'pending';

  -- This is a non-terminal transition. The request remains under_review;
  -- only the active runtime step changes, matching act_on_student_request_step.

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_step.student_request_id, v_step.id, 'payment_confirmed', v_uid,
    v_step.processing_unit_id, v_step.processing_role_id, NULLIF(btrim(p_note), ''),
    jsonb_build_object('action','confirm_payment','action_result','payment_confirmed'), true
  );

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_step.student_request_id, v_next_step_id, 'step_entered', v_uid,
    NULL, NULL, NULL,
    jsonb_build_object('from_step_id',v_step.id,'transition_id',v_transition.id,'action_result','payment_confirmed'),
    false
  );

  RETURN jsonb_build_object(
    'success', true, 'status', 'payment_confirmed',
    'request_id', v_step.student_request_id, 'step_id', v_step.id,
    'next_step_id', v_next_step_id, 'transition_applied', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_external_university_payment_confirmation(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.record_external_university_payment_confirmation(uuid, text, text) IS
  'Exact direct-assignee external university receipt confirmation. No role-pool/admin/registrar/dean bypass, client payload, or portal financial data.';
