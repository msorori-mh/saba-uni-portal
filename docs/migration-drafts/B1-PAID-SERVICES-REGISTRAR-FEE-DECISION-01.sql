-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01
-- التحويل بين الأقسام + الفرصة الأخيرة: قرار رسوم لكل طلب لدى مسجل الكلية.
-- Review: docs/reviews/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.md
-- Requires EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (applied); touches none of
-- its objects. Creates: table b1_request_fee_decisions (+ guard trigger), 4
-- functions, catalog condition B1_FEE_NOT_REQUIRED, the next workflow version of
-- department_transfer / final_chance. Patches (anchor-checked): the atomic
-- executor (1) and evaluate_workflow_transition_condition (1). Writes no request,
-- runtime step, assignment or request_types row. Idempotent, fail closed.

BEGIN;

-- 1. Fee decision (amount_due is DISPLAY-ONLY; no currency, no arithmetic) -----
CREATE TABLE IF NOT EXISTS public.b1_request_fee_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.student_requests(id) ON DELETE CASCADE,
  runtime_step_id uuid NOT NULL UNIQUE REFERENCES public.student_request_workflow_steps(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  decision text NOT NULL,
  exemption_reason text,
  amount_due numeric(12,2),
  note text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b1_request_fee_decisions_service_chk CHECK (service_code IN ('department_transfer', 'final_chance')),
  CONSTRAINT b1_request_fee_decisions_decision_chk CHECK (
    (decision = 'FEE_REQUIRED' AND exemption_reason IS NULL
       AND amount_due IS NOT NULL AND amount_due > 0 AND amount_due <= 9999999.99)
    OR (decision = 'FEE_NOT_REQUIRED' AND exemption_reason IN ('FREE_SERVICE', 'EXEMPTION')
       AND amount_due IS NULL)),
  CONSTRAINT b1_request_fee_decisions_note_chk CHECK (note IS NULL OR char_length(note) <= 500)
);
COMMENT ON TABLE public.b1_request_fee_decisions IS
  'قرار مسجل الكلية بشأن رسوم طلبات التحويل بين الأقسام والفرصة الأخيرة. إدراج فقط عبر record_b1_fee_decision، غير قابل للتعديل. amount_due للعرض فقط.';
ALTER TABLE public.b1_request_fee_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.b1_request_fee_decisions FROM PUBLIC, anon, authenticated;

