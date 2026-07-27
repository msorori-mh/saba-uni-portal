-- DRAFT ONLY — DO NOT APPLY
-- Forward-only source proposal; production apply requires separate approval.

-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-FIRST-DELIVERY / order 26
-- Source draft: docs/migration-drafts/B1-ACADEMIC-EFFECT-FUNCTIONS-01.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

CREATE OR REPLACE FUNCTION public.apply_b1_enrollment_suspension_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.enrollment_suspension_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE;
  v_level_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type<>'enrollment_suspension' OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_SUSPENSION_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='registrar_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.enrollment_suspension_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_SUSPENSION_DETAILS_REQUIRED'; END IF;
  IF v_details.effect_applied_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.student_academic_status SET enrollment_status='suspended',updated_at=now()
   WHERE student_profile_id=v_request.student_profile_id AND academic_year_id=v_details.requested_from_academic_year_id
     AND semester_id=v_details.requested_from_semester_id;
  IF NOT FOUND THEN
    SELECT level_id INTO v_level_id FROM public.student_academic_status WHERE student_profile_id=v_request.student_profile_id
      ORDER BY updated_at DESC,created_at DESC LIMIT 1;
    IF v_level_id IS NULL THEN RAISE EXCEPTION 'B1_ACADEMIC_STATUS_LEVEL_REQUIRED'; END IF;
    INSERT INTO public.student_academic_status(student_profile_id,academic_year_id,semester_id,level_id,enrollment_status)
      VALUES(v_request.student_profile_id,v_details.requested_from_academic_year_id,v_details.requested_from_semester_id,v_level_id,'suspended');
  END IF;
  UPDATE public.enrollment_suspension_details SET effect_applied_at=now(),updated_at=now() WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','enrollment_suspension','academic_year_id',v_details.requested_from_academic_year_id,'semester_id',v_details.requested_from_semester_id),true);
END $$;

CREATE OR REPLACE FUNCTION public.apply_b1_excused_absence_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.absence_excuse_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type NOT IN ('absence_excuse','excused_absence') OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='record_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.absence_excuse_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_DETAILS_REQUIRED'; END IF;
  IF v_details.record_applied_at IS NOT NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_enrollments WHERE student_profile_id=v_request.student_profile_id
    AND course_section_id=v_details.course_section_id AND enrollment_status='enrolled') THEN RAISE EXCEPTION 'B1_ACTIVE_ENROLLMENT_REQUIRED'; END IF;
  INSERT INTO public.student_excused_absences(student_profile_id,course_section_id,absence_date,reason_type,absence_excuse_request_id)
    VALUES(v_request.student_profile_id,v_details.course_section_id,v_details.absence_date,v_details.reason_type,p_request_id)
    ON CONFLICT (student_profile_id,course_section_id,absence_date) DO NOTHING;
  UPDATE public.absence_excuse_details SET record_applied_at=now(),updated_at=now() WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','excused_absence','course_section_id',v_details.course_section_id,'absence_date',v_details.absence_date),true);
END $$;

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

CREATE OR REPLACE FUNCTION public.apply_b1_file_withdrawal_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.file_withdrawal_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE; v_status_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type='file_withdrawal' IS NOT TRUE OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_FILE_WITHDRAWAL_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='registrar_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.file_withdrawal_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_details.library_cleared_at IS NULL OR v_details.labs_cleared_at IS NULL
    OR v_details.activities_cleared_at IS NULL OR v_details.finance_cleared_at IS NULL THEN RAISE EXCEPTION 'B1_FILE_WITHDRAWAL_CLEARANCES_REQUIRED'; END IF;
  IF v_details.effect_applied_at IS NOT NULL THEN RETURN; END IF;
  SELECT id INTO v_status_id FROM public.student_academic_status WHERE student_profile_id=v_request.student_profile_id
    ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE;
  IF v_status_id IS NULL THEN RAISE EXCEPTION 'B1_ACADEMIC_STATUS_REQUIRED'; END IF;
  UPDATE public.student_academic_status SET enrollment_status='withdrawn',updated_at=now() WHERE id=v_status_id;
  UPDATE public.file_withdrawal_details SET records_transferred_at=COALESCE(records_transferred_at,now()),effect_applied_at=now(),updated_at=now()
    WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','file_withdrawal','academic_status_id',v_status_id),true);
END $$;

CREATE OR REPLACE FUNCTION public.apply_b1_academic_effect_for_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request_type text; v_canonical text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT request_type INTO v_request_type FROM public.student_requests WHERE id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND'; END IF;
  v_canonical:=CASE v_request_type WHEN 'absence_excuse' THEN 'excused_absence' WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance' ELSE v_request_type END;
  CASE v_canonical
    WHEN 'enrollment_suspension' THEN PERFORM public.apply_b1_enrollment_suspension_effect(p_request_id);
    WHEN 'excused_absence' THEN PERFORM public.apply_b1_excused_absence_effect(p_request_id);
    WHEN 'department_transfer' THEN PERFORM public.apply_b1_department_transfer_effect(p_request_id);
    WHEN 'final_chance' THEN PERFORM public.apply_b1_final_chance_effect(p_request_id);
    WHEN 'file_withdrawal' THEN PERFORM public.apply_b1_file_withdrawal_effect(p_request_id);
    ELSE RAISE EXCEPTION 'B1_ACADEMIC_EFFECT_REQUEST_REQUIRED';
  END CASE;
END $$;

REVOKE ALL ON FUNCTION public.apply_b1_enrollment_suspension_effect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_b1_excused_absence_effect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_b1_department_transfer_effect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_b1_final_chance_effect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_b1_file_withdrawal_effect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_b1_academic_effect_for_request(uuid) FROM PUBLIC, anon, authenticated;
