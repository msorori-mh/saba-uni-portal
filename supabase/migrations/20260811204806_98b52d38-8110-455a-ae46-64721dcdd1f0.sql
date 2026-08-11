CREATE OR REPLACE FUNCTION public.b1_runtime_step_contract_ok(
  p_service_code text, p_workflow_id uuid, p_step_key text,
  p_unit_code text, p_role_code text, p_action_type text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF public.is_b1_runtime_step_contract_configured(
       p_workflow_id, p_step_key, p_unit_code, p_role_code, p_action_type) THEN
    RETURN true;
  END IF;
  IF public.b1_legacy_fallback_enabled(p_service_code) THEN
    RETURN public.is_valid_b1_runtime_step_contract(
      p_service_code, p_step_key, p_unit_code, p_role_code, p_action_type);
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)
  TO authenticated, service_role;

DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'initialize_b1_request_workflow_strict'
     AND pronamespace = 'public'::regnamespace;

  v_def := replace(v_def,
    'public.is_valid_b1_runtime_step_contract(p_canonical_code,s.step_key,u.code,r.code,c.action_type)',
    'public.b1_runtime_step_contract_ok(p_canonical_code,s.workflow_id,s.step_key,u.code,r.code,c.action_type)');

  v_def := replace(v_def,
    'public.is_valid_b1_runtime_step_contract(
      p_canonical_code,v_config.step_key,v_unit_code,v_role_code,v_config.action_type
    )',
    'public.b1_runtime_step_contract_ok(
      p_canonical_code,v_workflow.id,v_config.step_key,v_unit_code,v_role_code,v_config.action_type
    )');

  IF position('is_valid_b1_runtime_step_contract' in v_def) > 0 THEN
    RAISE EXCEPTION 'B1_INITIALIZER_PATCH_INCOMPLETE';
  END IF;

  EXECUTE v_def;
END;
$mig$;

CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical_request_type text;
  v_is_b1 boolean := false;
  v_unit_code text;
  v_role_code text;
  v_transition_count integer;
  v_has_binding boolean := false;
  v_has_e2e boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_valid_actor_request_action(p_action) THEN RETURN false; END IF;

  SELECT * INTO v_step FROM public.student_request_workflow_steps WHERE id = p_step_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN RETURN false; END IF;

  v_is_b1 := public.is_b1_stored_request_type(v_request_type);
  v_canonical_request_type := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  IF v_is_b1 AND (
    v_step.status IS DISTINCT FROM 'active'
    OR num_nonnulls(
      v_step.assigned_user_id,
      v_step.assigned_staff_profile_id,
      v_step.assigned_faculty_profile_id,
      v_step.assigned_position_assignment_id
    ) IS DISTINCT FROM 1
  ) THEN RETURN false; END IF;

  IF public.is_owner_of_request(v_uid, v_step.student_request_id) THEN RETURN false; END IF;

  IF v_step.status NOT IN ('active', 'pending') THEN
    IF p_action = 'comment' AND v_step.status = 'completed' THEN
      RETURN public.user_matches_workflow_runtime_step(p_step_id);
    END IF;
    RETURN false;
  END IF;

  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN RETURN false; END IF;

  IF v_is_b1 THEN
    v_has_binding := public.current_user_has_exact_processing_binding(
      v_step.processing_unit_id, v_step.processing_role_id
    );
    v_has_e2e := public.current_user_has_b1_e2e_88_actor_binding(
      v_step.student_request_id, p_step_id, p_action
    );
    IF NOT v_has_binding AND NOT v_has_e2e THEN
      RETURN false;
    END IF;
  END IF;

  IF v_canonical_request_type = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval', 'target_department_head_approval')
     AND NOT public.current_user_matches_transfer_department_scope(p_step_id, v_step.step_key) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_config FROM public.request_type_workflow_steps
    WHERE id = v_step.workflow_step_id;

  IF v_is_b1 THEN
    SELECT * INTO v_config FROM public.request_type_workflow_steps
      WHERE id = v_step.workflow_step_id AND workflow_id = v_step.workflow_id;
    IF NOT FOUND
      OR v_config.step_key IS DISTINCT FROM v_step.step_key
      OR v_config.step_order IS DISTINCT FROM v_step.step_order
      OR v_config.processing_unit_id IS DISTINCT FROM v_step.processing_unit_id
      OR v_config.processing_role_id IS DISTINCT FROM v_step.processing_role_id THEN
      RETURN false;
    END IF;

    IF NOT public.workflow_runtime_predecessors_satisfied(p_step_id) THEN RETURN false; END IF;

    SELECT u.code, pr.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles pr ON pr.id = v_step.processing_role_id
    WHERE u.id = v_step.processing_unit_id;
    IF NOT public.b1_runtime_step_contract_ok(
      v_canonical_request_type, v_step.workflow_id, v_step.step_key,
      v_unit_code, v_role_code, v_config.action_type
    ) THEN RETURN false; END IF;

    IF p_action = v_config.action_type THEN
      RETURN public.resolve_b1_workflow_transition_safe(
        v_step.workflow_id,
        v_step.workflow_step_id,
        CASE v_config.action_type
          WHEN 'review' THEN 'reviewed' WHEN 'approve' THEN 'approved'
          WHEN 'apply_decision' THEN 'applied' WHEN 'clear' THEN 'cleared'
          WHEN 'archive' THEN 'archived' WHEN 'confirm_payment' THEN 'payment_confirmed'
          WHEN 'sign' THEN 'signed' WHEN 'issue_document' THEN 'issued' END,
        v_step.student_request_id
      ) IS NOT NULL;
    ELSIF p_action = 'skip' THEN
      SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id = v_step.workflow_id AND t.from_step_id = v_step.workflow_step_id
          AND t.action_result = 'skip';
      RETURN COALESCE(v_config.can_skip, false) AND v_transition_count = 1;
    END IF;
    RETURN false;
  END IF;

  IF p_action = 'skip' THEN
    IF v_config.id IS NULL OR NOT COALESCE(v_config.can_skip, false) THEN RETURN false; END IF;
    RETURN true;
  END IF;

  IF p_action = 'reject' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_reject, true) THEN
    RETURN false;
  END IF;

  IF p_action = 'return' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_return_to_student, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;