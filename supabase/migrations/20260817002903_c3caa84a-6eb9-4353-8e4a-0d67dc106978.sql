CREATE OR REPLACE FUNCTION public.p1_apply_final_result_decision(
  p_request uuid, p_final_result numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_details public.grade_appeal_details%ROWTYPE;
  v_actor   uuid := auth.uid();
  v_max     numeric;
  v_prev    numeric;
BEGIN
  PERFORM public.p1_assert_step_actor(p_request, 'registrar_apply_result', v_actor);

  SELECT * INTO v_details
  FROM public.grade_appeal_details
  WHERE request_id = p_request
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_DETAILS_MISSING' USING ERRCODE = 'check_violation';
  END IF;

  IF v_details.result_change_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'ALREADY_APPLIED');
  END IF;

  SELECT r.total, r.max_total INTO v_prev, v_max
  FROM public.p1_enrollment_result(v_details.student_enrollment_id) r;

  IF v_max IS NULL OR v_max <= 0 THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_NO_PUBLISHED_RESULT' USING ERRCODE = 'check_violation';
  END IF;
  IF p_final_result IS NULL OR p_final_result < 0 OR p_final_result > v_max THEN
    RAISE EXCEPTION 'FINAL_RESULT_OUT_OF_RANGE' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.grade_appeal_details
     SET previous_final_result    = v_prev,
         approved_final_result    = p_final_result,
         result_change_applied_at = now(),
         result_change_applied_by = v_actor,
         notes = COALESCE(p_note, notes)
   WHERE id = v_details.id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action_type, actor_user_id, new_values)
  VALUES (
    'grade_appeal_details', v_details.id, 'apply_final_result', v_actor,
    jsonb_build_object(
      'request_id', p_request,
      'student_enrollment_id', v_details.student_enrollment_id,
      'previous_final_result', v_prev,
      'approved_final_result', p_final_result,
      'max_total', v_max
    )
  );

  RETURN jsonb_build_object(
    'applied', true,
    'previous_final_result', v_prev,
    'approved_final_result', p_final_result
  );
END
$function$;