-- PORTAL_REFORM_P1_ARCHITECTURE_ALIGNMENT_07C
-- P1-07 — close the P1 staff-side lifecycle by REUSING the existing, proven
-- student-request workflow engine. FORWARD-ONLY. IDEMPOTENT.
--
-- ARCHITECTURE CONTRACT (mandatory):
--   * NO new workflow engine, no parallel runtime tables, no new step model.
--   * Transitions are seeded into public.request_type_workflow_transitions.
--   * Step execution reuses public.act_on_b1_student_request_step_atomic
--     (the atomic executor already used by the five B1 services).
--   * Payment reuses public.record_external_university_payment_confirmation
--     (external university payment; NO payment gateway, NO amounts).
--   * Custom effects exist ONLY for:
--       - replacement card issuance  -> p1_issue_replacement_card_step
--       - final result appeal apply  -> p1_apply_final_result_appeal_step
--     both authored as THIN specialized actions modelled literally on the
--     existing payment-confirmation specialized action.
--   * ARCHIVE for P1 means COMPLETION ONLY — no document issuance, no PDF,
--     no storage artifact. The enrollment_certificate document contract in
--     act_on_student_request_step is NOT touched.
--   * student_visible is NEVER flipped here.
--   * B1 five services and enrollment_certificate behaviour is unchanged:
--     every edit below is additive and guarded by a P1-only predicate.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. P1 canonical predicate (reuses the already-applied P1-06 helper).
-- ---------------------------------------------------------------------------
-- public.p1_is_atomic_submit_service(text) already exists and returns true for
-- october_exam_entry_form | replacement_student_card | grade_appeal.


