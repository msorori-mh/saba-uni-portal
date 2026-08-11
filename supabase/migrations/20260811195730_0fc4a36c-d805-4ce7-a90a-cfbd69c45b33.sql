CREATE OR REPLACE FUNCTION public.apply_b1_academic_effect_for_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_type text;
  v_canonical text;
  v_workflow_id uuid;
  v_action_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000';
  END IF;
  IF current_setting('b1.atomic_action', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT request_type INTO v_request_type FROM public.student_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND'; END IF;

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type END;

  -- Configuration first: use the effect action bound to this request's pinned workflow.
  v_workflow_id := public.student_request_pinned_workflow_id(p_request_id);

  IF v_workflow_id IS NOT NULL THEN
    SELECT s.action_code
    INTO v_action_code
    FROM public.request_type_workflow_steps s
    JOIN public.request_workflow_action_catalog a ON a.code = s.action_code
    WHERE s.workflow_id = v_workflow_id
      AND a.kind = 'effect'
      AND a.is_active = true
    ORDER BY s.step_order
    LIMIT 1;
  END IF;

  IF v_action_code IS NOT NULL THEN
    PERFORM public.apply_configured_action_effect(p_request_id, v_action_code);
    RETURN;
  END IF;

  -- Fallback: unchanged built-in mapping while services are still unbound.
  CASE v_canonical
    WHEN 'enrollment_suspension' THEN PERFORM public.apply_b1_enrollment_suspension_effect(p_request_id);
    WHEN 'excused_absence' THEN PERFORM public.apply_b1_excused_absence_effect(p_request_id);
    WHEN 'department_transfer' THEN PERFORM public.apply_b1_department_transfer_effect(p_request_id);
    WHEN 'final_chance' THEN PERFORM public.apply_b1_final_chance_effect(p_request_id);
    WHEN 'file_withdrawal' THEN PERFORM public.apply_b1_file_withdrawal_effect(p_request_id);
    ELSE RAISE EXCEPTION 'B1_ACADEMIC_EFFECT_REQUEST_REQUIRED';
  END CASE;
END;
$$;