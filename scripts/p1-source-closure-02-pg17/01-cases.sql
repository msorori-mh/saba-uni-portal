-- P1 rehearsal cases: eligibility recomputation, 7-day boundary, revenue gate,
-- positive + negative authorization matrix, idempotent final-result application.
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.t_expect(p_label text, p_ok boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN RAISE NOTICE 'PASS %', p_label;
  ELSE RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.t_raises(p_label text, p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL % (expected %, no error raised)', p_label, p_msg;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%' || p_msg || '%' THEN
      RAISE NOTICE 'PASS % (%)', p_label, p_msg;
    ELSE
      RAISE EXCEPTION 'FAIL % expected % got %', p_label, p_msg, v_err;
    END IF;
  END;
END $$;

DO $$
DECLARE
  v_dept uuid; v_prog uuid; v_plan uuid; v_year uuid; v_sem uuid;
  v_l1 uuid; v_l4 uuid;
  v_stu uuid; v_stu_l1 uuid; v_stu_user uuid := gen_random_uuid();
  v_course uuid; v_course2 uuid; v_course3 uuid; v_course4 uuid; v_course5 uuid;
  v_off uuid; v_sec uuid; v_enr uuid; v_gc uuid;
  v_req uuid; v_appeal uuid;
  v_sa_user uuid := gen_random_uuid();
  v_fin_user uuid := gen_random_uuid();
  v_reg_user uuid := gen_random_uuid();
  v_admin_user uuid := gen_random_uuid();
  v_unit_sa uuid; v_unit_fin uuid; v_unit_reg uuid;
  v_role_sa uuid; v_role_fin uuid; v_role_reg uuid;
  v_res jsonb; v_ids uuid[]; v_n integer;
BEGIN
  INSERT INTO public.departments DEFAULT VALUES RETURNING id INTO v_dept;
  INSERT INTO public.programs (department_id) VALUES (v_dept) RETURNING id INTO v_prog;
  INSERT INTO public.academic_years DEFAULT VALUES RETURNING id INTO v_year;
  INSERT INTO public.semesters DEFAULT VALUES RETURNING id INTO v_sem;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('المستوى الأول',1) RETURNING id INTO v_l1;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('المستوى الرابع',4) RETURNING id INTO v_l4;
  INSERT INTO public.study_plans (program_id) VALUES (v_prog) RETURNING id INTO v_plan;

  INSERT INTO auth.users (id) VALUES (v_stu_user), (v_sa_user), (v_fin_user), (v_reg_user), (v_admin_user);

  INSERT INTO public.student_profiles (user_id, academic_number, full_name_ar, department_id, program_id)
  VALUES (v_stu_user, 'S-4001', 'طالب المستوى الرابع', v_dept, v_prog) RETURNING id INTO v_stu;
  INSERT INTO public.student_profiles (academic_number, full_name_ar, department_id, program_id)
  VALUES ('S-1001', 'طالبة المستوى الأول', v_dept, v_prog) RETURNING id INTO v_stu_l1;

  INSERT INTO public.student_academic_status (student_profile_id, academic_year_id, semester_id, level_id)
  VALUES (v_stu, v_year, v_sem, v_l4), (v_stu_l1, v_year, v_sem, v_l1);

  INSERT INTO public.courses (code, name_ar) VALUES ('C1','مقرر1') RETURNING id INTO v_course;
  INSERT INTO public.courses (code, name_ar) VALUES ('C2','مقرر2') RETURNING id INTO v_course2;
  INSERT INTO public.courses (code, name_ar) VALUES ('C3','مقرر3') RETURNING id INTO v_course3;
  INSERT INTO public.courses (code, name_ar) VALUES ('C4','مقرر4') RETURNING id INTO v_course4;
  INSERT INTO public.courses (code, name_ar) VALUES ('C5','مقرر5') RETURNING id INTO v_course5;

  INSERT INTO public.study_plan_courses (study_plan_id, course_id, level_id, sort_order) VALUES
    (v_plan, v_course, v_l4, 1), (v_plan, v_course2, v_l4, 2), (v_plan, v_course3, v_l4, 3),
    (v_plan, v_course4, v_l4, 4), (v_plan, v_course5, v_l4, 5);

  -- ===== October: 5 remaining required courses → over the limit =====
  PERFORM public.t_raises('OCT over limit (5 remaining)',
    format('SELECT public.p1_assert_october_eligibility(%L)', v_stu),
    'OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT');

  -- Pass C1 with an approved published result (80%) → 4 remaining
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_course, v_year, v_sem, v_prog, v_l4) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'نهائي',100)
  RETURNING id INTO v_gc;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 80, 'approved', now() - interval '2 days');

  v_res := public.p1_assert_october_eligibility(v_stu);
  PERFORM public.t_expect('OCT eligible at 4 remaining',
    (v_res->>'remaining_courses_count')::int = 4 AND (v_res->>'academic_level_order')::int = 4);

  -- Level 1 student can never enter October
  PERFORM public.t_raises('OCT level guard',
    format('SELECT public.p1_assert_october_eligibility(%L)', v_stu_l1),
    'OCTOBER_NOT_LEVEL_4');

  -- Selection must be a subset of the authoritative remaining set
  SELECT array_agg(requirement_id) INTO v_ids
  FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('OCT authoritative subset accepted',
    (public.p1_assert_october_eligibility(v_stu, v_ids[1:2])->>'remaining_courses_count')::int = 4);
  PERFORM public.t_raises('OCT forged selection denied',
    format('SELECT public.p1_assert_october_eligibility(%L, ARRAY[%L]::uuid[])', v_stu, gen_random_uuid()),
    'OCTOBER_SELECTION_NOT_AUTHORITATIVE');
  PERFORM public.t_raises('OCT empty selection denied',
    format('SELECT public.p1_assert_october_eligibility(%L, ARRAY[]::uuid[])', v_stu),
    'OCTOBER_SELECTION_NOT_AUTHORITATIVE');

  -- ===== 48% pass-mark boundary (approved policy COURSE_PASS_MARK = 48/100) =====
  -- C2 at 47.99% must stay OUTSTANDING (still 4 remaining).
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_course2, v_year, v_sem, v_prog, v_l4) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'نهائي',100)
  RETURNING id INTO v_gc;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 47.99, 'approved', now() - interval '1 day');
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('PASS-MARK 47.99 stays outstanding', v_n = 4);

  -- Exactly 48.00% is PASSED → removed from remaining.
  UPDATE public.student_grades SET score = 48.00
  WHERE student_enrollment_id = v_enr AND grade_component_id = v_gc;
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('PASS-MARK 48.00 is passed', v_n = 3);

  -- Normalized percentage when components do not total 100 (96/200 = 48.00%).
  UPDATE public.grade_components SET max_score = 200 WHERE id = v_gc;
  UPDATE public.student_grades SET score = 95.9
  WHERE student_enrollment_id = v_enr AND grade_component_id = v_gc;
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('PASS-MARK normalized 47.95%% outstanding', v_n = 4);
  UPDATE public.student_grades SET score = 96
  WHERE student_enrollment_id = v_enr AND grade_component_id = v_gc;
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('PASS-MARK normalized 48.00%% passed', v_n = 3);

  -- Repeated attempts: 47%% then 52%% → counted PASSED exactly once.
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_course3, v_year, v_sem, v_prog, v_l4) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'نهائي',100)
  RETURNING id INTO v_gc;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 47, 'approved', now() - interval '3 days');
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('PASS-MARK failed attempt keeps course outstanding', v_n = 3);
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 52, 'approved', now() - interval '1 day');
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('PASS-MARK repeated attempt passed once', v_n = 2);
  SELECT count(*) INTO v_n FROM unnest(public.p1_passed_course_ids(v_stu)) x WHERE x = v_course3;
  PERFORM public.t_expect('PASS-MARK no double counting', v_n = 1);

  -- Level 4 with exactly 4 genuinely remaining requirements → ELIGIBLE.
  v_res := public.p1_assert_october_eligibility(v_stu);
  PERFORM public.t_expect('OCT eligible with 2 remaining after 48%% policy',
    (v_res->>'remaining_courses_count')::int = 2);

  -- ===== Department transfer level guard =====
  PERFORM public.t_expect('TRANSFER level 4 allowed',
    public.p1_assert_department_transfer_level(v_stu));
  PERFORM public.t_raises('TRANSFER level 1 denied',
    format('SELECT public.p1_assert_department_transfer_level(%L)', v_stu_l1),
    'DEPARTMENT_TRANSFER_LEVEL_1_NOT_ELIGIBLE');

  -- ===== Replacement card =====
  PERFORM public.t_expect('CARD active student allowed',
    public.p1_assert_replacement_card_eligibility(v_stu));
  INSERT INTO public.student_requests (student_profile_id, request_type, status)
  VALUES (v_stu, 'replacement_student_card', 'submitted');
  PERFORM public.t_raises('CARD duplicate open denied',
    format('SELECT public.p1_assert_replacement_card_eligibility(%L)', v_stu),
    'REPLACEMENT_CARD_DUPLICATE_OPEN_REQUEST');
  UPDATE public.student_profiles SET status='suspended' WHERE id=v_stu_l1;
  PERFORM public.t_raises('CARD inactive student denied',
    format('SELECT public.p1_assert_replacement_card_eligibility(%L)', v_stu_l1),
    'REPLACEMENT_CARD_STUDENT_NOT_ACTIVE');

  -- ===== Final result appeal 7-day window =====
  v_res := public.p1_assert_final_result_appeal_eligibility(v_stu, v_enr);
  PERFORM public.t_expect('APPEAL inside window', v_res ? 'appeal_window_end');
  PERFORM public.t_expect('APPEAL boundary day 7 inclusive',
    public.p1_assert_final_result_appeal_eligibility(
      v_stu, v_enr, (SELECT approved_at + interval '7 days' FROM public.student_grades
                     WHERE student_enrollment_id = v_enr LIMIT 1)) ? 'appeal_window_end');
  PERFORM public.t_raises('APPEAL expired past day 7',
    format('SELECT public.p1_assert_final_result_appeal_eligibility(%L,%L, now() + interval ''6 days'')',
           v_stu, v_enr),
    'FINAL_RESULT_APPEAL_WINDOW_EXPIRED');
  PERFORM public.t_raises('APPEAL foreign enrollment denied',
    format('SELECT public.p1_assert_final_result_appeal_eligibility(%L,%L)', v_stu_l1, v_enr),
    'FINAL_RESULT_APPEAL_NO_ENROLLMENT');

  -- ===== Authorization matrix (positive + negative) =====
  SELECT id INTO v_unit_sa  FROM public.request_processing_units WHERE code='student_affairs';
  SELECT id INTO v_unit_fin FROM public.request_processing_units WHERE code='finance';
  SELECT id INTO v_unit_reg FROM public.request_processing_units WHERE code='registrar';
  SELECT id INTO v_role_sa  FROM public.request_processing_roles WHERE unit_id=v_unit_sa AND code='student_affairs_specialist';
  SELECT id INTO v_role_fin FROM public.request_processing_roles WHERE unit_id=v_unit_fin AND code='revenue_finance_officer';
  SELECT id INTO v_role_reg FROM public.request_processing_roles WHERE unit_id=v_unit_reg AND code='registrar_general';

  INSERT INTO public.request_processing_assignments (unit_id, role_id, user_id) VALUES
    (v_unit_sa,  v_role_sa,  v_sa_user),
    (v_unit_fin, v_role_fin, v_fin_user),
    (v_unit_reg, v_role_reg, v_reg_user);

  INSERT INTO public.student_requests (student_profile_id, request_type, status)
  VALUES (v_stu, 'october_exam_entry_form', 'submitted') RETURNING id INTO v_req;

  INSERT INTO public.student_request_workflow_steps
    (student_request_id, step_key, step_order, processing_unit_id, processing_role_id) VALUES
    (v_req, 'student_affairs_review', 1, v_unit_sa,  v_role_sa),
    (v_req, 'payment_confirmation',   2, v_unit_fin, v_role_fin),
    (v_req, 'registrar_finalize',     3, v_unit_reg, v_role_reg);

  PERFORM public.t_expect('AUTHZ+ assigned specialist on current step',
    public.p1_assert_step_actor(v_req, 'student_affairs_review', v_sa_user));
  PERFORM public.t_raises('AUTHZ- finance officer on student-affairs step',
    format('SELECT public.p1_assert_step_actor(%L, %L, %L)', v_req, 'student_affairs_review', v_fin_user),
    'EXACT_PROCESSING_BINDING_REQUIRED');
  PERFORM public.t_raises('AUTHZ- admin has no global bypass',
    format('SELECT public.p1_assert_step_actor(%L, %L, %L)', v_req, 'student_affairs_review', v_admin_user),
    'EXACT_PROCESSING_BINDING_REQUIRED');
  PERFORM public.t_raises('AUTHZ- anonymous actor',
    format('SELECT public.p1_assert_step_actor(%L, %L, NULL)', v_req, 'student_affairs_review'),
    'DIRECT_ASSIGNMENT_REQUIRED');
  PERFORM public.t_raises('AUTHZ- out-of-order later step',
    format('SELECT public.p1_assert_step_actor(%L, %L, %L)', v_req, 'registrar_finalize', v_reg_user),
    'STEP_NOT_CURRENT');
  PERFORM public.t_raises('AUTHZ- unknown step',
    format('SELECT public.p1_assert_step_actor(%L, %L, %L)', v_req, 'ghost_step', v_reg_user),
    'UNKNOWN_STEP');

  -- direct assignment beats the role pool
  UPDATE public.student_request_workflow_steps
     SET assigned_user_id = v_sa_user
   WHERE student_request_id = v_req AND step_key = 'student_affairs_review';
  PERFORM public.t_expect('AUTHZ+ direct assignee wins',
    public.p1_assert_step_actor(v_req, 'student_affairs_review', v_sa_user));
  PERFORM public.t_raises('AUTHZ- same-role peer blocked by direct assignment',
    format('SELECT public.p1_assert_step_actor(%L, %L, %L)', v_req, 'student_affairs_review', v_reg_user),
    'DIRECT_ASSIGNMENT_REQUIRED');

  -- ===== Revenue gate =====
  PERFORM public.t_raises('REVENUE gate blocks before confirmation',
    format('SELECT public.p1_assert_payment_confirmed(%L)', v_req),
    'PAYMENT_CONFIRMATION_REQUIRED');
  UPDATE public.student_request_workflow_steps
     SET status='completed', decision='confirmed', completed_at=now()
   WHERE student_request_id=v_req AND step_key IN ('student_affairs_review','payment_confirmation');
  PERFORM public.t_expect('REVENUE gate opens after confirmation',
    public.p1_assert_payment_confirmed(v_req));

  -- free service (no payment step) is never blocked and creates no financial row
  INSERT INTO public.student_requests (student_profile_id, request_type, status)
  VALUES (v_stu, 'grade_appeal', 'submitted') RETURNING id INTO v_appeal;
  PERFORM public.t_expect('REVENUE gate skipped for free service',
    public.p1_assert_payment_confirmed(v_appeal));

  -- ===== Final result application (explicit, audited, idempotent) =====
  INSERT INTO public.student_request_workflow_steps
    (student_request_id, step_key, step_order, processing_unit_id, processing_role_id) VALUES
    (v_appeal, 'registrar_apply_result', 1, v_unit_reg, v_role_reg);
  INSERT INTO public.grade_appeal_details
    (request_id, student_profile_id, academic_year_id, semester_id, course_section_id,
     student_enrollment_id, reason)
  VALUES (v_appeal, v_stu, v_year, v_sem, v_sec, v_enr, 'مراجعة النتيجة النهائية');

  PERFORM set_config('harness.uid', v_reg_user::text, true);
  v_res := public.p1_apply_final_result_decision(v_appeal, 88);
  PERFORM public.t_expect('RESULT applied with before/after',
    (v_res->>'applied')::boolean AND (v_res->>'previous_final_result')::numeric = 80
    AND (v_res->>'approved_final_result')::numeric = 88);
  PERFORM public.t_expect('RESULT audited',
    EXISTS (SELECT 1 FROM public.audit_logs WHERE action='apply_final_result'));
  PERFORM public.t_expect('RESULT idempotent',
    (public.p1_apply_final_result_decision(v_appeal, 95)->>'applied')::boolean IS FALSE);

  SELECT count(*) INTO v_n FROM public.student_grades
   WHERE student_enrollment_id = v_enr AND score <> 80;
  PERFORM public.t_expect('RESULT no proportional coursework rewrite', v_n = 0);

  PERFORM set_config('harness.uid', v_sa_user::text, true);
  PERFORM public.t_raises('RESULT- non-registrar cannot apply',
    format('SELECT public.p1_apply_final_result_decision(%L, 70)', v_appeal),
    'EXACT_PROCESSING_BINDING_REQUIRED');
  PERFORM set_config('harness.uid', '', true);

  RAISE NOTICE 'ALL_P1_REHEARSAL_CASES_PASSED';
END $$;

-- structural assertions on the seeded workflows
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.request_type_workflow_steps s
  JOIN public.request_type_workflows w ON w.id = s.workflow_id
  WHERE w.code IN ('october_exam_entry_form_v1','replacement_student_card_v1','final_result_appeal_v1');
  PERFORM public.t_expect('WORKFLOW seeds produced 13 bound steps', v_n = 13);

  SELECT count(*) INTO v_n
  FROM public.request_type_workflow_steps s
  JOIN public.request_type_workflows w ON w.id = s.workflow_id
  WHERE w.code LIKE '%_v1'
    AND (s.processing_unit_id IS NULL OR s.processing_role_id IS NULL);
  PERFORM public.t_expect('WORKFLOW every step has unit+role binding', v_n = 0);

  SELECT count(*) INTO v_n FROM public.request_types
  WHERE code IN ('october_exam_entry_form','replacement_student_card','grade_appeal')
    AND student_visible;
  PERFORM public.t_expect('WORKFLOW seeds never flip student_visible', v_n = 0);

  PERFORM public.t_expect('TRIGGER legacy proportional redistribution removed',
    NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_apply_grade_appeal_on_approval'));
END $$;
