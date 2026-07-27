-- PROMOTED MIGRATION - order 17
-- Source: supabase/migrations/20260725111000_b1_17_external_university_payment_workflows_02.sql
-- LF SHA-256: 841daba372958e2e7d53d3bc3364dd93cfd67e1b95057c0d58c2a0207c4a8f01

DO $migration$
DECLARE
  v_service record;
  v_request_type_id uuid;
  v_workflow_id uuid;
  v_version integer;
  v_existing_count integer;
  v_unit_id uuid;
  v_role_id uuid;
  v_step record;
  v_transition record;
  v_step_ids jsonb;
  v_from_id uuid;
  v_to_id uuid;
  v_contract_marker constant text :=
    'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION/workflow-v1';
BEGIN
  FOR v_service IN
    SELECT *
    FROM (VALUES
      (
        'department_transfer'::text,
        ARRAY['department_transfer','transfer']::text[],
        'تحويل من قسم إلى قسم'::text,
        jsonb_build_array(
          jsonb_build_object('key','student_affairs_intake','name_ar','مراجعة شؤون الطلاب','unit','student_affairs','role','student_affairs_specialist','action','review','scope','request'),
          jsonb_build_object('key','source_department_head_approval','name_ar','موافقة رئيس القسم الحالي','unit','department','role','department_head','action','approve','scope','source_department'),
          jsonb_build_object('key','target_department_head_approval','name_ar','موافقة رئيس القسم المطلوب','unit','department','role','department_head','action','approve','scope','target_department'),
          jsonb_build_object('key','dean_approval','name_ar','موافقة العميد','unit','dean','role','dean','action','approve','scope','request'),
          jsonb_build_object('key','payment_confirmation','name_ar','تأكيد استلام الرسوم خارج البوابة','unit','finance','role','revenue_finance_officer','action','confirm_payment','scope','request'),
          jsonb_build_object('key','registrar_apply','name_ar','تطبيق قرار التحويل','unit','registrar','role','registrar_general','action','apply_decision','scope','request')
        ),
        jsonb_build_array(
          jsonb_build_object('from',NULL,'to','student_affairs_intake','result','submit'),
          jsonb_build_object('from','student_affairs_intake','to','source_department_head_approval','result','reviewed'),
          jsonb_build_object('from','source_department_head_approval','to','target_department_head_approval','result','approved'),
          jsonb_build_object('from','target_department_head_approval','to','dean_approval','result','approved'),
          jsonb_build_object('from','dean_approval','to','payment_confirmation','result','approved'),
          jsonb_build_object('from','payment_confirmation','to','registrar_apply','result','payment_confirmed'),
          jsonb_build_object('from','registrar_apply','to',NULL,'result','applied')
        )
      ),
      (
        'final_chance'::text,
        ARRAY['final_chance','extra_chance']::text[],
        'فرصة نهائية للاختبار'::text,
        jsonb_build_array(
          jsonb_build_object('key','student_affairs_intake','name_ar','مراجعة شؤون الطلاب','unit','student_affairs','role','student_affairs_specialist','action','review','scope','request'),
          jsonb_build_object('key','manager_review','name_ar','مراجعة مدير شؤون الطلاب','unit','student_affairs','role','student_affairs_manager','action','approve','scope','request'),
          jsonb_build_object('key','dean_decision','name_ar','قرار العميد','unit','dean','role','dean','action','approve','scope','request'),
          jsonb_build_object('key','payment_confirmation','name_ar','تأكيد استلام الرسوم خارج البوابة','unit','finance','role','revenue_finance_officer','action','confirm_payment','scope','request'),
          jsonb_build_object('key','registrar_apply','name_ar','تطبيق فرصة الاختبار النهائية','unit','registrar','role','registrar_general','action','apply_decision','scope','request')
        ),
        jsonb_build_array(
          jsonb_build_object('from',NULL,'to','student_affairs_intake','result','submit'),
          jsonb_build_object('from','student_affairs_intake','to','manager_review','result','reviewed'),
          jsonb_build_object('from','manager_review','to','dean_decision','result','approved'),
          jsonb_build_object('from','dean_decision','to','payment_confirmation','result','approved'),
          jsonb_build_object('from','payment_confirmation','to','registrar_apply','result','payment_confirmed'),
          jsonb_build_object('from','registrar_apply','to',NULL,'result','applied')
        )
      )
    ) AS services(canonical_code, stored_codes, name_ar, steps, transitions)
  LOOP
    SELECT count(*), (array_agg(rt.id ORDER BY rt.id))[1]
      INTO v_existing_count, v_request_type_id
    FROM public.request_types rt
    WHERE rt.code = ANY(v_service.stored_codes);

    IF v_existing_count <> 1 THEN
      RAISE EXCEPTION 'PAYMENT_WORKFLOW_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:%:%',
        v_service.canonical_code, v_existing_count;
    END IF;

    SELECT count(*), (array_agg(w.id ORDER BY w.id))[1]
      INTO v_existing_count, v_workflow_id
    FROM public.request_type_workflows w
    WHERE w.request_type_id = v_request_type_id
      AND w.code = v_service.canonical_code || '_external_payment_workflow'
      AND w.status = 'draft'
      AND w.is_active = false
      AND w.description_ar = v_contract_marker;

    IF v_existing_count > 1 THEN
      RAISE EXCEPTION 'DUPLICATE_EXTERNAL_PAYMENT_WORKFLOW_DRAFT:%', v_service.canonical_code;
    END IF;

    IF v_existing_count = 0 THEN
      SELECT COALESCE(max(w.version), 0) + 1
        INTO v_version
      FROM public.request_type_workflows w
      WHERE w.request_type_id = v_request_type_id
        AND w.code = v_service.canonical_code || '_external_payment_workflow';

      INSERT INTO public.request_type_workflows (
        request_type_id, code, name_ar, description_ar, version, status, is_active
      ) VALUES (
        v_request_type_id,
        v_service.canonical_code || '_external_payment_workflow',
        v_service.name_ar,
        v_contract_marker,
        v_version,
        'draft',
        false
      ) RETURNING id INTO v_workflow_id;

      v_step_ids := '{}'::jsonb;
      FOR v_step IN
        SELECT value, ordinality
        FROM jsonb_array_elements(v_service.steps) WITH ORDINALITY
        ORDER BY ordinality
      LOOP
        SELECT count(*), (array_agg(u.id ORDER BY u.id))[1]
          INTO v_existing_count, v_unit_id
        FROM public.request_processing_units u
        WHERE u.code = v_step.value ->> 'unit' AND u.is_active = true;
        IF v_existing_count <> 1 THEN
          RAISE EXCEPTION 'PROCESSING_UNIT_MUST_RESOLVE_EXACTLY_ONCE:%:%',
            v_step.value ->> 'unit', v_existing_count;
        END IF;

        SELECT count(*), (array_agg(r.id ORDER BY r.id))[1]
          INTO v_existing_count, v_role_id
        FROM public.request_processing_roles r
        WHERE r.code = v_step.value ->> 'role'
          AND r.unit_id = v_unit_id
          AND r.is_active = true;
        IF v_existing_count <> 1 THEN
          RAISE EXCEPTION 'PROCESSING_ROLE_MUST_RESOLVE_EXACTLY_ONCE:%:%',
            v_step.value ->> 'role', v_existing_count;
        END IF;

        INSERT INTO public.request_type_workflow_steps (
          workflow_id, step_key, step_name_ar, step_order,
          processing_unit_id, processing_role_id, assignment_strategy,
          action_type, status_on_enter, status_on_complete,
          is_required, can_skip, requires_payment, produces_document, config
        ) VALUES (
          v_workflow_id,
          v_step.value ->> 'key',
          v_step.value ->> 'name_ar',
          v_step.ordinality,
          v_unit_id,
          v_role_id,
          'specific_user',
          v_step.value ->> 'action',
          CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
            THEN 'awaiting_payment_confirmation' ELSE 'in_progress' END,
          CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
            THEN 'payment_confirmed' ELSE 'completed' END,
          true,
          false,
          false,
          false,
          jsonb_build_object(
            'authorization', 'exactly_one_direct_assignee',
            'department_scope', v_step.value ->> 'scope',
            'payment_policy', CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
              THEN 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION' ELSE NULL END
          )
        ) RETURNING id INTO v_unit_id;
        v_step_ids := v_step_ids || jsonb_build_object(v_step.value ->> 'key', v_unit_id);
      END LOOP;

      FOR v_transition IN SELECT value FROM jsonb_array_elements(v_service.transitions)
      LOOP
        v_from_id := CASE WHEN v_transition.value ->> 'from' IS NULL THEN NULL
          ELSE (v_step_ids ->> (v_transition.value ->> 'from'))::uuid END;
        v_to_id := CASE WHEN v_transition.value ->> 'to' IS NULL THEN NULL
          ELSE (v_step_ids ->> (v_transition.value ->> 'to'))::uuid END;

        INSERT INTO public.request_type_workflow_transitions (
          workflow_id, from_step_id, to_step_id, action_result, is_default
        ) VALUES (
          v_workflow_id, v_from_id, v_to_id, v_transition.value ->> 'result', true
        );
      END LOOP;
    END IF;

    -- Reused drafts are accepted only when their full structure still equals the
    -- declared contract. A partial or edited marker-matching draft fails closed.
    SELECT count(*) INTO v_existing_count
    FROM public.request_type_workflow_steps s
    WHERE s.workflow_id = v_workflow_id;
    IF v_existing_count <> jsonb_array_length(v_service.steps) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_service.steps) WITH ORDINALITY expected(value, ordinality)
      LEFT JOIN public.request_type_workflow_steps s
        ON s.workflow_id = v_workflow_id
       AND s.step_key = expected.value ->> 'key'
      LEFT JOIN public.request_processing_units u ON u.id = s.processing_unit_id
      LEFT JOIN public.request_processing_roles r ON r.id = s.processing_role_id
      WHERE s.id IS NULL
         OR s.step_order <> expected.ordinality
         OR u.code IS DISTINCT FROM expected.value ->> 'unit'
         OR r.code IS DISTINCT FROM expected.value ->> 'role'
         OR s.action_type IS DISTINCT FROM expected.value ->> 'action'
         OR s.assignment_strategy IS DISTINCT FROM 'specific_user'
         OR s.is_required IS DISTINCT FROM true
         OR s.can_skip IS DISTINCT FROM false
         OR s.requires_payment IS DISTINCT FROM false
         OR s.produces_document IS DISTINCT FROM false
         OR s.config ->> 'authorization' IS DISTINCT FROM 'exactly_one_direct_assignee'
         OR s.config ->> 'department_scope' IS DISTINCT FROM expected.value ->> 'scope'
         OR (expected.value ->> 'key' = 'payment_confirmation' AND (
              s.status_on_enter IS DISTINCT FROM 'awaiting_payment_confirmation'
              OR s.status_on_complete IS DISTINCT FROM 'payment_confirmed'
              OR s.config ->> 'payment_policy' IS DISTINCT FROM 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION'
            ))
         OR (expected.value ->> 'key' <> 'payment_confirmation' AND (
              s.status_on_enter IS DISTINCT FROM 'in_progress'
              OR s.status_on_complete IS DISTINCT FROM 'completed'
              OR s.config ->> 'payment_policy' IS NOT NULL
            ))
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_PAYMENT_WORKFLOW_STEP_STRUCTURE_MISMATCH:%',
        v_service.canonical_code;
    END IF;

    SELECT count(*) INTO v_existing_count
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_workflow_id;
    IF v_existing_count <> jsonb_array_length(v_service.transitions) OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_service.transitions) expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.request_type_workflow_transitions t
        LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
        LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
        WHERE t.workflow_id = v_workflow_id
          AND fs.step_key IS NOT DISTINCT FROM expected.value ->> 'from'
          AND ts.step_key IS NOT DISTINCT FROM expected.value ->> 'to'
          AND t.action_result = expected.value ->> 'result'
          AND t.is_default = true
      )
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_PAYMENT_WORKFLOW_TRANSITION_STRUCTURE_MISMATCH:%',
        v_service.canonical_code;
    END IF;

    SELECT count(*) INTO v_existing_count
    FROM public.request_type_workflow_transitions t
    JOIN public.request_type_workflow_steps s ON s.id = t.from_step_id
    WHERE t.workflow_id = v_workflow_id
      AND s.step_key = 'payment_confirmation'
      AND t.action_result = 'payment_confirmed';
    IF v_existing_count <> 1 THEN
      RAISE EXCEPTION 'EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED:%:%',
        v_service.canonical_code, v_existing_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = v_workflow_id
        AND (s.step_key = 'fee_assessment' OR s.requires_payment = true)
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_LEDGER_STEP_FORBIDDEN:%', v_service.canonical_code;
    END IF;
  END LOOP;
END;
$migration$;