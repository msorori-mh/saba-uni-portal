INSERT INTO public.request_workflow_action_catalog(code,name_ar,description_ar,kind,action_type,sort_order)
VALUES ('CLEAR','إخلاء طرف','تأكيد إخلاء الطرف من الجهة المعنية','neutral','clear',35)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  r record; v_old uuid; v_new uuid; v_version integer; v_type_id uuid; v_code text;
  v_map jsonb; s record; tr record; v_action_code text; v_pay_step uuid; v_after_pay uuid;
  v_dean_step uuid;
BEGIN
  FOR r IN
    SELECT rt.id AS type_id, rt.code, w.id AS wf_id, w.code AS wf_code, w.name_ar, w.name_en, w.description_ar
    FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE w.status='active' AND rt.code IN
      ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
  LOOP
    v_old := r.wf_id; v_type_id := r.type_id; v_code := r.code; v_map := '{}'::jsonb;

    SELECT COALESCE(max(w.version),0)+1 INTO v_version FROM public.request_type_workflows w
    WHERE w.request_type_id = v_type_id AND w.code = r.wf_code;

    INSERT INTO public.request_type_workflows(request_type_id, code, name_ar, name_en, description_ar,
      version, status, is_active)
    VALUES (v_type_id, r.wf_code, r.name_ar, r.name_en, r.description_ar, v_version, 'draft', false)
    RETURNING id INTO v_new;

    FOR s IN SELECT * FROM public.request_type_workflow_steps WHERE workflow_id = v_old ORDER BY step_order LOOP
      v_action_code := CASE s.action_type
        WHEN 'review' THEN 'REVIEW'
        WHEN 'approve' THEN 'APPROVE'
        WHEN 'clear' THEN 'CLEAR'
        WHEN 'assess_fee' THEN 'ASSESS_FEE'
        WHEN 'confirm_payment' THEN 'PAYMENT_CONFIRMATION'
        WHEN 'archive' THEN 'ARCHIVE'
        WHEN 'sign' THEN 'SIGN'
        WHEN 'apply_decision' THEN CASE v_code
          WHEN 'enrollment_suspension' THEN 'APPLY_ENROLLMENT_SUSPENSION'
          WHEN 'excused_absence' THEN 'REGISTER_EXCUSED_ABSENCE'
          WHEN 'department_transfer' THEN 'APPLY_DEPARTMENT_TRANSFER'
          WHEN 'final_chance' THEN 'APPLY_FINAL_CHANCE'
          WHEN 'file_withdrawal' THEN 'WITHDRAW_STUDENT_FILE' END
        ELSE NULL END;

      INSERT INTO public.request_type_workflow_steps(
        workflow_id, step_key, step_name_ar, step_name_en, description_ar, step_order,
        processing_unit_id, processing_role_id, assignment_strategy, action_type, action_code,
        status_on_enter, status_on_complete, is_required, can_return_to_student, can_reject, can_skip,
        notify_on_enter, notify_on_complete, visible_to_student, requires_attachment, requires_payment,
        produces_document, form_schema, config)
      VALUES (v_new, s.step_key, s.step_name_ar, s.step_name_en, s.description_ar, s.step_order,
        s.processing_unit_id, s.processing_role_id, s.assignment_strategy, s.action_type, v_action_code,
        s.status_on_enter, s.status_on_complete, s.is_required, s.can_return_to_student, s.can_reject, s.can_skip,
        s.notify_on_enter, s.notify_on_complete, s.visible_to_student, s.requires_attachment,
        COALESCE(s.requires_payment, s.action_type = 'confirm_payment'),
        s.produces_document, s.form_schema, s.config)
      RETURNING id INTO v_pay_step;
      v_map := v_map || jsonb_build_object(s.step_key, v_pay_step);
    END LOOP;

    FOR tr IN
      SELECT t.*, fs.step_key AS from_key, ts.step_key AS to_key
      FROM public.request_type_workflow_transitions t
      LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
      LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = v_old
    LOOP
      INSERT INTO public.request_type_workflow_transitions(
        workflow_id, from_step_id, to_step_id, action_result, label_ar, condition_schema, is_default, priority)
      VALUES (v_new,
        CASE WHEN tr.from_key IS NULL THEN NULL ELSE (v_map ->> tr.from_key)::uuid END,
        CASE WHEN tr.to_key IS NULL THEN NULL ELSE (v_map ->> tr.to_key)::uuid END,
        tr.action_result, tr.label_ar, COALESCE(tr.condition_schema,'{}'::jsonb), tr.is_default, 0);
    END LOOP;

    -- fee branching for paid services: dean approval -> payment only when a fee is due
    IF v_code IN ('department_transfer','final_chance') THEN
      v_dean_step := (v_map ->> CASE v_code WHEN 'department_transfer' THEN 'dean_approval' ELSE 'dean_decision' END)::uuid;
      v_pay_step := (v_map ->> 'payment_confirmation')::uuid;
      v_after_pay := (v_map ->> 'registrar_apply')::uuid;

      -- existing default (dean -> payment) becomes the conditional paid branch
      UPDATE public.request_type_workflow_transitions
        SET condition_schema = jsonb_build_object('code','FEE_GREATER_THAN_ZERO','params','{}'::jsonb),
            is_default = false, priority = 100,
            label_ar = 'توجد رسوم مستحقة — تفعيل خطوة السداد'
      WHERE workflow_id = v_new AND from_step_id = v_dean_step AND to_step_id = v_pay_step
        AND action_result = 'approved';

      -- new default: no fee due -> straight to registrar apply
      INSERT INTO public.request_type_workflow_transitions(
        workflow_id, from_step_id, to_step_id, action_result, label_ar, condition_schema, is_default, priority)
      VALUES (v_new, v_dean_step, v_after_pay, 'approved',
        'لا توجد رسوم — تخطي تأكيد السداد', '{}'::jsonb, true, 0);
    END IF;

    PERFORM public.validate_request_workflow_publish(v_new);

    UPDATE public.request_type_workflows SET status='retired', is_active=false, updated_at=now()
    WHERE request_type_id = v_type_id AND id <> v_new AND is_active = true;
    UPDATE public.request_type_workflows SET status='active', is_active=true, updated_at=now()
    WHERE id = v_new;

    INSERT INTO public.request_workflow_publish_validations(workflow_id, request_type_code, is_valid, message)
    VALUES (v_new, v_code, true, 'PUBLISHED_V' || v_version || '_CONFIG_DRIVEN');
  END LOOP;
END $$;