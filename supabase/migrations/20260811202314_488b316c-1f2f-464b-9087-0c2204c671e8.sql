-- A. Conditional Transition Engine ------------------------------------------

ALTER TABLE public.request_type_workflow_transitions
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.request_workflow_transition_condition_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  params_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.request_workflow_transition_condition_catalog TO authenticated;
GRANT ALL ON public.request_workflow_transition_condition_catalog TO service_role;
ALTER TABLE public.request_workflow_transition_condition_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transition_condition_catalog_read_authenticated"
  ON public.request_workflow_transition_condition_catalog;
CREATE POLICY "transition_condition_catalog_read_authenticated"
  ON public.request_workflow_transition_condition_catalog
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_rwtcc_updated_at ON public.request_workflow_transition_condition_catalog;
CREATE TRIGGER trg_rwtcc_updated_at BEFORE UPDATE
  ON public.request_workflow_transition_condition_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.request_workflow_transition_condition_catalog(code,name_ar,description_ar,sort_order)
VALUES
  ('FEE_IS_ZERO','لا توجد رسوم','ينطبق عندما لا يوجد تقييم رسوم فعّال أو كان المبلغ صفرًا',10),
  ('FEE_GREATER_THAN_ZERO','توجد رسوم مستحقة','ينطبق عندما يوجد تقييم رسوم فعّال بمبلغ أكبر من صفر',20),
  ('PAYMENT_ALREADY_CONFIRMED','السداد مؤكد مسبقًا','ينطبق عندما تم تأكيد سداد الرسوم لهذا الطلب',30),
  ('ATTACHMENT_PRESENT','يوجد مرفق','ينطبق عندما يملك الطلب مرفقًا واحدًا على الأقل مرفوعًا',40),
  ('TARGET_DEPARTMENT_DIFFERS','القسم المستهدف مختلف','ينطبق عندما يختلف القسم المطلوب عن القسم الحالي للطالب',50)
ON CONFLICT (code) DO NOTHING;

