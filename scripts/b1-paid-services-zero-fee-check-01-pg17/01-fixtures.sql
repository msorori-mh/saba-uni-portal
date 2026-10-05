-- B1-PAID-SERVICES-ZERO-FEE-CHECK-01 rehearsal fixtures
-- (isolated throwaway cluster ONLY).
--
-- Version 1 of both paid workflows, shaped exactly as the applied migration
-- 20260727062709 (B1-17 external university payment workflows) created them:
-- specific_user steps, can_skip = false everywhere, linear default transitions.
-- run.sh then executes the applied v2 migration block (20260811202824)
-- verbatim on top, which is what produces the fee branch under test.

INSERT INTO public.request_types (code, name_ar, category, is_active, student_visible, request_audience)
VALUES ('department_transfer','تحويل من قسم إلى قسم','academic', true, true, 'active_student'),
       ('final_chance','فرصة نهائية للاختبار','academic', true, true, 'active_student')
ON CONFLICT (code) DO UPDATE SET is_active = true;

DO $$
DECLARE v_service record; v_type uuid; v_wf uuid; v_step record; v_tr record; v_ids jsonb; v_id uuid;
BEGIN
  FOR v_service IN
    SELECT * FROM (VALUES
      ('department_transfer'::text, 'تحويل من قسم إلى قسم'::text,
        jsonb_build_array(
          jsonb_build_object('key','student_affairs_intake','name_ar','مراجعة شؤون الطلاب','unit','student_affairs','role','student_affairs_specialist','action','review','scope','request'),
          jsonb_build_object('key','source_department_head_approval','name_ar','موافقة رئيس القسم الحالي','unit','department','role','department_head','action','approve','scope','source_department'),
          jsonb_build_object('key','target_department_head_approval','name_ar','موافقة رئيس القسم المطلوب','unit','department','role','department_head','action','approve','scope','target_department'),
          jsonb_build_object('key','dean_approval','name_ar','موافقة العميد','unit','dean','role','dean','action','approve','scope','request'),
          jsonb_build_object('key','payment_confirmation','name_ar','تأكيد استلام الرسوم خارج البوابة','unit','finance','role','revenue_finance_officer','action','confirm_payment','scope','request'),
          jsonb_build_object('key','registrar_apply','name_ar','تطبيق قرار التحويل','unit','registrar','role','registrar_general','action','apply_decision','scope','request')),
        jsonb_build_array(
          jsonb_build_object('from',NULL,'to','student_affairs_intake','result','submit'),
          jsonb_build_object('from','student_affairs_intake','to','source_department_head_approval','result','reviewed'),
          jsonb_build_object('from','source_department_head_approval','to','target_department_head_approval','result','approved'),
          jsonb_build_object('from','target_department_head_approval','to','dean_approval','result','approved'),
          jsonb_build_object('from','dean_approval','to','payment_confirmation','result','approved'),
          jsonb_build_object('from','payment_confirmation','to','registrar_apply','result','payment_confirmed'),
          jsonb_build_object('from','registrar_apply','to',NULL,'result','applied'))),
      ('final_chance'::text, 'فرصة نهائية للاختبار'::text,
        jsonb_build_array(
          jsonb_build_object('key','student_affairs_intake','name_ar','مراجعة شؤون الطلاب','unit','student_affairs','role','student_affairs_specialist','action','review','scope','request'),
          jsonb_build_object('key','manager_review','name_ar','مراجعة مدير شؤون الطلاب','unit','student_affairs','role','student_affairs_manager','action','approve','scope','request'),
          jsonb_build_object('key','dean_decision','name_ar','قرار العميد','unit','dean','role','dean','action','approve','scope','request'),
          jsonb_build_object('key','payment_confirmation','name_ar','تأكيد استلام الرسوم خارج البوابة','unit','finance','role','revenue_finance_officer','action','confirm_payment','scope','request'),
          jsonb_build_object('key','registrar_apply','name_ar','تطبيق فرصة الاختبار النهائية','unit','registrar','role','registrar_general','action','apply_decision','scope','request')),
        jsonb_build_array(
          jsonb_build_object('from',NULL,'to','student_affairs_intake','result','submit'),
          jsonb_build_object('from','student_affairs_intake','to','manager_review','result','reviewed'),
          jsonb_build_object('from','manager_review','to','dean_decision','result','approved'),
          jsonb_build_object('from','dean_decision','to','payment_confirmation','result','approved'),
          jsonb_build_object('from','payment_confirmation','to','registrar_apply','result','payment_confirmed'),
          jsonb_build_object('from','registrar_apply','to',NULL,'result','applied')))
    ) AS services(code, name_ar, steps, transitions)
  LOOP
    SELECT id INTO v_type FROM public.request_types WHERE code = v_service.code;
    INSERT INTO public.request_type_workflows
      (request_type_id, code, name_ar, description_ar, version, status, is_active, published_at)
    VALUES (v_type, v_service.code || '_external_payment_workflow', v_service.name_ar,
            'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION/workflow-v1', 1, 'active', true, now())
    RETURNING id INTO v_wf;

    v_ids := '{}'::jsonb;
    FOR v_step IN SELECT value, ordinality FROM jsonb_array_elements(v_service.steps) WITH ORDINALITY ORDER BY ordinality LOOP
      INSERT INTO public.request_type_workflow_steps
        (workflow_id, step_key, step_name_ar, step_order, processing_unit_id, processing_role_id,
         assignment_strategy, action_type, status_on_enter, status_on_complete,
         is_required, can_skip, requires_payment, produces_document, config)
      SELECT v_wf, v_step.value ->> 'key', v_step.value ->> 'name_ar', v_step.ordinality, u.id, r.id,
             'specific_user', v_step.value ->> 'action',
             CASE WHEN v_step.value ->> 'key' = 'payment_confirmation' THEN 'awaiting_payment_confirmation' ELSE 'in_progress' END,
             CASE WHEN v_step.value ->> 'key' = 'payment_confirmation' THEN 'payment_confirmed' ELSE 'completed' END,
             true, false, false, false,
             jsonb_build_object('authorization','exactly_one_direct_assignee',
               'department_scope', v_step.value ->> 'scope',
               'payment_policy', CASE WHEN v_step.value ->> 'key' = 'payment_confirmation'
                 THEN 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION' ELSE NULL END)
      FROM public.request_processing_units u
      JOIN public.request_processing_roles r ON r.unit_id = u.id AND r.code = v_step.value ->> 'role'
      WHERE u.code = v_step.value ->> 'unit'
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'FIXTURE_UNIT_ROLE_MISSING:%', v_step.value ->> 'key'; END IF;
      v_ids := v_ids || jsonb_build_object(v_step.value ->> 'key', v_id);
    END LOOP;

    FOR v_tr IN SELECT value FROM jsonb_array_elements(v_service.transitions) LOOP
      INSERT INTO public.request_type_workflow_transitions
        (workflow_id, from_step_id, to_step_id, action_result, is_default)
      VALUES (v_wf,
        CASE WHEN v_tr.value ->> 'from' IS NULL THEN NULL ELSE (v_ids ->> (v_tr.value ->> 'from'))::uuid END,
        CASE WHEN v_tr.value ->> 'to' IS NULL THEN NULL ELSE (v_ids ->> (v_tr.value ->> 'to'))::uuid END,
        v_tr.value ->> 'result', true);
    END LOOP;
  END LOOP;
END $$;

-- Academic context the two effects need -------------------------------------
UPDATE public.semesters SET academic_year_id = '66666666-6666-6666-6666-000000000001'
WHERE id = '66666666-6666-6666-6666-000000000002';

INSERT INTO public.programs (id, department_id, name_ar) VALUES
  ('66666666-6666-6666-6666-0000000000b1','22222222-2222-2222-2222-000000000002','بكالوريوس نظم معلومات')
ON CONFLICT DO NOTHING;

-- Dean actor (the excused-absence fixture provides it when it runs first).
INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-000000000011') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.staff_profiles (id, user_id, full_name_ar, status) VALUES
  ('33333333-3333-3333-3333-000000000011','11111111-1111-1111-1111-000000000011','عميد الكلية','active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.request_processing_assignments (unit_id, role_id, assignment_type, staff_profile_id, is_active)
SELECT u.id, r.id, 'staff_profile', '33333333-3333-3333-3333-000000000011', true
FROM public.request_processing_units u
JOIN public.request_processing_roles r ON r.unit_id = u.id AND r.code = 'dean'
WHERE u.code = 'dean'
  AND NOT EXISTS (SELECT 1 FROM public.request_processing_assignments a
                  WHERE a.unit_id = u.id AND a.role_id = r.id AND a.is_active);

-- Four students in computer science, one request each.
INSERT INTO auth.users (id)
SELECT ('11111111-1111-1111-1111-0000000000' || n)::uuid FROM unnest(ARRAY['c1','c2','c3','c4','c5','c6']) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_profiles (id, user_id, academic_number, full_name_ar, department_id, program_id, status)
SELECT ('77777777-7777-7777-7777-0000000000' || n)::uuid, ('11111111-1111-1111-1111-0000000000' || n)::uuid,
       'TESTONLY-PAID-' || upper(n), 'طالب اختبار ' || n,
       '22222222-2222-2222-2222-000000000001', '66666666-6666-6666-6666-000000000004', 'active'
FROM unnest(ARRAY['c1','c2','c3','c4','c5','c6']) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_academic_status (student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
SELECT sp.id, '66666666-6666-6666-6666-000000000001', '66666666-6666-6666-6666-000000000002',
       '66666666-6666-6666-6666-000000000003', 'active'
FROM public.student_profiles sp WHERE sp.academic_number LIKE 'TESTONLY-PAID-%';
