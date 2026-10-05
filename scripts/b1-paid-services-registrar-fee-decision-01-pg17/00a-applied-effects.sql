-- GENERATED — verbatim extract of supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- (apply_b1_department_transfer_effect + apply_b1_final_chance_effect). Do not edit; a test keeps it in sync.
CREATE OR REPLACE FUNCTION public.apply_b1_department_transfer_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.transfer_request_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE;
  v_old_department uuid; v_old_program uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type NOT IN ('transfer','department_transfer') OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_TRANSFER_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='registrar_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.transfer_request_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_TRANSFER_DETAILS_REQUIRED'; END IF;
  IF v_details.effect_applied_at IS NOT NULL THEN RETURN; END IF;
  SELECT department_id,program_id INTO v_old_department,v_old_program FROM public.student_profiles WHERE id=v_request.student_profile_id FOR UPDATE;
  UPDATE public.transfer_request_details SET previous_department_id=COALESCE(previous_department_id,v_old_department),
    previous_program_id=COALESCE(previous_program_id,v_old_program),updated_at=now() WHERE request_id=p_request_id;
  PERFORM set_config('app.bypass_student_lock','1',true);
  UPDATE public.student_profiles SET department_id=COALESCE(v_details.requested_department_id,department_id),
    program_id=v_details.requested_program_id,updated_at=now() WHERE id=v_request.student_profile_id;
  UPDATE public.transfer_request_details SET effect_applied_at=now(),updated_at=now() WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','department_transfer','old_department_id',v_old_department,'old_program_id',v_old_program,
        'new_department_id',COALESCE(v_details.requested_department_id,v_old_department),'new_program_id',v_details.requested_program_id),true);
END $$;
CREATE OR REPLACE FUNCTION public.apply_b1_final_chance_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.extra_chance_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type NOT IN ('extra_chance','final_chance') OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='registrar_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.extra_chance_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_details.academic_year_id IS NULL OR v_details.semester_id IS NULL OR v_details.chance_type IS NULL
    OR btrim(COALESCE(v_details.reason,''))='' THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_DETAILS_REQUIRED'; END IF;
  IF v_details.chance_applied_at IS NOT NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.semesters WHERE id=v_details.semester_id AND academic_year_id=v_details.academic_year_id)
    OR NOT EXISTS (SELECT 1 FROM public.student_academic_status WHERE student_profile_id=v_request.student_profile_id
      AND academic_year_id=v_details.academic_year_id AND semester_id=v_details.semester_id AND enrollment_status='active')
    THEN RAISE EXCEPTION 'B1_FINAL_CHANCE_ACADEMIC_STATUS_REQUIRED'; END IF;
  INSERT INTO public.student_extra_chances(student_profile_id,request_id,academic_year_id,semester_id,chance_type,reason,approved_by,approved_at)
    VALUES(v_request.student_profile_id,p_request_id,v_details.academic_year_id,v_details.semester_id,v_details.chance_type,v_details.reason,v_uid,now());
  UPDATE public.extra_chance_details SET chance_applied_at=now(),updated_at=now() WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','final_chance','academic_year_id',v_details.academic_year_id,'semester_id',v_details.semester_id),true);
END $$;
