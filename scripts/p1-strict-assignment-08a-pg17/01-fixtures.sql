-- P1-08 rehearsal fixtures (PG17 isolated cluster).
-- Reproduces the production actor topology and the THREE existing TEST_ONLY P1
-- runtimes exactly as they are today: runtime rows with ZERO direct assignees.

-- Departments -----------------------------------------------------------
INSERT INTO public.departments (id, name_ar) VALUES
  ('22222222-2222-2222-2222-000000000001','قسم علوم الحاسوب'),
  ('22222222-2222-2222-2222-000000000002','قسم نظم المعلومات')
ON CONFLICT (id) DO NOTHING;

-- Actors ----------------------------------------------------------------
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-000000000001'), -- student affairs specialist
  ('11111111-1111-1111-1111-000000000002'), -- student affairs manager
  ('11111111-1111-1111-1111-000000000003'), -- revenue finance officer
  ('11111111-1111-1111-1111-000000000004'), -- registrar general
  ('11111111-1111-1111-1111-000000000005'), -- archive officer
  ('11111111-1111-1111-1111-000000000006'), -- department head CS
  ('11111111-1111-1111-1111-000000000007'), -- department head IS
  ('11111111-1111-1111-1111-000000000008'), -- section instructor (appealed section)
  ('11111111-1111-1111-1111-000000000009'), -- other faculty, same department
  ('11111111-1111-1111-1111-000000000010')  -- student owner
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_profiles (id, user_id, full_name_ar, status) VALUES
  ('33333333-3333-3333-3333-000000000001','11111111-1111-1111-1111-000000000001','أخصائي شؤون الطلاب','active'),
  ('33333333-3333-3333-3333-000000000002','11111111-1111-1111-1111-000000000002','مدير شؤون الطلاب','active'),
  ('33333333-3333-3333-3333-000000000003','11111111-1111-1111-1111-000000000003','موظف الإيرادات','active'),
  ('33333333-3333-3333-3333-000000000004','11111111-1111-1111-1111-000000000004','المسجل العام','active'),
  ('33333333-3333-3333-3333-000000000005','11111111-1111-1111-1111-000000000005','موظف الأرشيف','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.faculty_profiles (id, user_id, full_name_ar, status, department_id) VALUES
  ('44444444-4444-4444-4444-000000000001','11111111-1111-1111-1111-000000000008','أستاذ المقرر','active','22222222-2222-2222-2222-000000000001'),
  ('44444444-4444-4444-4444-000000000002','11111111-1111-1111-1111-000000000009','عضو هيئة تدريس آخر','active','22222222-2222-2222-2222-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.position_assignments (id, user_id, department_id, is_active, assigned_from) VALUES
  ('55555555-5555-5555-5555-000000000001','11111111-1111-1111-1111-000000000006','22222222-2222-2222-2222-000000000001',true, CURRENT_DATE - 30),
  ('55555555-5555-5555-5555-000000000002','11111111-1111-1111-1111-000000000007','22222222-2222-2222-2222-000000000002',true, CURRENT_DATE - 30)
ON CONFLICT (id) DO NOTHING;

-- Exactly ONE active direct assignment per (unit, role) — department_head is
-- department-scoped, so it carries one row per department.
INSERT INTO public.request_processing_assignments
  (unit_id, role_id, assignment_type, staff_profile_id, position_assignment_id, department_id, is_active)
SELECT u.id, r.id, v.atype, v.staff::uuid, v.pos::uuid, v.dept::uuid, true
FROM (VALUES
  ('student_affairs','student_affairs_specialist','staff_profile','33333333-3333-3333-3333-000000000001',NULL,NULL),
  ('student_affairs','student_affairs_manager','staff_profile','33333333-3333-3333-3333-000000000002',NULL,NULL),
  ('finance','revenue_finance_officer','staff_profile','33333333-3333-3333-3333-000000000003',NULL,NULL),
  ('registrar','registrar_general','staff_profile','33333333-3333-3333-3333-000000000004',NULL,NULL),
  ('archive','archive_officer','staff_profile','33333333-3333-3333-3333-000000000005',NULL,NULL),
  ('department','department_head','position_assignment',NULL,'55555555-5555-5555-5555-000000000001','22222222-2222-2222-2222-000000000001'),
  ('department','department_head','position_assignment',NULL,'55555555-5555-5555-5555-000000000002','22222222-2222-2222-2222-000000000002')
) AS v(unit_code, role_code, atype, staff, pos, dept)
JOIN public.request_processing_units u ON u.code = v.unit_code
JOIN public.request_processing_roles r ON r.unit_id = u.id AND r.code = v.role_code;
-- NOTE: department/course_instructor deliberately has NO assignment row.

-- Academic context for the appealed course ------------------------------
INSERT INTO public.academic_years (id, name) VALUES ('66666666-6666-6666-6666-000000000001','2025/2026') ON CONFLICT DO NOTHING;
INSERT INTO public.semesters (id, name) VALUES ('66666666-6666-6666-6666-000000000002','الفصل الأول') ON CONFLICT DO NOTHING;
INSERT INTO public.academic_levels (id, name, level_number) VALUES ('66666666-6666-6666-6666-000000000003','المستوى الرابع',4) ON CONFLICT DO NOTHING;
INSERT INTO public.programs (id, department_id, name_ar) VALUES
  ('66666666-6666-6666-6666-000000000004','22222222-2222-2222-2222-000000000001','بكالوريوس علوم حاسوب') ON CONFLICT DO NOTHING;
INSERT INTO public.courses (id, code, name_ar, department_id) VALUES
  ('66666666-6666-6666-6666-000000000005','CS401','هندسة البرمجيات','22222222-2222-2222-2222-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.course_offerings (id, course_id, academic_year_id, semester_id, program_id, level_id) VALUES
  ('66666666-6666-6666-6666-000000000006','66666666-6666-6666-6666-000000000005',
   '66666666-6666-6666-6666-000000000001','66666666-6666-6666-6666-000000000002',
   '66666666-6666-6666-6666-000000000004','66666666-6666-6666-6666-000000000003') ON CONFLICT DO NOTHING;
INSERT INTO public.course_sections (id, course_offering_id, section_code, faculty_profile_id) VALUES
  ('66666666-6666-6666-6666-000000000007','66666666-6666-6666-6666-000000000006','TESTONLY-P1','44444444-4444-4444-4444-000000000001') ON CONFLICT DO NOTHING;

INSERT INTO public.student_profiles (id, user_id, academic_number, full_name_ar, department_id, program_id, status) VALUES
  ('77777777-7777-7777-7777-000000000001','11111111-1111-1111-1111-000000000010','TESTONLY-P1-APPEAL','طالب اختبار P1',
   '22222222-2222-2222-2222-000000000001','66666666-6666-6666-6666-000000000004','active') ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------
-- Helper: reproduce a generic (pre-P1-08) runtime with ZERO assignees.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.h_seed_unassigned_runtime(p_request_id uuid, p_wf_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_wf uuid; v_c record; v_first integer;
BEGIN
  SELECT id INTO v_wf FROM public.request_type_workflows WHERE code = p_wf_code AND version = 1;
  SELECT min(step_order) INTO v_first FROM public.request_type_workflow_steps WHERE workflow_id = v_wf;
  FOR v_c IN SELECT * FROM public.request_type_workflow_steps WHERE workflow_id = v_wf ORDER BY step_order LOOP
    INSERT INTO public.student_request_workflow_steps(
      student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar, step_order,
      processing_unit_id, processing_role_id, status, entered_at, metadata)
    VALUES (p_request_id, v_wf, v_c.id, v_c.step_key, v_c.step_name_ar, v_c.step_order,
      v_c.processing_unit_id, v_c.processing_role_id,
      CASE WHEN v_c.step_order = v_first THEN 'active' ELSE 'pending' END,
      CASE WHEN v_c.step_order = v_first THEN now() ELSE NULL END,
      jsonb_build_object('action_type', v_c.action_type));
  END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- The THREE existing TEST_ONLY P1 requests (production request numbers).
-- ----------------------------------------------------------------------
INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data, submitted_at)
VALUES
  ('88888888-8888-8888-8888-000000000001','77777777-7777-7777-7777-000000000001','october_exam_entry_form',
   'SR-20260816-14A2339B','استمارة دخول دور أكتوبر','submitted',
   jsonb_build_object('p1_e2e_marker','TEST_ONLY_P1_E2E_07_'), now()),
  ('88888888-8888-8888-8888-000000000002','77777777-7777-7777-7777-000000000001','replacement_student_card',
   'SR-20260816-F01018CE','بطاقة طالب بدل فاقد','submitted',
   jsonb_build_object('p1_e2e_marker','TEST_ONLY_P1_E2E_07_'), now()),
  ('88888888-8888-8888-8888-000000000003','77777777-7777-7777-7777-000000000001','grade_appeal',
   'SR-20260816-E852B4E3','التظلم على النتيجة النهائية','submitted',
   jsonb_build_object('p1_e2e_marker','TEST_ONLY_P1_E2E_07_'), now());

INSERT INTO public.grade_appeal_details
  (request_id, student_profile_id, academic_year_id, semester_id, course_section_id, reason)
VALUES ('88888888-8888-8888-8888-000000000003','77777777-7777-7777-7777-000000000001',
  '66666666-6666-6666-6666-000000000001','66666666-6666-6666-6666-000000000002',
  '66666666-6666-6666-6666-000000000007','تظلم اختباري');

SELECT public.h_seed_unassigned_runtime('88888888-8888-8888-8888-000000000001','october_exam_entry_form_v1');
SELECT public.h_seed_unassigned_runtime('88888888-8888-8888-8888-000000000002','replacement_student_card_v1');
SELECT public.h_seed_unassigned_runtime('88888888-8888-8888-8888-000000000003','final_result_appeal_v1');

-- A REAL (non TEST_ONLY) P1 request must never exist in this rehearsal; the
-- P1-08 guard is asserted in 02-cases.sql.

-- ----------------------------------------------------------------------
-- B1 regression fixture: excused_absence keeps its existing behaviour.
-- ----------------------------------------------------------------------
INSERT INTO public.request_types (code, name_ar, category, is_active, student_visible, request_audience)
VALUES ('excused_absence','عذر غياب','academic', true, true, 'active_student')
ON CONFLICT (code) DO UPDATE SET is_active = true;

DO $$
DECLARE v_type uuid; v_wf uuid; v_prev uuid; v_id uuid; v_row record;
BEGIN
  SELECT id INTO v_type FROM public.request_types WHERE code='excused_absence';
  INSERT INTO public.request_type_workflows (request_type_id, code, name_ar, version, status, is_active, published_at)
  VALUES (v_type,'excused_absence_v1','مسار عذر الغياب',1,'active',true, now()) RETURNING id INTO v_wf;

  INSERT INTO public.request_type_workflow_steps
    (workflow_id, step_key, step_name_ar, step_order, processing_unit_id, processing_role_id, action_type)
  SELECT v_wf, v.k, v.n, v.o, u.id, r.id, v.a
  FROM (VALUES
    ('student_affairs_intake','استقبال شؤون الطلاب',1,'student_affairs','student_affairs_specialist','review'),
    ('manager_review','مراجعة المدير',2,'student_affairs','student_affairs_manager','approve'),
    ('record_apply','تطبيق العذر',3,'student_affairs','student_affairs_specialist','apply_decision')
  ) AS v(k,n,o,unit,role,a)
  JOIN public.request_processing_units u ON u.code=v.unit
  JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code=v.role;

  -- transitions: start edge + linear chain + terminal edge
  INSERT INTO public.request_type_workflow_transitions (workflow_id, from_step_id, to_step_id, action_result, label_ar)
  SELECT v_wf, NULL, c.id, 'submit', 'إرسال الطلب'
  FROM public.request_type_workflow_steps c WHERE c.workflow_id=v_wf AND c.step_order=1;

  FOR v_row IN
    SELECT c.id, c.step_order, c.action_type,
           (SELECT n.id FROM public.request_type_workflow_steps n
            WHERE n.workflow_id=v_wf AND n.step_order=c.step_order+1) AS next_id
    FROM public.request_type_workflow_steps c WHERE c.workflow_id=v_wf ORDER BY c.step_order
  LOOP
    INSERT INTO public.request_type_workflow_transitions (workflow_id, from_step_id, to_step_id, action_result, label_ar)
    VALUES (v_wf, v_row.id, v_row.next_id,
      CASE v_row.action_type WHEN 'review' THEN 'reviewed' WHEN 'approve' THEN 'approved'
        ELSE 'applied' END, 'انتقال');
  END LOOP;
END $$;

INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data, submitted_at)
VALUES ('88888888-8888-8888-8888-000000000009','77777777-7777-7777-7777-000000000001','excused_absence',
  'SR-TESTONLY-B1-REG','عذر غياب','submitted','{}'::jsonb, now());