-- ---------------------------------------------------------------------------
-- 1. TRANSITIONS — the missing piece that blocked P1-07 E2E.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_seed_transition(
  p_wf_code   text,
  p_from_key  text,          -- NULL = start edge
  p_result    text,
  p_to_key    text,          -- NULL = terminal edge
  p_label_ar  text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wf   uuid;
  v_from uuid;
  v_to   uuid;
BEGIN
  SELECT id INTO v_wf
  FROM public.request_type_workflows
  WHERE code = p_wf_code AND version = 1;
  IF v_wf IS NULL THEN
    RAISE EXCEPTION 'P1_SEED_UNKNOWN_WORKFLOW: %', p_wf_code;
  END IF;

  IF p_from_key IS NOT NULL THEN
    SELECT id INTO v_from FROM public.request_type_workflow_steps
    WHERE workflow_id = v_wf AND step_key = p_from_key;
    IF v_from IS NULL THEN
      RAISE EXCEPTION 'P1_SEED_UNKNOWN_STEP: %/%', p_wf_code, p_from_key;
    END IF;
  END IF;

  IF p_to_key IS NOT NULL THEN
    SELECT id INTO v_to FROM public.request_type_workflow_steps
    WHERE workflow_id = v_wf AND step_key = p_to_key;
    IF v_to IS NULL THEN
      RAISE EXCEPTION 'P1_SEED_UNKNOWN_STEP: %/%', p_wf_code, p_to_key;
    END IF;
  END IF;

  -- Exactly one edge per (workflow, from, action_result) — the engine's
  -- resolver and workflow_runtime_predecessors_satisfied both require it.
  IF EXISTS (
    SELECT 1 FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_wf
      AND t.from_step_id IS NOT DISTINCT FROM v_from
      AND t.action_result = p_result
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.request_type_workflow_transitions
    (workflow_id, from_step_id, to_step_id, action_result, label_ar,
     condition_schema, is_default, priority)
  VALUES (v_wf, v_from, v_to, p_result, p_label_ar, '{}'::jsonb, true, 0);
END $$;

-- october_exam_entry_form_v1
SELECT public.p1_seed_transition('october_exam_entry_form_v1', NULL, 'submit', 'student_affairs_review', 'إرسال الطلب');
SELECT public.p1_seed_transition('october_exam_entry_form_v1', 'student_affairs_review', 'reviewed', 'payment_confirmation', 'بعد مراجعة شؤون الطلاب');
SELECT public.p1_seed_transition('october_exam_entry_form_v1', 'payment_confirmation', 'payment_confirmed', 'registrar_finalize', 'بعد تأكيد السداد الخارجي');
SELECT public.p1_seed_transition('october_exam_entry_form_v1', 'registrar_finalize', 'applied', 'archive', 'بعد اعتماد المسجل');
SELECT public.p1_seed_transition('october_exam_entry_form_v1', 'archive', 'archived', NULL, 'إغلاق الطلب بالأرشفة');

-- replacement_student_card_v1
SELECT public.p1_seed_transition('replacement_student_card_v1', NULL, 'submit', 'student_affairs_review', 'إرسال الطلب');
SELECT public.p1_seed_transition('replacement_student_card_v1', 'student_affairs_review', 'reviewed', 'payment_confirmation', 'بعد مراجعة شؤون الطلاب');
SELECT public.p1_seed_transition('replacement_student_card_v1', 'payment_confirmation', 'payment_confirmed', 'card_issuance', 'بعد تأكيد السداد الخارجي');
SELECT public.p1_seed_transition('replacement_student_card_v1', 'card_issuance', 'applied', NULL, 'إغلاق الطلب بعد تسليم البطاقة');

-- final_result_appeal_v1
SELECT public.p1_seed_transition('final_result_appeal_v1', NULL, 'submit', 'registrar_intake', 'إرسال التظلم');
SELECT public.p1_seed_transition('final_result_appeal_v1', 'registrar_intake', 'reviewed', 'department_head_review', 'بعد استقبال التظلم');
SELECT public.p1_seed_transition('final_result_appeal_v1', 'department_head_review', 'reviewed', 'instructor_review', 'بعد مراجعة رئيس القسم');
SELECT public.p1_seed_transition('final_result_appeal_v1', 'instructor_review', 'reviewed', 'academic_decision', 'بعد مراجعة أستاذ المقرر');
SELECT public.p1_seed_transition('final_result_appeal_v1', 'academic_decision', 'approved', 'registrar_apply_result', 'بعد القرار الأكاديمي');
SELECT public.p1_seed_transition('final_result_appeal_v1', 'registrar_apply_result', 'applied', 'archive', 'بعد تطبيق النتيجة المعتمدة');
SELECT public.p1_seed_transition('final_result_appeal_v1', 'archive', 'archived', NULL, 'إغلاق التظلم بالأرشفة');

DROP FUNCTION IF EXISTS public.p1_seed_transition(text, text, text, text, text);


-- ---------------------------------------------------------------------------
-- 2. ATOMIC EXECUTOR — additive P1 admission, no behavioural change for B1.
--    Copied verbatim from the deployed definition; the ONLY differences are
--    marked with "-- P1-07:".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(
  p_step_id uuid, p_action text, p_comment text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
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
  v_is_p1 boolean := false;  -- P1-07
BEGIN
  PERFORM set_config('b1.atomic_action','1',true);
  LOCK TABLE public.request_type_workflow_transitions IN SHARE MODE;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id=p_step_id FOR UPDATE;
  IF NOT FOUND OR v_step.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'B1_ACTIVE_STEP_REQUIRED'; END IF;
  SELECT r.request_type INTO v_request_type FROM public.student_requests r WHERE r.id=v_step.student_request_id FOR UPDATE;
  v_canonical:=CASE v_request_type WHEN 'absence_excuse' THEN 'excused_absence' WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance' ELSE v_request_type END;
  v_is_p1 := public.p1_is_atomic_submit_service(v_canonical);  -- P1-07
  IF v_canonical NOT IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
     AND NOT v_is_p1  -- P1-07: P1 services reuse this executor unchanged
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

  -- P1-07: the two P1 steps that carry a real effect must go through their
  -- own thin specialized RPC, exactly like confirm_payment does.
  IF v_is_p1 AND v_step.step_key IN ('card_issuance','registrar_apply_result') THEN
    RAISE EXCEPTION 'P1_SPECIALIZED_ACTION_RPC_REQUIRED' USING ERRCODE='42501';
  END IF;

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
    -- P1-07: P1 services carry NO B1 academic effect on this path.
    IF v_action='apply_decision' AND NOT v_is_p1 THEN
      PERFORM public.apply_b1_academic_effect_for_request(v_step.student_request_id);
    END IF;
  ELSE
    UPDATE public.student_requests SET status='in_review',updated_at=now() WHERE id=v_step.student_request_id;
  END IF;
  RETURN jsonb_build_object('success',true,'step_id',v_step.id,'action_result',v_result,
    'next_step_id',v_next_id,'transition_applied',true,'skipped_steps',v_skipped);
END;
$function$;


-- ---------------------------------------------------------------------------
-- 3. AUTHORIZATION — P1 steps get the SAME strict treatment as B1 steps.
--    No global bypass for admin / registrar / dean is introduced.
-- ---------------------------------------------------------------------------
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
  v_is_p1 boolean := false;   -- P1-07
  v_strict boolean := false;  -- P1-07: B1 OR P1 strict runtime contract
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
  v_is_p1 := public.p1_is_atomic_submit_service(v_canonical_request_type);
  v_strict := v_is_b1 OR v_is_p1;

  IF v_strict AND (
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

  IF v_strict THEN
    v_has_binding := public.current_user_has_exact_processing_binding(
      v_step.processing_unit_id, v_step.processing_role_id
    );
    -- The B1-88 E2E actor binding remains available to B1 services ONLY.
    v_has_e2e := v_is_b1 AND public.current_user_has_b1_e2e_88_actor_binding(
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

  IF v_strict THEN
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

    -- B1 keeps its dedicated runtime-contract catalogue; P1 relies on the
    -- configured workflow row itself (already verified above) plus a
    -- non-null configured action type.
    IF v_is_b1 THEN
      IF NOT public.b1_runtime_step_contract_ok(
        v_canonical_request_type, v_step.workflow_id, v_step.step_key,
        v_unit_code, v_role_code, v_config.action_type
      ) THEN RETURN false; END IF;
    ELSIF v_unit_code IS NULL OR v_role_code IS NULL OR v_config.action_type IS NULL THEN
      RETURN false;
    END IF;

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


-- ---------------------------------------------------------------------------
-- 4. PAYMENT — reuse the existing external-payment specialized action.
--    Only the request-type allowlist widens; every guard stays identical.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_external_university_payment_confirmation(
  p_step_id uuid, p_note text DEFAULT NULL::text)
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
  -- P1-07: the two paid P1 services join the SAME external-payment contract.
  IF v_request_type NOT IN ('department_transfer','transfer','final_chance','extra_chance',
                            'october_exam_entry_form','replacement_student_card') THEN
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
    OR (
      public.is_b1_stored_request_type(v_request_type)
      AND public.current_user_has_b1_e2e_88_actor_binding(
        v_step.student_request_id, v_step.id, 'confirm_payment'
      )
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

  -- P1-07: the replacement-card detail row records the external confirmation
  -- (actor + time only — no amount, no currency, no gateway artefact).
  IF v_request_type = 'replacement_student_card' THEN
    UPDATE public.replacement_card_details
    SET payment_confirmed_at = now(), payment_confirmed_by = v_uid, updated_at = now()
    WHERE request_id = v_step.student_request_id
      AND payment_confirmed_at IS NULL;
  END IF;

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


-- ---------------------------------------------------------------------------
-- 5. THIN SPECIALIZED ACTION — replacement card issuance.
--    Structure copied from the payment specialized action; the ONLY extra work
--    is writing the issued serial onto the canonical detail row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_issue_replacement_card_step(
  p_step_id uuid, p_card_serial text, p_note text DEFAULT NULL::text)
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
  v_serial text := NULLIF(btrim(p_card_serial), '');
  v_transition_count integer;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  PERFORM set_config('b1.specialized_action', '1', true);

  IF v_serial IS NULL OR char_length(v_serial) > 64 THEN
    RAISE EXCEPTION 'CARD_SERIAL_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND char_length(btrim(p_note)) > 2000 THEN
    RAISE EXCEPTION 'CARD_ISSUANCE_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'CARD_ISSUANCE_STEP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT r.request_type, u.code, pr.code INTO v_request_type, v_unit_code, v_role_code
  FROM public.student_requests r
  LEFT JOIN public.request_processing_units u ON u.id = v_step.processing_unit_id
  LEFT JOIN public.request_processing_roles pr ON pr.id = v_step.processing_role_id
  WHERE r.id = v_step.student_request_id;

  IF v_request_type IS DISTINCT FROM 'replacement_student_card' THEN
    RAISE EXCEPTION 'REQUEST_TYPE_NOT_REPLACEMENT_CARD' USING ERRCODE = '22023';
  END IF;
  IF v_step.status IS DISTINCT FROM 'active'
     OR v_step.step_key IS DISTINCT FROM 'card_issuance'
     OR v_unit_code IS DISTINCT FROM 'student_affairs'
     OR v_role_code IS DISTINCT FROM 'student_affairs_manager' THEN
    RAISE EXCEPTION 'INVALID_ACTIVE_CARD_ISSUANCE_STEP' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;
  IF NOT FOUND OR v_config.action_type IS DISTINCT FROM 'apply_decision' THEN
    RAISE EXCEPTION 'CARD_ISSUANCE_ACTION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  -- Exact direct assignment + exact processing binding. No role bypass.
  PERFORM public.p1_assert_step_actor(v_step.student_request_id, 'card_issuance', v_uid);
  IF NOT public.current_user_has_exact_processing_binding(
       v_step.processing_unit_id, v_step.processing_role_id) THEN
    RAISE EXCEPTION 'EXACT_PROCESSING_BINDING_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id = v_step.student_request_id
      AND prior.step_order < v_step.step_order
      AND prior.status NOT IN ('completed','skipped')
  ) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;

  PERFORM public.p1_assert_payment_confirmed(v_step.student_request_id);

  SELECT count(*) INTO v_transition_count
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'applied';
  IF v_transition_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'EXACTLY_ONE_APPLIED_TRANSITION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'applied'
  LIMIT 1;
  IF v_transition.to_step_id IS NOT NULL THEN
    RAISE EXCEPTION 'CARD_ISSUANCE_MUST_BE_TERMINAL' USING ERRCODE = '22023';
  END IF;

  UPDATE public.replacement_card_details
  SET issued_card_serial = v_serial, card_issued_at = now(),
      card_issued_by = v_uid, updated_at = now()
  WHERE request_id = v_step.student_request_id
    AND card_issued_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CARD_ALREADY_ISSUED_OR_DETAILS_MISSING' USING ERRCODE = '22023';
  END IF;

  UPDATE public.student_request_workflow_steps
  SET status = 'completed', decision = 'applied', comment = NULLIF(btrim(p_note), ''),
      completed_by = v_uid, completed_at = now(), updated_at = now()
  WHERE id = v_step.id;

  UPDATE public.student_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = v_step.student_request_id;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_step.student_request_id, v_step.id, 'applied', v_uid,
    v_step.processing_unit_id, v_step.processing_role_id, NULLIF(btrim(p_note), ''),
    jsonb_build_object('action','apply_decision','action_result','applied',
                       'transition_id', v_transition.id), true
  );

  RETURN jsonb_build_object('success', true, 'status', 'card_issued',
    'request_id', v_step.student_request_id, 'step_id', v_step.id,
    'next_step_id', NULL, 'transition_applied', true);
END;
$function$;


-- ---------------------------------------------------------------------------
-- 6. THIN SPECIALIZED ACTION — final result appeal application.
--    The academic decision itself stays in p1_apply_final_result_decision
--    (already applied by P1-04); this wrapper only drives the workflow step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_apply_final_result_appeal_step(
  p_step_id uuid, p_final_result numeric, p_note text DEFAULT NULL::text)
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
  v_transition_count integer;
  v_next_step_id uuid;
  v_decision jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  PERFORM set_config('b1.specialized_action', '1', true);
  IF p_note IS NOT NULL AND char_length(btrim(p_note)) > 2000 THEN
    RAISE EXCEPTION 'APPEAL_NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPEAL_STEP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT r.request_type, u.code, pr.code INTO v_request_type, v_unit_code, v_role_code
  FROM public.student_requests r
  LEFT JOIN public.request_processing_units u ON u.id = v_step.processing_unit_id
  LEFT JOIN public.request_processing_roles pr ON pr.id = v_step.processing_role_id
  WHERE r.id = v_step.student_request_id;

  IF v_request_type IS DISTINCT FROM 'grade_appeal' THEN
    RAISE EXCEPTION 'REQUEST_TYPE_NOT_FINAL_RESULT_APPEAL' USING ERRCODE = '22023';
  END IF;
  IF v_step.status IS DISTINCT FROM 'active'
     OR v_step.step_key IS DISTINCT FROM 'registrar_apply_result'
     OR v_unit_code IS DISTINCT FROM 'registrar'
     OR v_role_code IS DISTINCT FROM 'registrar_general' THEN
    RAISE EXCEPTION 'INVALID_ACTIVE_APPEAL_APPLY_STEP' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;
  IF NOT FOUND OR v_config.action_type IS DISTINCT FROM 'apply_decision' THEN
    RAISE EXCEPTION 'APPEAL_APPLY_ACTION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_user_has_exact_processing_binding(
       v_step.processing_unit_id, v_step.processing_role_id) THEN
    RAISE EXCEPTION 'EXACT_PROCESSING_BINDING_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id = v_step.student_request_id
      AND prior.step_order < v_step.step_order
      AND prior.status NOT IN ('completed','skipped')
  ) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;

  -- Academic effect: existing, already-audited decision function
  -- (it re-asserts the direct step actor itself).
  v_decision := public.p1_apply_final_result_decision(
    v_step.student_request_id, p_final_result, p_note);
  IF COALESCE((v_decision->>'applied')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'APPEAL_DECISION_NOT_APPLIED: %', COALESCE(v_decision->>'reason','UNKNOWN')
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_transition_count
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'applied';
  IF v_transition_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'EXACTLY_ONE_APPLIED_TRANSITION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'applied'
  LIMIT 1;
  IF v_transition.to_step_id IS NULL THEN
    RAISE EXCEPTION 'APPEAL_APPLY_MUST_PRECEDE_ARCHIVE' USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_next_step_id
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = v_step.student_request_id
    AND s.workflow_step_id = v_transition.to_step_id
    AND s.status = 'pending'
  FOR UPDATE;
  IF v_next_step_id IS NULL THEN
    RAISE EXCEPTION 'NEXT_APPEAL_WORKFLOW_STEP_NOT_READY' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.student_request_workflow_steps
  SET status = 'completed', decision = 'applied', comment = NULLIF(btrim(p_note), ''),
      completed_by = v_uid, completed_at = now(), updated_at = now()
  WHERE id = v_step.id;

  UPDATE public.student_request_workflow_steps
  SET status = 'active', entered_at = now(), updated_at = now()
  WHERE id = v_next_step_id AND status = 'pending';

  UPDATE public.student_requests
  SET status = 'in_review', updated_at = now()
  WHERE id = v_step.student_request_id;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_step.student_request_id, v_step.id, 'applied', v_uid,
    v_step.processing_unit_id, v_step.processing_role_id, NULLIF(btrim(p_note), ''),
    jsonb_build_object('action','apply_decision','action_result','applied',
                       'transition_id', v_transition.id,
                       'approved_final_result', v_decision->'approved_final_result'), true
  );

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_step.student_request_id, v_next_step_id, 'step_entered', v_uid,
    NULL, NULL, NULL,
    jsonb_build_object('from_step_id', v_step.id, 'transition_id', v_transition.id,
                       'action_result','applied'),
    false
  );

  RETURN jsonb_build_object('success', true, 'status', 'final_result_applied',
    'request_id', v_step.student_request_id, 'step_id', v_step.id,
    'next_step_id', v_next_step_id, 'transition_applied', true,
    'decision', v_decision);
END;
$function$;


-- ---------------------------------------------------------------------------
-- 7. ACL — authenticated staff may call the two thin actions; anon never can.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.p1_issue_replacement_card_step(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.p1_apply_final_result_appeal_step(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.p1_issue_replacement_card_step(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_apply_final_result_appeal_step(uuid, numeric, text) TO authenticated;

COMMIT;