-- Safe, closed-catalog condition evaluator. No free-form expressions.
CREATE OR REPLACE FUNCTION public.evaluate_workflow_transition_condition(
  p_request_id uuid, p_condition jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text; v_amount numeric; v_paid boolean;
BEGIN
  IF p_condition IS NULL OR p_condition = '{}'::jsonb THEN RETURN true; END IF;
  v_code := NULLIF(btrim(COALESCE(p_condition->>'code','')),'');
  IF v_code IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                 WHERE c.code = v_code AND c.is_active) THEN
    RAISE EXCEPTION 'B1_CONDITION_CODE_NOT_ALLOWED:%', v_code;
  END IF;

  SELECT f.amount, (f.payment_status = 'paid') INTO v_amount, v_paid
  FROM public.student_request_fee_assessments f
  WHERE f.request_id = p_request_id AND f.payment_status <> 'cancelled'
  ORDER BY f.assessed_at DESC LIMIT 1;

  IF v_code = 'FEE_IS_ZERO' THEN
    RETURN COALESCE(v_amount, 0) = 0;
  ELSIF v_code = 'FEE_GREATER_THAN_ZERO' THEN
    RETURN COALESCE(v_amount, 0) > 0;
  ELSIF v_code = 'PAYMENT_ALREADY_CONFIRMED' THEN
    RETURN COALESCE(v_paid, false);
  ELSIF v_code = 'ATTACHMENT_PRESENT' THEN
    RETURN EXISTS (SELECT 1 FROM public.student_request_attachment_uploads u
                   WHERE u.student_request_id = p_request_id
                     AND u.upload_status IN ('uploaded','attached','active'));
  ELSIF v_code = 'TARGET_DEPARTMENT_DIFFERS' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.transfer_request_details d
      JOIN public.student_requests r ON r.id = d.request_id
      JOIN public.student_profiles sp ON sp.id = r.student_profile_id
      WHERE d.request_id = p_request_id
        AND d.requested_department_id IS DISTINCT FROM sp.department_id);
  END IF;

  RAISE EXCEPTION 'B1_CONDITION_CODE_NOT_IMPLEMENTED:%', v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_workflow_transition_condition(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_workflow_transition_condition(uuid,jsonb) TO authenticated, service_role;

-- Deterministic transition resolver.
CREATE OR REPLACE FUNCTION public.resolve_b1_workflow_transition(
  p_workflow_id uuid, p_from_step_id uuid, p_action_result text, p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec record; v_best_priority integer; v_matches integer := 0; v_chosen uuid;
BEGIN
  -- conditional (non-default) transitions whose condition holds
  FOR v_rec IN
    SELECT t.id, t.priority
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id
      AND t.from_step_id IS NOT DISTINCT FROM p_from_step_id
      AND t.action_result = p_action_result
      AND NOT t.is_default
      AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
      AND public.evaluate_workflow_transition_condition(p_request_id, t.condition_schema)
    ORDER BY t.priority DESC, t.id
  LOOP
    IF v_best_priority IS NULL THEN
      v_best_priority := v_rec.priority; v_chosen := v_rec.id; v_matches := 1;
    ELSIF v_rec.priority = v_best_priority THEN
      v_matches := v_matches + 1;
    END IF;
  END LOOP;

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'B1_TRANSITION_CONFIGURATION_ERROR_AMBIGUOUS_PRIORITY';
  END IF;
  IF v_matches = 1 THEN RETURN v_chosen; END IF;

  SELECT count(*), (array_agg(t.id ORDER BY t.id))[1] INTO v_matches, v_chosen
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM p_from_step_id
    AND t.action_result = p_action_result
    AND (t.is_default OR COALESCE(t.condition_schema,'{}'::jsonb) = '{}'::jsonb);

  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'B1_TRANSITION_MUST_RESOLVE_ONCE:%', v_matches;
  END IF;
  RETURN v_chosen;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_b1_workflow_transition(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_b1_workflow_transition(uuid,uuid,text,uuid) TO authenticated, service_role;

-- Engine: branch-aware step advancement with recorded skips.
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
  v_action text; v_transition_id uuid; v_next_order integer; v_skipped integer := 0;
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
  v_action := p_action;
  IF NOT public.can_current_user_act_on_step(p_step_id, COALESCE(v_config.action_type,'')) THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id=v_step.student_request_id AND prior.step_order<v_step.step_order
      AND prior.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
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

  v_transition_id := public.resolve_b1_workflow_transition(
    v_step.workflow_id, v_step.workflow_step_id, v_result, v_step.student_request_id);
  SELECT t.* INTO v_transition FROM public.request_type_workflow_transitions t WHERE t.id=v_transition_id FOR SHARE;

  IF v_transition.to_step_id IS NOT NULL THEN
    SELECT count(*),(array_agg(s.id ORDER BY s.id))[1],(array_agg(s.step_order ORDER BY s.id))[1]
      INTO v_transition_count,v_next_id,v_next_order
    FROM public.student_request_workflow_steps s WHERE s.student_request_id=v_step.student_request_id
      AND s.workflow_step_id=v_transition.to_step_id AND s.status='pending';
    IF v_transition_count<>1 THEN RAISE EXCEPTION 'B1_NEXT_RUNTIME_STEP_MUST_RESOLVE_ONCE:%',v_transition_count; END IF;
  END IF;
  UPDATE public.student_request_workflow_steps SET status=CASE v_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE 'completed' END,decision=CASE v_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE v_result END,comment=p_comment,completed_by=v_uid,completed_at=now(),updated_at=now()
    WHERE id=v_step.id;

  -- Branch bypass: pending steps strictly between the completed step and the
  -- resolved next step are recorded as skipped, with a documented reason.
  IF v_next_id IS NOT NULL AND v_next_order > v_step.step_order + 1 THEN
    WITH bypassed AS (
      SELECT s.id, COALESCE(c.requires_payment,false) AS requires_payment
      FROM public.student_request_workflow_steps s
      LEFT JOIN public.request_type_workflow_steps c ON c.id = s.workflow_step_id
      WHERE s.student_request_id = v_step.student_request_id
        AND s.status = 'pending'
        AND s.step_order > v_step.step_order
        AND s.step_order < v_next_order
    )
    UPDATE public.student_request_workflow_steps s
      SET status='skipped', decision='skipped', completed_at=now(), updated_at=now(),
          metadata = COALESCE(s.metadata,'{}'::jsonb) || jsonb_build_object(
            'skip_reason', CASE WHEN b.requires_payment THEN 'fee_not_required' ELSE 'branch_bypassed' END,
            'skipped_by_transition_id', v_transition_id)
      FROM bypassed b WHERE b.id = s.id;
    GET DIAGNOSTICS v_skipped = ROW_COUNT;
    IF v_skipped > 0 THEN
      INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,
        actor_unit_id,actor_role_id,message_ar,payload,visible_to_student)
      VALUES(v_step.student_request_id,v_step.id,'skip',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
        'تم تخطي خطوات غير مطلوبة وفق شروط سير العمل',
        jsonb_build_object('skipped_steps',v_skipped,'transition_id',v_transition_id),true);
    END IF;
  END IF;

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
    'next_step_id',v_next_id,'transition_applied',true,'skipped_steps',v_skipped);
END;
$function$;