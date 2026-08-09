-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-16
-- CANONICAL 36 FUNCTIONS FIXTURE
--
-- Built ONLY from exact final effective migration definitions in repository.
-- No stubs, no semantic rewrite, no manual simplification, no hash adjustment,
-- no formatting tricks designed solely to hit a digest.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Signature: public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)
-- Source:    supabase/migrations/20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql
-- Frozen:    10f065422577aac2caefbbd6fc70286d757e9c58fc8a6019141f962180f5ff7c
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(p_step_id uuid, p_action text, p_comment text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE; v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_result text; v_next_id uuid; v_transition_count integer; v_request_type text; v_canonical text;
  v_action text;
BEGIN
  PERFORM set_config('b1.atomic_action','1',true);
  LOCK TABLE public.request_type_workflow_transitions IN SHARE MODE;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id=p_step_id FOR UPDATE;
  IF NOT FOUND OR v_step.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'B1_ACTIVE_STEP_REQUIRED'; END IF;
  SELECT r.request_type INTO v_request_type FROM public.student_requests r WHERE r.id=v_step.student_request_id FOR UPDATE;
  v_canonical:=CASE v_request_type WHEN 'absence_excuse' THEN 'excused_absence' WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance' ELSE v_request_type END;
  IF v_canonical NOT IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
    THEN RAISE EXCEPTION 'B1_REQUEST_REQUIRED'; END IF;
  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c WHERE c.id=v_step.workflow_step_id FOR SHARE;
  -- B1 LITERAL ACTION CONTRACT (66): the caller MUST send the configured
  -- action_type verbatim. The former UI-compatibility translation
  -- (the legacy UI-action mapper folded action_type onto p_action) allowed 'approve'
  -- to stand in for clear / apply_decision / archive and is removed. No alias,
  -- no fallback, no exception.
  --
  -- AUTHORIZATION BEFORE ACTION ORACLE (68): the literal-action comparison is
  -- evaluated ONLY after the caller has fully passed authorization for this
  -- runtime step. Authorization is probed with the CONFIGURED action_type — never
  -- with the caller-supplied p_action — so an unauthorized principal can neither
  -- learn the configured action from the error text nor reach the mismatch branch.
  v_action := p_action;
  IF NOT public.can_current_user_act_on_step(p_step_id, COALESCE(v_config.action_type,'')) THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id=v_step.student_request_id AND prior.step_order<v_step.step_order
      AND prior.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  -- authorized assignee only from here on: literal configured-action enforcement
  IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN
    RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF v_action IN ('confirm_payment','issue_document','sign') THEN RAISE EXCEPTION 'B1_SPECIALIZED_ACTION_RPC_REQUIRED'; END IF;

  IF COALESCE(p_payload,'{}'::jsonb)<>'{}'::jsonb THEN RAISE EXCEPTION 'B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN'; END IF;
  v_result:=CASE v_action WHEN 'review' THEN 'reviewed' WHEN 'approve' THEN 'approved'
    WHEN 'clear' THEN 'cleared' WHEN 'apply_decision' THEN 'applied' WHEN 'archive' THEN 'archived'
    WHEN 'reject' THEN 'reject' WHEN 'return' THEN 'return' ELSE NULL END;
  IF v_result IS NULL THEN RAISE EXCEPTION 'B1_ACTION_NOT_SUPPORTED'; END IF;
  IF v_action IN ('reject','return') AND COALESCE(btrim(p_comment),'')='' THEN RAISE EXCEPTION 'B1_COMMENT_REQUIRED'; END IF;
  SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id=v_step.workflow_id AND t.from_step_id=v_step.workflow_step_id AND t.action_result=v_result;
  IF v_transition_count<>1 THEN RAISE EXCEPTION 'B1_TRANSITION_MUST_RESOLVE_ONCE:%',v_transition_count; END IF;
  SELECT t.* INTO v_transition FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id=v_step.workflow_id AND t.from_step_id=v_step.workflow_step_id AND t.action_result=v_result FOR SHARE;
  IF v_transition.to_step_id IS NOT NULL THEN
    SELECT count(*),(array_agg(s.id ORDER BY s.id))[1] INTO v_transition_count,v_next_id
    FROM public.student_request_workflow_steps s WHERE s.student_request_id=v_step.student_request_id
      AND s.workflow_step_id=v_transition.to_step_id AND s.status='pending';
    IF v_transition_count<>1 THEN RAISE EXCEPTION 'B1_NEXT_RUNTIME_STEP_MUST_RESOLVE_ONCE:%',v_transition_count; END IF;
  END IF;
  UPDATE public.student_request_workflow_steps SET status=CASE v_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE 'completed' END,decision=CASE v_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE v_result END,comment=p_comment,completed_by=v_uid,completed_at=now(),updated_at=now()
    WHERE id=v_step.id;
  -- File withdrawal becomes effective at registrar apply, before archive is activated.
  IF v_next_id IS NOT NULL AND v_action='apply_decision' AND v_canonical='file_withdrawal'
     AND EXISTS (SELECT 1 FROM public.student_request_workflow_steps next_step
       JOIN public.request_type_workflow_steps next_config ON next_config.id=next_step.workflow_step_id
       WHERE next_step.id=v_next_id AND next_config.step_key='archive') THEN
    PERFORM public.apply_b1_academic_effect_for_request(v_step.student_request_id);
  END IF;
  IF v_next_id IS NOT NULL THEN UPDATE public.student_request_workflow_steps SET status='active',entered_at=now(),updated_at=now()
    WHERE id=v_next_id AND status='pending'; END IF;
  IF (SELECT count(*) FROM public.student_request_workflow_steps s WHERE s.student_request_id=v_step.student_request_id AND s.status='active')
     <> (CASE WHEN v_next_id IS NULL THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'B1_ACTIVE_STEP_INVARIANT_FAILED'; END IF;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,
    actor_unit_id,actor_role_id,message_ar,payload,visible_to_student)
  VALUES(v_step.student_request_id,v_step.id,CASE v_action WHEN 'reject' THEN 'rejected' WHEN 'return' THEN 'returned'
    ELSE v_result END,v_uid,v_step.processing_unit_id,v_step.processing_role_id,p_comment,
    jsonb_build_object('action',v_action,'action_result',v_result,'transition_id',v_transition.id),true);
  IF v_next_id IS NULL THEN
    UPDATE public.student_requests SET status=CASE v_action WHEN 'reject' THEN 'rejected'
      WHEN 'return' THEN 'returned_for_completion' ELSE 'completed' END,updated_at=now(),completed_at=CASE
        WHEN v_action='return' THEN completed_at ELSE now() END WHERE id=v_step.student_request_id;
    IF v_action='apply_decision' THEN
      PERFORM public.apply_b1_academic_effect_for_request(v_step.student_request_id);
    END IF;
  ELSE
    UPDATE public.student_requests SET status='in_review',updated_at=now() WHERE id=v_step.student_request_id;
  END IF;
  RETURN jsonb_build_object('success',true,'step_id',v_step.id,'action_result',v_result,
    'next_step_id',v_next_id,'transition_applied',true);
END;
$function$;
ALTER FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.apply_b1_academic_effect_for_request(uuid)
-- Source:    supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- Frozen:    78c7821ba68c686a5997dd5cb9bee89eb17f52ec8a5ad85d47b539c2dc385021
-- ----------------------------------------------------------------------------
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
ALTER FUNCTION public.apply_b1_academic_effect_for_request(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.apply_b1_department_transfer_effect(uuid)
-- Source:    supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- Frozen:    c191a03dee94e0bd40f42f1a4762fb65f28d847f820512607d1330491f4c434f
-- ----------------------------------------------------------------------------
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
ALTER FUNCTION public.apply_b1_department_transfer_effect(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.apply_b1_enrollment_suspension_effect(uuid)
-- Source:    supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- Frozen:    dd70aadd24bdfdfb4736f458c667b334b9571ef2b116ccf35cfb09cb76c362bd
-- ----------------------------------------------------------------------------
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
ALTER FUNCTION public.apply_b1_enrollment_suspension_effect(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.apply_b1_excused_absence_effect(uuid)
-- Source:    supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- Frozen:    07fdd58843dd95535f1703c2f3a9df3408d089df1261e1dec0e00bdb774d997c
-- ----------------------------------------------------------------------------
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
ALTER FUNCTION public.apply_b1_excused_absence_effect(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.apply_b1_file_withdrawal_effect(uuid)
-- Source:    supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- Frozen:    2ebc422a333d72b397ec017d1b1bc4ba09a793f3f94196aae5fa5db8229b8668
-- ----------------------------------------------------------------------------
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
ALTER FUNCTION public.apply_b1_file_withdrawal_effect(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.apply_b1_final_chance_effect(uuid)
-- Source:    supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql
-- Frozen:    98aa43b46ebe3dffc945c598c37d68f088807089a25e17f9c5658f999308a4f1
-- ----------------------------------------------------------------------------
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
ALTER FUNCTION public.apply_b1_final_chance_effect(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.assert_b1_runtime_step_assignee_effective(uuid)
-- Source:    supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
-- Frozen:    924535219149f124b60f3e0f4ed2b6235d46f7508cca41c37d1065bb13099473
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(v_step);
END;
$function$;
ALTER FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.assert_b1_runtime_step_row_assignee_effective(student_request_workflow_steps)
-- Source:    supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
-- Frozen:    f5ec0a70f543c0e09d011eefa56920a4dfa513abe8df5e152d6ad1c0809c42be
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  p_step public.student_request_workflow_steps
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$

DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical text;
  v_department_id uuid;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_count integer;
  v_assignment_id uuid;
BEGIN
  v_step := p_step;
  IF v_step.id IS NULL OR v_step.student_request_id IS NULL THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;


  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Legacy / non-B1: untouched behaviour. Early return BEFORE the lock.
  IF NOT public.is_b1_stored_request_type(v_request_type) THEN
    RETURN;
  END IF;

  -- LOCK BEFORE READ. Everything below observes an identity boundary that no
  -- concurrent assignment, profile, position or transfer-scope mutation can
  -- change until this transaction commits or aborts.
  PERFORM public.b1_lock_assignment_identity_boundary();

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  -- Department scope: source head resolves ONLY the head of
  -- current_department_id, target head ONLY the head of requested_department_id.
  IF v_canonical = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
    SELECT CASE v_step.step_key
             WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id
           END
      INTO v_department_id
    FROM public.transfer_request_details d
    WHERE d.request_id = v_step.student_request_id;
    IF v_department_id IS NULL THEN
      RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING:%', v_step.step_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Exactly one effective assignment for (unit, role, department scope).
  -- is_valid_b1_direct_assignment re-reads staff_profiles.status/user_id,
  -- faculty_profiles.status/user_id/department_id and
  -- position_assignments.user_id/is_active/assigned_from/assigned_to under the
  -- lock, so a disabled profile or a swapped user_id is seen here.
  SELECT count(*) INTO v_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, v_count
      USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  -- Exactly one identity kind stored on the resolved assignment.
  IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
       v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_NOT_SINGULAR:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Exactly one identity kind stored on the runtime step.
  IF num_nonnulls(v_step.assigned_user_id, v_step.assigned_staff_profile_id,
       v_step.assigned_faculty_profile_id, v_step.assigned_position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, 0
      USING ERRCODE = '42501';
  END IF;

  -- Stored runtime identity must still equal the effective identity.
  IF v_step.assigned_user_id IS DISTINCT FROM v_assignment.user_id
     OR v_step.assigned_staff_profile_id IS DISTINCT FROM v_assignment.staff_profile_id
     OR v_step.assigned_faculty_profile_id IS DISTINCT FROM v_assignment.faculty_profile_id
     OR v_step.assigned_position_assignment_id IS DISTINCT FROM v_assignment.position_assignment_id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Provenance pin, when recorded at initialization.
  v_assignment_id := (v_step.metadata ->> 'direct_assignment_id')::uuid;
  IF v_assignment_id IS NOT NULL AND v_assignment_id IS DISTINCT FROM v_assignment.id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_PROVENANCE_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;
END;
$function$;
ALTER FUNCTION public.assert_b1_runtime_step_row_assignee_effective(student_request_workflow_steps) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_assignment_identity_lock_key()
-- Source:    supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
-- Frozen:    cc5902f756f69d817dbfa8736497d42c7df65872897f6ad99045658506664ee6
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_assignment_identity_lock_key()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- Constant, namespaced to B1 assignment identity. Never derive it from row
  -- data: a single global key is what makes the contract deadlock-free.
  SELECT 7346501982230114001::bigint;
$function$;
ALTER FUNCTION public.b1_assignment_identity_lock_key() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_e2e_88_correlations_aligned(uuid,uuid,uuid)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    b8370052b3724c623b85290c54c4abe5eefaf5bb64c74b3f0557b4004bdaca4c
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_correlations_aligned(
  p_request_id uuid,
  p_execution_correlation uuid,
  p_binding_correlation uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_execution_correlation IS NOT NULL
    AND p_binding_correlation IS NOT NULL
    AND p_execution_correlation = p_binding_correlation
    AND public.b1_e2e_88_request_correlation(p_request_id) = p_execution_correlation;
$$;
ALTER FUNCTION public.b1_e2e_88_correlations_aligned(uuid,uuid,uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_e2e_88_is_five_service(text)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    c93de84a0012b527c56fecf1269524071f7bd65ccdffe858a2c3fa76fee6026b
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_is_five_service(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_code IN (
    'enrollment_suspension',
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  );
$$;
ALTER FUNCTION public.b1_e2e_88_is_five_service(text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_e2e_88_marker()
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    b3c9a6bfa1c9625da61c72e269fa1e70d66e4a4b6808716d8da3daa65c0e324b
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_marker()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 'TEST_ONLY_B1_E2E_88'::text;
$$;
ALTER FUNCTION public.b1_e2e_88_marker() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_e2e_88_parse_correlation(text)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    20820255b9aabd56d4969072a7c12a8a38a48bc263586b080dd9f27c916c806e
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_parse_correlation(p_raw text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_txt text := btrim(COALESCE(p_raw, ''));
  v_uuid uuid;
BEGIN
  IF v_txt = '' THEN
    RETURN NULL;
  END IF;
  -- Canonical UUID text only (reject non-canonical / malformed).
  IF v_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_uuid := v_txt::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF lower(v_uuid::text) IS DISTINCT FROM lower(v_txt) THEN
    RETURN NULL;
  END IF;
  RETURN v_uuid;
END;
$$;
ALTER FUNCTION public.b1_e2e_88_parse_correlation(text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_e2e_88_request_correlation(uuid)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    280fced47670b1962c5174aa396c03e639d54c0831e8b923831218030a3f5ed2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_correlation(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.b1_e2e_88_parse_correlation(sr.form_data->>'e2e_correlation_id')
  FROM public.student_requests sr
  WHERE sr.id = p_request_id;
$$;
ALTER FUNCTION public.b1_e2e_88_request_correlation(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_e2e_88_request_is_marked(uuid)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    bc4e928200b60e0c58a8abc7d2f43318a94cdd53a6157ce6f276ea6b711ee775
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_is_marked(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_requests sr
    WHERE sr.id = p_request_id
      AND COALESCE(sr.form_data->>'e2e_marker', '') = public.b1_e2e_88_marker()
      AND public.b1_e2e_88_parse_correlation(sr.form_data->>'e2e_correlation_id') IS NOT NULL
      AND COALESCE(sr.form_data->>'e2e_immutable', 'false') = 'true'
      AND public.b1_e2e_88_is_five_service(
        CASE sr.request_type
          WHEN 'absence_excuse' THEN 'excused_absence'
          WHEN 'transfer' THEN 'department_transfer'
          WHEN 'extra_chance' THEN 'final_chance'
          ELSE sr.request_type
        END
      )
      AND sr.request_type IS DISTINCT FROM 'enrollment_certificate'
      AND COALESCE(sr.form_data->>'authoritative_fixture', 'false') IS DISTINCT FROM 'true'
      AND COALESCE(sr.request_number, '') NOT LIKE 'SR-20260801-13%'
  );
$$;
ALTER FUNCTION public.b1_e2e_88_request_is_marked(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_lock_assignment_identity_boundary()
-- Source:    supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
-- Frozen:    fa3a5943001e102e4acb998d35a61ed21f50149dbdf2f18be017ee80e246b72c
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_boundary()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(public.b1_assignment_identity_lock_key());
END;
$function$;
ALTER FUNCTION public.b1_lock_assignment_identity_boundary() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_lock_assignment_identity_stmt()
-- Source:    supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
-- Frozen:    ef7fab64a8f4987e5e5b0baf9d511e535d191d2e755ab7d792cca37a2a53dd5a
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.b1_lock_assignment_identity_boundary();
  RETURN NULL; -- BEFORE STATEMENT triggers ignore the return value.
END;
$function$;
ALTER FUNCTION public.b1_lock_assignment_identity_stmt() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.b1_map_ui_staff_action(text)
-- Source:    supabase/migrations/20260727063429_3b7dd782-3840-4e40-a7d2-b9bd941deff1.sql
-- Frozen:    bec4c955630382d03af1d3f941b8e3d00edaf2caced3c1dd87b2f24636634f0e
-- ----------------------------------------------------------------------------
create or replace function public.b1_map_ui_staff_action(p_action_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_action_type
    when 'confirm_payment' then 'confirm_payment'
    when 'review' then 'review'
    when 'approve' then 'approve'
    when 'clear' then 'approve'
    when 'apply_decision' then 'approve'
    when 'archive' then 'approve'
    when 'return' then 'return'
    when 'reject' then 'reject'
    else null
  end;
$$;
ALTER FUNCTION public.b1_map_ui_staff_action(text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.can_current_user_act_on_step(uuid,text)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    5d2b46d7f5bc7434dacc9a89377e839539223498edfa53afc5dda466be766e22
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  -- 1) exact runtime-step assignee match
  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN RETURN false; END IF;

  -- 2) exact request-scoped E2E binding OR 6) normal processing binding
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
    IF NOT public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type, v_step.step_key, v_unit_code, v_role_code, v_config.action_type
    ) THEN RETURN false; END IF;

    -- 3) exact action and current-step validation
    IF p_action = v_config.action_type THEN
      SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id = v_step.workflow_id AND t.from_step_id = v_step.workflow_step_id
          AND public.workflow_action_result_matches(v_config.action_type, t.action_result);
      RETURN v_transition_count = 1;
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
ALTER FUNCTION public.can_current_user_act_on_step(uuid,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    4a43bd524d8bcdd9d724a3c2466e5fa5f2df2d1ada9cf601d7a2cd32e6685337
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_actor_binding(
  p_request_id uuid,
  p_runtime_step_id uuid,
  p_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.b1_e2e_88_request_is_marked(p_request_id)
    AND EXISTS (
      SELECT 1
      FROM public.b1_e2e_88_actor_bindings b
      JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
      JOIN public.student_request_workflow_steps s ON s.id = b.runtime_step_id
      JOIN public.student_requests sr ON sr.id = b.request_id
      WHERE b.request_id = p_request_id
        AND b.runtime_step_id = p_runtime_step_id
        AND b.actor_user_id = auth.uid()
        AND b.action = p_action
        AND b.active
        AND b.expires_at > now()
        AND e.marker = public.b1_e2e_88_marker()
        AND e.status = 'active'
        AND e.closed_at IS NULL
        AND e.expires_at > now()
        AND e.starts_at <= now()
        AND public.b1_e2e_88_correlations_aligned(
          p_request_id, e.correlation_id, b.correlation_id
        )
        AND e.service_code = CASE sr.request_type
          WHEN 'absence_excuse' THEN 'excused_absence'
          WHEN 'transfer' THEN 'department_transfer'
          WHEN 'extra_chance' THEN 'final_chance'
          ELSE sr.request_type
        END
        AND s.id = p_runtime_step_id
        AND s.student_request_id = p_request_id
        AND s.workflow_step_id = b.workflow_step_id
        AND s.processing_unit_id = b.processing_unit_id
        AND s.processing_role_id = b.processing_role_id
    );
$$;
ALTER FUNCTION public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.current_user_has_b1_e2e_88_department_binding(uuid,text)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    25e8246a87717622161c4e74e3f62cb592b0c703b739d9e30425f5f1d0cad6d2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_department_binding(
  p_step_id uuid,
  p_step_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests sr ON sr.id = s.student_request_id
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.b1_e2e_88_actor_bindings b
      ON b.runtime_step_id = s.id
     AND b.request_id = s.student_request_id
     AND b.actor_user_id = auth.uid()
     AND b.active
     AND b.expires_at > now()
    JOIN public.b1_e2e_88_executions e
      ON e.id = b.execution_id
     AND e.marker = public.b1_e2e_88_marker()
     AND e.status = 'active'
     AND e.closed_at IS NULL
     AND e.expires_at > now()
     AND public.b1_e2e_88_correlations_aligned(
       s.student_request_id, e.correlation_id, b.correlation_id
     )
     AND e.service_code = 'department_transfer'
    WHERE s.id = p_step_id
      AND s.step_key = p_step_key
      AND p_step_key IN ('source_department_head_approval', 'target_department_head_approval')
      AND public.b1_e2e_88_request_is_marked(s.student_request_id)
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND (
        (p_step_key = 'source_department_head_approval'
          AND b.department_side = 'source'
          AND b.department_id = d.current_department_id)
        OR (p_step_key = 'target_department_head_approval'
          AND b.department_side = 'target'
          AND b.department_id = d.requested_department_id)
      )
  );
$$;
ALTER FUNCTION public.current_user_has_b1_e2e_88_department_binding(uuid,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.current_user_has_exact_processing_binding(uuid,uuid)
-- Source:    supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql
-- Frozen:    d98443a83201e3dde7f6f7e21575db62d74c7fc4c80707dc51eafa11a691b444
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_exact_processing_binding(
  p_unit_id uuid, p_role_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = p_unit_id AND rpa.role_id = p_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id = auth.uid())
        OR (rpa.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = rpa.staff_profile_id AND sp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'faculty_profile' AND EXISTS (
          SELECT 1 FROM public.faculty_profiles fp
          WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa
          WHERE pa.id = rpa.position_assignment_id AND pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
$function$;
ALTER FUNCTION public.current_user_has_exact_processing_binding(uuid,uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.current_user_matches_transfer_department_scope(uuid,text)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    a307d0859bf34e1115624fae3aaa82ac11f931f11b65a3c2335958d9f17acbbd
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid,
  p_step_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (
      SELECT count(*) = 1
      FROM public.student_request_workflow_steps s
      JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
      JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
        AND pa.user_id = auth.uid()
        AND pa.is_active
        AND pa.assigned_from <= CURRENT_DATE
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
      JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id = pa.id
        AND rpa.assignment_type = 'position_assignment'
        AND rpa.is_active
        AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
        AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
        AND rpa.unit_id = s.processing_unit_id
        AND rpa.role_id = s.processing_role_id
      WHERE s.id = p_step_id
        AND s.step_key = p_step_key
        AND s.assigned_user_id IS NULL
        AND s.assigned_staff_profile_id IS NULL
        AND s.assigned_faculty_profile_id IS NULL
        AND (
          (p_step_key = 'source_department_head_approval'
            AND rpa.department_id = d.current_department_id)
          OR (p_step_key = 'target_department_head_approval'
            AND rpa.department_id = d.requested_department_id)
        )
    )
    OR public.current_user_has_b1_e2e_88_department_binding(p_step_id, p_step_key)
  );
$$;
ALTER FUNCTION public.current_user_matches_transfer_department_scope(uuid,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.guard_b1_runtime_step_activation()
-- Source:    supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
-- Frozen:    2523ae05c2f5f6fb250741c78f3dc2facc2bdece0854f43662d7c843bcb5874e
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(NEW);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.guard_b1_runtime_step_activation() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.has_any_role(uuid,text[])
-- Source:    supabase/migrations/20260624130000_has_any_role_unify_assignments.sql
-- Frozen:    e2e431b29d4ba7f3ffb79ca2bfc3cc6830b50e77fbd6ef54578a2fb475064f38
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = ANY(_roles)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    LEFT JOIN public.roles_catalog rc ON rc.code = ura.role_code
    WHERE ura.user_id = _user_id
      AND (
        ura.role_code = ANY(_roles)
        OR rc.app_role_mapping::text = ANY(_roles)
      )
  )
$$;
ALTER FUNCTION public.has_any_role(uuid,text[]) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.is_b1_stored_request_type(text)
-- Source:    supabase/migrations/20260724061333_abf1bbb5-1bd0-4a7b-a805-866a3b98a61a.sql
-- Frozen:    34db4ca396780f9cd8bf28d5c7aa6c4e565835f8369f4212444afdfb4d586b73
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_b1_stored_request_type(p_request_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT p_request_type IN ('enrollment_suspension','excused_absence','absence_excuse',
    'department_transfer','transfer','final_chance','extra_chance','file_withdrawal')
$$;
ALTER FUNCTION public.is_b1_stored_request_type(text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.is_owner_of_request(uuid,uuid)
-- Source:    supabase/migrations/20260531235203_bea9042d-3ca6-417b-a8e6-1bfd1179394e.sql
-- Frozen:    8067b65c9525b2b83bbcf163140c559bf28b2b69c14ca2a0dec06e2e770f57da
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = _request_id AND sp.user_id = _user_id
  )
$$;
ALTER FUNCTION public.is_owner_of_request(uuid,uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.is_valid_actor_request_action(text)
-- Source:    supabase/migrations/20260727072354_608688a7-56dd-460a-9e6e-ead8f23d934a.sql
-- Frozen:    65050f9d11e2ad2aa02835eec0be7d0221e71eb20035e2935c7b7bbf852b5c22
-- ----------------------------------------------------------------------------
create or replace function public.is_valid_actor_request_action(p_action text)
returns boolean language sql immutable set search_path=public,pg_temp
as $function$
  select p_action in (
    'approve','reject','return','comment','request_attachment',
    'request_payment','sign','archive','issue_document','complete','skip',
    'review','clear','apply_decision','confirm_payment'
  );
$function$;
ALTER FUNCTION public.is_valid_actor_request_action(text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.is_valid_b1_runtime_step_contract(text,text,text,text,text)
-- Source:    supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql
-- Frozen:    5a584c5915437b335c2e6787b5a19dfe3d013735365fb751086008eb67e18ee5
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_b1_runtime_step_contract(
  p_request_type text, p_step_key text, p_unit_code text,
  p_role_code text, p_action_type text
)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT (p_request_type, p_step_key, p_unit_code, p_role_code, p_action_type) IN (
    ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
    ('enrollment_suspension','manager_approval','student_affairs','student_affairs_manager','approve'),
    ('enrollment_suspension','registrar_apply','registrar','registrar_general','apply_decision'),
    ('excused_absence','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('excused_absence','manager_review','student_affairs','student_affairs_manager','approve'),
    ('excused_absence','record_apply','student_affairs','student_affairs_specialist','apply_decision'),
    ('file_withdrawal','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('file_withdrawal','library_clearance','library','library_officer','clear'),
    ('file_withdrawal','labs_clearance','labs','labs_manager','clear'),
    ('file_withdrawal','activities_clearance','student_affairs','student_affairs_manager','clear'),
    ('file_withdrawal','finance_clearance','finance','revenue_finance_officer','clear'),
    ('file_withdrawal','registrar_apply','registrar','registrar_general','apply_decision'),
    ('file_withdrawal','archive','archive','archive_officer','archive'),
    ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','source_department_head_approval','department','department_head','approve'),
    ('department_transfer','target_department_head_approval','department','department_head','approve'),
    ('department_transfer','dean_approval','dean','dean','approve'),
    ('department_transfer','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
    ('department_transfer','registrar_apply','registrar','registrar_general','apply_decision'),
    ('final_chance','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('final_chance','manager_review','student_affairs','student_affairs_manager','approve'),
    ('final_chance','dean_decision','dean','dean','approve'),
    ('final_chance','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
    ('final_chance','registrar_apply','registrar','registrar_general','apply_decision')
  );
$function$;
ALTER FUNCTION public.is_valid_b1_runtime_step_contract(text,text,text,text,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.protect_student_sensitive_fields()
-- Source:    supabase/migrations/20260531223457_2c9e7828-e98e-42e0-b688-0c49f4810787.sql
-- Frozen:    45d6df61ecdb0fce6bb6a759171400cfd60f32d1f07218556a342d7c6e713708
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_student_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow trusted server-side flows (e.g. complete_student_password_change RPC)
  IF current_setting('app.bypass_student_lock', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Admins / registrar / student affairs bypass the lock
  IF public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  -- Otherwise (student updating own row), silently revert sensitive fields
  NEW.user_id              := OLD.user_id;
  NEW.academic_number      := OLD.academic_number;
  NEW.full_name_ar         := OLD.full_name_ar;
  NEW.department_id        := OLD.department_id;
  NEW.program_id           := OLD.program_id;
  NEW.status               := OLD.status;
  NEW.must_change_password := OLD.must_change_password;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.protect_student_sensitive_fields() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.record_external_university_payment_confirmation(uuid,text)
-- Source:    supabase/migrations/20260806003612_3e34513d-28e3-4047-9d2d-73d4f54ca142.sql
-- Frozen:    edbae98c6e95d8d4f14a5a9a675c8bbb3abb0235a2343c24202358161ee983ca
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_external_university_payment_confirmation(p_step_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_note IS NOT NULL AND char_length(btrim(p_note)) > 2000 THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

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
  IF NOT (
    public.current_user_has_exact_processing_binding(
      v_step.processing_unit_id, v_step.processing_role_id
    )
    OR public.current_user_has_b1_e2e_88_actor_binding(
      v_step.student_request_id, v_step.id, 'confirm_payment'
    )
  ) THEN
    RAISE EXCEPTION 'EXACT_FINANCE_PROCESSING_BINDING_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id = v_step.student_request_id
      AND prior.step_order < v_step.step_order
      AND prior.status NOT IN ('completed','skipped')
  ) THEN
    RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE';
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
$function$;
ALTER FUNCTION public.record_external_university_payment_confirmation(uuid,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.update_updated_at_column()
-- Source:    supabase/migrations/20260531202904_a8c03208-6c77-4eeb-9ad6-e46882ad9507.sql
-- Frozen:    4f969bb9535c476c235c45b984a7030118dc8a0e520b233d066e91beb4cb2f07
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.user_matches_workflow_runtime_step(uuid)
-- Source:    supabase/migrations/20260805220917_081dea41-dca0-4e49-b623-0a1e5502c3d2.sql
-- Frozen:    2ecf741a3e8da340da2c55b95714b9518e5e4e0858119e60a46e742b34ebfced
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_has_direct_assignee boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- TEST_ONLY_B1_E2E_88 exact request-scoped actor binding may satisfy identity
  -- for the bound step only (required for department-head steps that forbid
  -- assigned_user_id). Never grants cross-request or cross-step identity.
  IF public.b1_e2e_88_request_is_marked(v_step.student_request_id)
     AND EXISTS (
       SELECT 1
       FROM public.b1_e2e_88_actor_bindings b
       JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
       WHERE b.runtime_step_id = p_step_id
         AND b.request_id = v_step.student_request_id
         AND b.actor_user_id = v_uid
         AND b.active
         AND b.expires_at > now()
         AND e.marker = public.b1_e2e_88_marker()
         AND e.status = 'active'
         AND e.closed_at IS NULL
         AND e.expires_at > now()
         AND public.b1_e2e_88_correlations_aligned(
           v_step.student_request_id, e.correlation_id, b.correlation_id
         )
     ) THEN
    RETURN true;
  END IF;

  IF v_step.assigned_user_id IS NOT NULL THEN
    RETURN v_step.assigned_user_id = v_uid;
  END IF;

  IF v_step.assigned_staff_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = v_step.assigned_staff_profile_id
        AND sp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_faculty_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.faculty_profiles fp
      WHERE fp.id = v_step.assigned_faculty_profile_id
        AND fp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.position_assignments pa
      WHERE pa.id = v_step.assigned_position_assignment_id
        AND pa.user_id = v_uid
        AND pa.is_active = true
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_has_direct_assignee THEN
    RETURN false;
  END IF;

  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at   IS NULL OR rpa.ends_at   >  now())
      AND rpa.unit_id = v_step.processing_unit_id
      AND rpa.role_id = v_step.processing_role_id
      AND (
        (rpa.assignment_type = 'user'
          AND rpa.user_id IS NOT NULL
          AND rpa.user_id = v_uid)
        OR
        (rpa.assignment_type = 'staff_profile'
          AND rpa.staff_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.staff_profiles sp
            WHERE sp.id = rpa.staff_profile_id AND sp.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'faculty_profile'
          AND rpa.faculty_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.faculty_profiles fp
            WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'position_assignment'
          AND rpa.position_assignment_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.position_assignments pa
            WHERE pa.id = rpa.position_assignment_id
              AND pa.user_id = v_uid
              AND pa.is_active = true
              AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
          ))
      )
  );
END;
$function$;
ALTER FUNCTION public.user_matches_workflow_runtime_step(uuid) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.workflow_action_result_matches(text,text)
-- Source:    supabase/migrations/20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql
-- Frozen:    866ed42a5f38cedb24008b8d7844dd144a948578c455be0fded031c9506af9f8
-- ----------------------------------------------------------------------------
create or replace function public.workflow_action_result_matches(p_action_type text,p_result text)
returns boolean language sql immutable set search_path=public as $function$
  select case p_action_type
    when 'review' then p_result='reviewed'
    when 'approve' then p_result='approved'
    when 'apply_decision' then p_result='applied'
    when 'clear' then p_result='cleared'
    when 'archive' then p_result='archived'
    when 'confirm_payment' then p_result='payment_confirmed'
    when 'sign' then p_result='signed'
    when 'issue_document' then p_result='issued'
    else false end
$function$;
ALTER FUNCTION public.workflow_action_result_matches(text,text) OWNER TO postgres;

-- ----------------------------------------------------------------------------
-- Signature: public.workflow_runtime_predecessors_satisfied(uuid)
-- Source:    supabase/migrations/20260723225159_6af54cae-3956-4f19-bbd9-a4aa8a8f446f.sql
-- Frozen:    701fb6499fb36616a49c0ae71f0c4640ed4d86745d2add016f216c61b3900356
-- ----------------------------------------------------------------------------
create or replace function public.workflow_runtime_predecessors_satisfied(p_step_id uuid)
returns boolean
language plpgsql stable security definer set search_path=public
as $function$
declare
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_incoming integer;
  v_pred record;
begin
  if p_step_id is null then return false; end if;
  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found or v_step.status<>'active' or v_step.workflow_id is null or v_step.workflow_step_id is null then return false; end if;

  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
  if not found or v_config.step_key is distinct from v_step.step_key
    or v_config.step_order is distinct from v_step.step_order then return false; end if;

  -- Runtime/config correspondence is exactly one for this request and version.
  if (select count(*) from public.student_request_workflow_steps r
      where r.student_request_id=v_step.student_request_id and r.workflow_id=v_step.workflow_id
        and r.workflow_step_id=v_step.workflow_step_id)<>1 then return false; end if;

  select count(*) into v_incoming from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id;
  if v_config.step_order=1 then
    if v_incoming<>1 or not exists(select 1 from public.request_type_workflow_transitions t
      where t.workflow_id=v_step.workflow_id and t.from_step_id is null
        and t.to_step_id=v_step.workflow_step_id and t.action_result='submit') then return false; end if;
  elsif v_incoming=0 then return false;
  end if;
  if v_config.step_order<>1 and exists(select 1 from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is null) then return false; end if;
  if exists(select 1 from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
    group by t.from_step_id,t.to_step_id having count(*)<>1) then return false; end if;
  if exists(
    select 1 from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps source_config on source_config.id=t.from_step_id
    left join public.request_type_workflow_steps target_config on target_config.id=t.to_step_id
    where t.workflow_id=v_step.workflow_id and
      ((t.from_step_id is not null and source_config.workflow_id is distinct from t.workflow_id) or
       (t.to_step_id is not null and target_config.workflow_id is distinct from t.workflow_id))
  ) then return false; end if;

  -- Every incoming edge is unique and its exact predecessor runtime is terminal-valid.
  for v_pred in
    select t.from_step_id,t.action_result,pc.can_skip,pc.action_type from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps pc on pc.id=t.from_step_id and pc.workflow_id=t.workflow_id
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is not null
  loop
    if v_pred.can_skip is null then return false; end if;
    if not public.workflow_action_result_matches(v_pred.action_type,v_pred.action_result)
      and not (v_pred.action_result='skip' and v_pred.can_skip) then return false; end if;
    if (select count(*) from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id)<>1 then return false; end if;
    if not exists(select 1 from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id
          and (pr.status='completed' or (pr.status='skipped' and v_pred.can_skip))) then return false; end if;
  end loop;

  -- Every earlier required config must have one terminal-valid runtime and a
  -- legal directed path to this step. A mere runtime row is never sufficient.
  if exists (
    select 1 from public.request_type_workflow_steps pc
    where pc.workflow_id=v_step.workflow_id and pc.step_order<v_config.step_order and pc.is_required
      and ((select count(*) from public.student_request_workflow_steps pr
            where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
              and pr.workflow_step_id=pc.id)<>1
        or not exists(select 1 from public.student_request_workflow_steps pr
            where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
              and pr.workflow_step_id=pc.id
              and (pr.status='completed' or (pr.status='skipped' and pc.can_skip)))
        or not exists(
          with recursive reachable(step_id) as (
            select pc.id
            union
            select t.to_step_id from reachable r
            join public.request_type_workflow_transitions t
              on t.workflow_id=v_step.workflow_id and t.from_step_id=r.step_id
            join public.request_type_workflow_steps source_config
              on source_config.id=t.from_step_id and source_config.workflow_id=t.workflow_id
                and source_config.workflow_id=v_step.workflow_id
            join public.request_type_workflow_steps target_config
              on target_config.id=t.to_step_id and target_config.workflow_id=t.workflow_id
                and target_config.workflow_id=v_step.workflow_id
            where t.to_step_id is not null and
              (public.workflow_action_result_matches(source_config.action_type,t.action_result) or
               (t.action_result='skip' and source_config.can_skip))
          ) select 1 from reachable where step_id=v_step.workflow_step_id
        ))
  ) then return false; end if;

  return true;
end;
$function$;
ALTER FUNCTION public.workflow_runtime_predecessors_satisfied(uuid) OWNER TO postgres;