-- Service code when p_step_id is a registrar fee-decision step of the two services.
CREATE OR REPLACE FUNCTION public.b1_fee_decision_step(p_step_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT x.code
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests r ON r.id = s.student_request_id
  JOIN public.request_type_workflows w ON w.id = s.workflow_id
  JOIN public.request_type_workflow_steps c
    ON c.id = s.workflow_step_id AND c.workflow_id = s.workflow_id AND c.step_key = s.step_key
  CROSS JOIN LATERAL (SELECT CASE r.request_type WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance' ELSE r.request_type END AS code) x
  WHERE s.id = p_step_id AND s.step_key = 'registrar_fee_decision' AND c.action_type = 'review'
    AND x.code IN ('department_transfer', 'final_chance')
    AND w.code = x.code || '_external_payment_workflow';
$function$;

CREATE OR REPLACE FUNCTION public.guard_b1_request_fee_decision_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('b1pfd01.fee_decision_write', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'B1_FEE_DECISION_RPC_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  -- only the cascade of a deleted request may remove its decision
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.student_requests r WHERE r.id = OLD.request_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'B1_FEE_DECISION_IS_IMMUTABLE' USING ERRCODE = '42501';
END;
$function$;

DO $guard_trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.b1_request_fee_decisions'::regclass
                   AND tgname = 'trg_guard_b1_request_fee_decision_write' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_guard_b1_request_fee_decision_write
      BEFORE INSERT OR UPDATE OR DELETE ON public.b1_request_fee_decisions
      FOR EACH ROW EXECUTE FUNCTION public.guard_b1_request_fee_decision_write();
  END IF;
END;
$guard_trigger$;

-- The registrar's decision: record + complete the step + route + notify, or nothing.
CREATE OR REPLACE FUNCTION public.record_b1_fee_decision(
  p_step_id uuid, p_decision text, p_exemption_reason text DEFAULT NULL,
  p_note text DEFAULT NULL, p_amount_due numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_service text;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_bad text;
  v_result jsonb;
  v_pay text;
  v_apply text;
  v_number text;
  v_student uuid;
  v_label text;
  v_amount text;
  v_title text;
  v_message text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  v_bad := CASE
    WHEN p_step_id IS NULL THEN 'step'
    WHEN p_decision IS NULL OR p_decision NOT IN ('FEE_REQUIRED', 'FEE_NOT_REQUIRED') THEN 'decision'
    WHEN p_decision = 'FEE_REQUIRED' AND p_exemption_reason IS NOT NULL THEN 'exemption_reason'
    WHEN p_decision = 'FEE_NOT_REQUIRED'
      AND (p_exemption_reason IS NULL OR p_exemption_reason NOT IN ('FREE_SERVICE', 'EXEMPTION')) THEN 'exemption_reason'
    WHEN v_note IS NOT NULL AND char_length(v_note) > 500 THEN 'note'
    -- display-only amount: mandatory, > 0, bounded, at most two decimals; forbidden when no fee is due
    WHEN p_decision = 'FEE_REQUIRED' AND (p_amount_due IS NULL OR p_amount_due IS NOT DISTINCT FROM 'NaN'::numeric
      OR p_amount_due <= 0 OR p_amount_due > 9999999.99 OR p_amount_due <> round(p_amount_due, 2)) THEN 'amount_due'
    WHEN p_decision = 'FEE_NOT_REQUIRED' AND p_amount_due IS NOT NULL THEN 'amount_due'
  END;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'B1_FEE_DECISION_INPUT_INVALID:%', v_bad USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id = p_step_id FOR UPDATE OF s;
  v_service := public.b1_fee_decision_step(p_step_id);
  IF NOT FOUND OR v_step.status IS DISTINCT FROM 'active' OR v_service IS NULL THEN
    RAISE EXCEPTION 'B1_ACTIVE_STEP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- identical authorization to acting on the step: its single direct assignee, no bypass
  IF NOT public.can_current_user_act_on_step(p_step_id, 'review') THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('b1pfd01.fee_decision_write', '1', true);
  INSERT INTO public.b1_request_fee_decisions
    (request_id, runtime_step_id, service_code, decision, exemption_reason, amount_due, note, decided_by)
  VALUES (v_step.student_request_id, p_step_id, v_service, p_decision, p_exemption_reason, p_amount_due, v_note, v_uid);
  PERFORM set_config('b1pfd01.fee_decision_write', '0', true);

  v_result := public.act_on_b1_student_request_step_atomic(p_step_id, 'review', v_note, '{}'::jsonb);
  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'B1_ACTION_FAILED'; END IF;

  -- the route must agree with the decision, or nothing is kept
  SELECT max(s.status) FILTER (WHERE s.step_key = 'payment_confirmation'),
         max(s.status) FILTER (WHERE s.step_key = 'registrar_apply')
    INTO v_pay, v_apply
  FROM public.student_request_workflow_steps s WHERE s.student_request_id = v_step.student_request_id;
  IF (p_decision = 'FEE_REQUIRED' AND (v_pay, v_apply) IS DISTINCT FROM ('active', 'pending'))
     OR (p_decision = 'FEE_NOT_REQUIRED' AND (v_pay, v_apply) IS DISTINCT FROM ('skipped', 'active')) THEN
    RAISE EXCEPTION 'B1_FEE_DECISION_ROUTING_MISMATCH';
  END IF;

  SELECT r.request_number, sp.user_id INTO v_number, v_student
  FROM public.student_requests r LEFT JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE r.id = v_step.student_request_id;
  v_label := CASE v_service WHEN 'department_transfer' THEN 'التحويل بين الأقسام' ELSE 'الفرصة الأخيرة' END;
  IF p_decision = 'FEE_REQUIRED' THEN
    v_amount := CASE WHEN p_amount_due = trunc(p_amount_due) THEN trunc(p_amount_due)::text
                     ELSE to_char(p_amount_due, 'FM9999999990.00') END;
    v_title := 'رسوم مستحقة على طلب ' || v_label;
    v_message := 'قرّر مسجل الكلية أن طلبك رقم ' || COALESCE(v_number, '') || ' (' || v_label ||
      ') يستلزم سداد رسوم الخدمة. المبلغ المستحق: ' || v_amount ||
      ' ريال. سدّد الرسوم في النظام الجامعي الرئيسي، وبعد أن يؤكد موظف الإيرادات الاستلام يُستكمل الطلب. لا يتم أي سداد داخل البوابة.';
  ELSE
    v_title := 'لا يلزم سداد رسوم لطلب ' || v_label;
    v_message := 'قرّر مسجل الكلية أن طلبك رقم ' || COALESCE(v_number, '') || ' (' || v_label ||
      ') لا يستلزم سداد رسوم (' || CASE p_exemption_reason WHEN 'FREE_SERVICE' THEN 'خدمة مجانية' ELSE 'إعفاء' END ||
      ')، وانتقل الطلب إلى الخطوة التالية لدى مسجل الكلية.';
  END IF;

  INSERT INTO public.student_request_workflow_events (student_request_id, workflow_step_runtime_id, event_type,
    actor_user_id, actor_unit_id, actor_role_id, message_ar, payload, visible_to_student)
  VALUES (v_step.student_request_id, p_step_id, 'fee_decision_recorded', v_uid, v_step.processing_unit_id,
    v_step.processing_role_id, v_message,
    jsonb_build_object('decision', p_decision, 'exemption_reason', p_exemption_reason, 'amount_due', v_amount), true);
  PERFORM public.create_notification(v_student, v_title, v_message, 'request', 'student_request', v_step.student_request_id);

  RETURN jsonb_build_object('success', true, 'step_id', p_step_id, 'request_id', v_step.student_request_id,
    'decision', p_decision, 'exemption_reason', p_exemption_reason, 'amount_due', v_amount,
    'next_step_id', v_result -> 'next_step_id');
END;
$function$;

-- Read side: the owning student, or a direct assignee of a step of that request.
CREATE OR REPLACE FUNCTION public.get_b1_fee_decision(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object('requestId', d.request_id, 'decision', d.decision,
    'exemptionReason', d.exemption_reason,
    'amountDue', CASE WHEN d.amount_due IS NULL THEN NULL
                      WHEN d.amount_due = trunc(d.amount_due) THEN trunc(d.amount_due)::text
                      ELSE to_char(d.amount_due, 'FM9999999990.00') END,
    'decidedAt', d.decided_at)
  FROM public.b1_request_fee_decisions d
  JOIN public.student_requests r ON r.id = d.request_id
  WHERE d.request_id = p_request_id AND auth.uid() IS NOT NULL
    AND (EXISTS (SELECT 1 FROM public.student_profiles sp
                 WHERE sp.id = r.student_profile_id AND sp.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                 WHERE s.student_request_id = d.request_id AND public.user_matches_workflow_runtime_step(s.id)));
$function$;

REVOKE ALL ON FUNCTION public.b1_fee_decision_step(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_b1_request_fee_decision_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_b1_fee_decision(uuid, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_b1_fee_decision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_b1_fee_decision(uuid, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_b1_fee_decision(uuid) TO authenticated;

INSERT INTO public.request_workflow_transition_condition_catalog (code, name_ar, description_ar, sort_order)
VALUES ('B1_FEE_NOT_REQUIRED', 'لا رسوم مستحقة بقرار المسجل',
  'ينطبق عندما يسجّل مسجل الكلية أن الطلب مجاني أو معفى من الرسوم', 70)
ON CONFLICT (code) DO NOTHING;

-- 2. Engine patches + 3. workflows -------------------------------------------------
DO $apply$
DECLARE
  v_patch record;
  v_def text;
  v_hits integer;
  v_svc record;
  v_count integer;
  v_type uuid;
  v_old public.request_type_workflows%ROWTYPE;
  v_new uuid;
  v_dean uuid;
  v_pay uuid;
  v_apply uuid;
  v_pay_order integer;
  v_row record;
  v_map jsonb;
  v_id uuid;
  v_new_ids uuid[] := '{}'::uuid[];
  v_before text;
BEGIN
  IF (SELECT count(*) FROM public.request_workflow_transition_condition_catalog c
      WHERE c.code = 'B1_FEE_NOT_REQUIRED' AND c.is_active) <> 1 THEN
    RAISE EXCEPTION 'B1_PFD01_FEE_CONDITION_MUST_BE_ACTIVE_IN_CATALOG';
  END IF;
  -- exactly one effective direct assignee for the registrar step; REVIEW must be a neutral action
  IF (SELECT count(*) FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'registrar' AND u.is_active
      JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id
        AND r.code = 'registrar_general' AND r.is_active
      WHERE a.is_active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now())
        AND public.is_valid_b1_direct_assignment(a.id, NULL, false)) <> 1 THEN
    RAISE EXCEPTION 'B1_PFD01_REGISTRAR_DIRECT_ASSIGNEE_MUST_RESOLVE_EXACTLY_ONCE';
  END IF;
  IF (SELECT count(*) FROM public.request_workflow_action_catalog c
      WHERE c.code = 'REVIEW' AND c.is_active AND c.action_type = 'review' AND c.kind = 'neutral') <> 1 THEN
    RAISE EXCEPTION 'B1_PFD01_CATALOG_ACTION_REVIEW_MISSING_OR_DRIFTED';
  END IF;

  -- what must stay byte-identical: requests, runtime, request types, existing
  -- workflow definitions and every excused-absence object
  SELECT md5(concat_ws('|',
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM public.student_requests r),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.student_request_workflow_steps s),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.request_types t),
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text FROM public.request_processing_assignments a),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.request_type_workflow_steps s),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.request_type_workflow_transitions t),
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)::text FROM public.excused_absence_fee_decisions d),
    (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.proname) FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%excused\_absence%')))
    INTO v_before;

  FOR v_patch IN
    SELECT * FROM (VALUES
      (1, 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'B1PFD01:fee-decision-required',
       'PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);',
       'PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);' || E'\n' ||
       '  /* B1PFD01:fee-decision-required */' || E'\n' ||
       '  IF public.b1_fee_decision_step(v_step.id) IS NOT NULL AND NOT EXISTS (' || E'\n' ||
       '    SELECT 1 FROM public.b1_request_fee_decisions d WHERE d.runtime_step_id = v_step.id) THEN' || E'\n' ||
       '    RAISE EXCEPTION ''B1_FEE_DECISION_REQUIRED'' USING ERRCODE = ''22023'';' || E'\n' ||
       '  END IF;'),
      (2, 'public.evaluate_workflow_transition_condition(uuid,jsonb)', 'B1PFD01:fee-not-required-condition',
       'ELSIF v_code = ''FEE_GREATER_THAN_ZERO'' THEN',
       'ELSIF v_code = ''B1_FEE_NOT_REQUIRED'' THEN' || E'\n' ||
       '    /* B1PFD01:fee-not-required-condition */' || E'\n' ||
       '    RETURN EXISTS (SELECT 1 FROM public.b1_request_fee_decisions d' || E'\n' ||
       '                   WHERE d.request_id = p_request_id AND d.decision = ''FEE_NOT_REQUIRED'');' || E'\n' ||
       '  ELSIF v_code = ''FEE_GREATER_THAN_ZERO'' THEN')
    ) AS p(ord, fn, marker, anchor, replacement) ORDER BY ord
  LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_patch.fn));
    IF v_def IS NULL THEN RAISE EXCEPTION 'B1_PFD01_PATCH_SOURCE_MISSING:%', v_patch.marker; END IF;
    CONTINUE WHEN position(v_patch.marker in v_def) > 0;
    v_hits := (length(v_def) - length(replace(v_def, v_patch.anchor, ''))) / length(v_patch.anchor);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'B1_PFD01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:%:%', v_patch.marker, v_hits;
    END IF;
    EXECUTE replace(v_def, v_patch.anchor, v_patch.replacement);
    IF position(v_patch.marker in pg_get_functiondef(to_regprocedure(v_patch.fn))) = 0 THEN
      RAISE EXCEPTION 'B1_PFD01_PATCH_NOT_EFFECTIVE:%', v_patch.marker;
    END IF;
  END LOOP;

  FOR v_svc IN
    SELECT * FROM (VALUES ('department_transfer'::text, 'dean_approval'::text), ('final_chance', 'dean_decision')) AS s(code, dean_key)
  LOOP
    SELECT count(*), (array_agg(rt.id))[1] INTO v_count, v_type FROM public.request_types rt WHERE rt.code = v_svc.code;
    IF v_count <> 1 THEN RAISE EXCEPTION 'B1_PFD01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:%:%', v_svc.code, v_count; END IF;
    SELECT count(*) INTO v_count FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type AND w.status = 'active' AND w.is_active;
    IF v_count <> 1 THEN RAISE EXCEPTION 'B1_PFD01_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE:%:%', v_svc.code, v_count; END IF;
    SELECT w.* INTO v_old FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type AND w.status = 'active' AND w.is_active FOR UPDATE;
    IF v_old.code IS DISTINCT FROM v_svc.code || '_external_payment_workflow' THEN
      RAISE EXCEPTION 'B1_PFD01_UNEXPECTED_ACTIVE_WORKFLOW_CODE:%:%', v_svc.code, v_old.code;
    END IF;

    -- already published by an earlier run
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                          WHERE s.workflow_id = v_old.id AND s.step_key = 'registrar_fee_decision');

    -- re-apply after a rollback: the retired fee-decision version is re-activated, not cloned again
    SELECT w.id INTO v_new FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type AND w.code = v_old.code AND w.version = v_old.version + 1 AND w.status = 'retired'
      AND EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                  WHERE s.workflow_id = w.id AND s.step_key = 'registrar_fee_decision');
    IF v_new IS NULL THEN
      SELECT max(s.id::text) FILTER (WHERE s.step_key = v_svc.dean_key AND s.action_type = 'approve')::uuid,
             max(s.id::text) FILTER (WHERE s.step_key = 'payment_confirmation' AND s.action_type = 'confirm_payment')::uuid,
             max(s.id::text) FILTER (WHERE s.step_key = 'registrar_apply' AND s.action_type = 'apply_decision')::uuid,
             max(s.step_order) FILTER (WHERE s.step_key = 'payment_confirmation')
        INTO v_dean, v_pay, v_apply, v_pay_order
      FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id;
      -- exactly the shape published by 20260811202824 — anything else stops
      IF v_dean IS NULL OR v_pay IS NULL OR v_apply IS NULL
         OR (SELECT count(*) FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id
             AND s.step_key IN (v_svc.dean_key, 'payment_confirmation', 'registrar_apply')) <> 3
         OR EXISTS (SELECT 1 FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id
                    AND (s.can_skip OR s.action_type = 'assess_fee' OR s.step_order > v_pay_order + 1))
         OR (SELECT step_order FROM public.request_type_workflow_steps WHERE id = v_dean) <> v_pay_order - 1
         OR (SELECT step_order FROM public.request_type_workflow_steps WHERE id = v_apply) <> v_pay_order + 1
         OR (SELECT count(*) FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_old.id
             AND t.from_step_id = v_dean) <> 2
         OR (SELECT count(*) FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_old.id
             AND t.from_step_id = v_dean AND t.to_step_id = v_pay AND t.action_result = 'approved'
             AND NOT t.is_default AND t.condition_schema ->> 'code' = 'FEE_GREATER_THAN_ZERO') <> 1
         OR (SELECT count(*) FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_old.id
             AND t.from_step_id = v_dean AND t.to_step_id = v_apply AND t.action_result = 'approved'
             AND t.is_default AND COALESCE(t.condition_schema, '{}'::jsonb) = '{}'::jsonb) <> 1
         OR (SELECT count(*) FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_old.id
             AND COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) <> 1
         OR (SELECT max(w.version) FROM public.request_type_workflows w
             WHERE w.request_type_id = v_type AND w.code = v_old.code) <> v_old.version THEN
        RAISE EXCEPTION 'B1_PFD01_UNEXPECTED_WORKFLOW_SHAPE:%', v_svc.code;
      END IF;

      INSERT INTO public.request_type_workflows
        (request_type_id, code, name_ar, name_en, description_ar, version, status, is_active, change_note)
      VALUES (v_type, v_old.code, v_old.name_ar, v_old.name_en, v_old.description_ar, v_old.version + 1, 'draft', false,
        'B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01: قرار رسوم لكل طلب لدى مسجل الكلية قبل تأكيد السداد')
      RETURNING id INTO v_new;
      v_new_ids := v_new_ids || v_new;

      -- steps: an exact copy; the fee-decision step (cloned from registrar_apply for its
      -- unit / role) takes the payment step's place; payment becomes skippable
      v_map := '{}'::jsonb;
      FOR v_row IN
        SELECT s.*, false AS is_fee_step FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id
        UNION ALL
        SELECT s.*, true FROM public.request_type_workflow_steps s WHERE s.id = v_apply
      LOOP
        INSERT INTO public.request_type_workflow_steps (
          workflow_id, step_key, step_name_ar, step_name_en, description_ar, step_order,
          processing_unit_id, processing_role_id, assignment_strategy, action_type, action_code,
          status_on_enter, status_on_complete, is_required, can_return_to_student, can_reject, can_skip,
          notify_on_enter, notify_on_complete, visible_to_student, requires_attachment, requires_payment,
          produces_document, form_schema, config)
        VALUES (v_new,
          CASE WHEN v_row.is_fee_step THEN 'registrar_fee_decision' ELSE v_row.step_key END,
          CASE WHEN v_row.is_fee_step THEN 'قرار مسجل الكلية بشأن الرسوم' ELSE v_row.step_name_ar END,
          CASE WHEN v_row.is_fee_step THEN NULL ELSE v_row.step_name_en END,
          CASE WHEN v_row.is_fee_step THEN NULL ELSE v_row.description_ar END,
          CASE WHEN v_row.is_fee_step THEN v_pay_order
               WHEN v_row.step_order >= v_pay_order THEN v_row.step_order + 1 ELSE v_row.step_order END,
          v_row.processing_unit_id, v_row.processing_role_id, v_row.assignment_strategy,
          CASE WHEN v_row.is_fee_step THEN 'review' ELSE v_row.action_type END,
          CASE WHEN v_row.is_fee_step THEN 'REVIEW' ELSE v_row.action_code END,
          v_row.status_on_enter, v_row.status_on_complete, v_row.is_required,
          v_row.can_return_to_student AND NOT v_row.is_fee_step, v_row.can_reject AND NOT v_row.is_fee_step,
          v_row.id = v_pay AND NOT v_row.is_fee_step,
          v_row.notify_on_enter, v_row.notify_on_complete, v_row.visible_to_student,
          v_row.requires_attachment AND NOT v_row.is_fee_step, v_row.requires_payment AND NOT v_row.is_fee_step,
          v_row.produces_document AND NOT v_row.is_fee_step, v_row.form_schema,
          CASE WHEN v_row.is_fee_step
            THEN jsonb_build_object('authorization', 'exactly_one_direct_assignee', 'department_scope', 'request',
                                    'fee_decision', 'REGISTRAR_PER_REQUEST')
            ELSE v_row.config END)
        RETURNING id INTO v_id;
        v_map := v_map || jsonb_build_object(CASE WHEN v_row.is_fee_step THEN 'fee' ELSE v_row.id::text END, v_id);
      END LOOP;

      -- transitions: every edge except the two broken dean exits, plus the fee decision
      INSERT INTO public.request_type_workflow_transitions
        (workflow_id, from_step_id, to_step_id, action_result, label_ar, condition_schema, is_default, priority)
      SELECT v_new, (v_map ->> t.from_step_id::text)::uuid, (v_map ->> t.to_step_id::text)::uuid, t.action_result,
             t.label_ar, COALESCE(t.condition_schema, '{}'::jsonb), t.is_default, t.priority
      FROM public.request_type_workflow_transitions t
      WHERE t.workflow_id = v_old.id AND t.from_step_id IS DISTINCT FROM v_dean
      UNION ALL
      SELECT v_new, (v_map ->> x.f)::uuid, (v_map ->> x.t)::uuid, x.result, x.label, x.cond, x.is_default, x.priority
      FROM (VALUES
        (v_dean::text, 'fee', 'approved', 'بعد موافقة العميد — قرار مسجل الكلية بشأن الرسوم', '{}'::jsonb, true, 0),
        ('fee', v_pay::text, 'reviewed', 'رسوم مستحقة — تأكيد السداد الخارجي', '{}'::jsonb, true, 0),
        ('fee', v_apply::text, 'reviewed', 'لا رسوم (خدمة مجانية أو إعفاء) — تخطي تأكيد السداد',
          jsonb_build_object('code', 'B1_FEE_NOT_REQUIRED', 'params', '{}'::jsonb), false, 100)
      ) AS x(f, t, result, label, cond, is_default, priority);

      INSERT INTO public.b1_workflow_runtime_contract_snapshot
        (workflow_id, request_type_code, workflow_version, step_key, step_order, unit_code, role_code, action_type, action_code)
      SELECT s.workflow_id, v_svc.code, v_old.version + 1, s.step_key, s.step_order, u.code, r.code, s.action_type, s.action_code
      FROM public.request_type_workflow_steps s
      JOIN public.request_processing_units u ON u.id = s.processing_unit_id
      JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
      WHERE s.workflow_id = v_new;
      IF (SELECT count(*) FROM public.request_type_workflow_steps s
          JOIN public.request_processing_units u ON u.id = s.processing_unit_id
          JOIN public.request_processing_roles r ON r.id = s.processing_role_id
          WHERE s.workflow_id = v_new
            AND public.b1_runtime_step_contract_ok(v_svc.code, s.workflow_id, s.step_key, u.code, r.code, s.action_type))
         <> (SELECT count(*) + 1 FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_old.id) THEN
        RAISE EXCEPTION 'B1_PFD01_RUNTIME_CONTRACT_PIN_INCOMPLETE:%', v_svc.code;
      END IF;
    END IF;

    PERFORM public.validate_request_workflow_publish(v_new);
    UPDATE public.request_type_workflows SET status = 'retired', is_active = false, updated_at = now()
    WHERE request_type_id = v_type AND id <> v_new AND is_active;
    UPDATE public.request_type_workflows SET status = 'active', is_active = true, updated_at = now() WHERE id = v_new;
    INSERT INTO public.request_workflow_publish_validations (workflow_id, request_type_code, is_valid, message)
    VALUES (v_new, v_svc.code, true, 'PUBLISHED_V' || (v_old.version + 1) || '_B1_PAID_SERVICES_REGISTRAR_FEE_DECISION_01');
    INSERT INTO public.request_type_workflow_change_log
      (request_type_id, workflow_id, version, change_kind, change_note, snapshot, changed_by)
    VALUES (v_type, v_new, v_old.version + 1, 'workflow_published',
      'قرار رسوم لكل طلب لدى مسجل الكلية قبل تأكيد السداد؛ أُزيل تفرّع FEE_GREATER_THAN_ZERO غير القابل للتنفيذ.',
      jsonb_build_object('package', 'B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01', 'workflow_code', v_old.code,
        'superseded_workflow_id', v_old.id, 'superseded_version', v_old.version,
        'added_step', 'registrar_fee_decision', 'payment_policy', 'REGISTRAR_FEE_DECISION_EXTERNAL_PAYMENT'),
      NULL);
  END LOOP;

  -- 4. post-conditions — any violation rolls everything back
  FOR v_svc IN
    SELECT * FROM (VALUES ('department_transfer'::text, 'dean_approval'::text), ('final_chance', 'dean_decision')) AS s(code, dean_key)
  LOOP
    SELECT count(*), (array_agg(w.id))[1] INTO v_count, v_new
    FROM public.request_type_workflows w JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = v_svc.code AND w.status = 'active' AND w.is_active;
    IF v_count <> 1
       OR (SELECT string_agg(s.step_key || CASE WHEN s.can_skip THEN '*' ELSE '' END, '>' ORDER BY s.step_order)
           FROM public.request_type_workflow_steps s
           WHERE s.workflow_id = v_new AND s.step_order >= (SELECT step_order FROM public.request_type_workflow_steps
                                                             WHERE workflow_id = v_new AND step_key = v_svc.dean_key))
          IS DISTINCT FROM v_svc.dean_key || '>registrar_fee_decision>payment_confirmation*>registrar_apply'
       OR (SELECT string_agg(COALESCE(fs.step_key, '') || '-' || t.action_result || '-' || COALESCE(ts.step_key, '')
                    || CASE WHEN t.is_default THEN '' ELSE '?' || (t.condition_schema ->> 'code') END, ' '
                    ORDER BY fs.step_order, t.is_default DESC)
           FROM public.request_type_workflow_transitions t
           JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
           LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
           WHERE t.workflow_id = v_new AND fs.step_order >= (SELECT step_order FROM public.request_type_workflow_steps
                                                              WHERE workflow_id = v_new AND step_key = v_svc.dean_key))
          IS DISTINCT FROM v_svc.dean_key || '-approved-registrar_fee_decision'
            || ' registrar_fee_decision-reviewed-payment_confirmation'
            || ' registrar_fee_decision-reviewed-registrar_apply?B1_FEE_NOT_REQUIRED'
            || ' payment_confirmation-payment_confirmed-registrar_apply registrar_apply-applied-'
       OR EXISTS (SELECT 1 FROM public.request_type_workflow_transitions t
                  WHERE t.workflow_id = v_new AND t.action_result = 'skip') THEN
      RAISE EXCEPTION 'B1_PFD01_POST_WORKFLOW_SHAPE_INVALID:%', v_svc.code;
    END IF;
  END LOOP;

  IF v_before IS DISTINCT FROM (SELECT md5(concat_ws('|',
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM public.student_requests r),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.student_request_workflow_steps s),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.request_types t),
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text FROM public.request_processing_assignments a),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.request_type_workflow_steps s
      WHERE s.workflow_id <> ALL (v_new_ids)),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.request_type_workflow_transitions t
      WHERE t.workflow_id <> ALL (v_new_ids)),
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)::text FROM public.excused_absence_fee_decisions d),
    (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.proname) FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%excused\_absence%')))) THEN
    RAISE EXCEPTION 'B1_PFD01_POST_PROTECTED_STATE_CHANGED';
  END IF;
  RAISE NOTICE 'B1_PFD01: % workflow(s) published', COALESCE(array_length(v_new_ids, 1), 0);
END;
$apply$;

COMMIT;
