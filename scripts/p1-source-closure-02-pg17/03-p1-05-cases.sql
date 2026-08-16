-- P1-05 executable verification: official grading scale boundaries, GPA removal,
-- transcript view contract, KPI outputs, and October parity after P1-05.
\set ON_ERROR_STOP on

-- 1. Legacy pre-state was actually replaced (no GPA / 60 / 50 pass mark left).
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_admin_dashboard_kpis';
  PERFORM public.t_expect('P1-05 dashboard KPI uses 48 pass mark', v_src LIKE '%percentage >= 48%');
  PERFORM public.t_expect('P1-05 dashboard KPI dropped legacy 60', v_src NOT LIKE '%percentage >= 60%');

  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_admin_progress_kpis';
  PERFORM public.t_expect('P1-05 progress KPI exposes avgOfficialPercentage',
    v_src LIKE '%avgOfficialPercentage%');
  PERFORM public.t_expect('P1-05 progress KPI has no GPA identifier',
    v_src !~* '(avgGpa|gpa_points|cumulative_gpa|[^a-z_]gpa[^a-z_])');

  SELECT pg_get_viewdef('public.student_unofficial_transcript'::regclass, true) INTO v_src;
  PERFORM public.t_expect('P1-05 transcript view has no GPA identifier', v_src !~* '[^a-z_]gpa[^a-z_]');
END $$;

-- 2. Transcript view column contract: 28 legacy columns unchanged + 2 appended.
DO $$
DECLARE v_cols text[]; v_expect text[] := ARRAY[
  'enrollment_id','student_profile_id','academic_number','student_name_ar','student_name_en',
  'program_id','program_name','department_id','department_name','academic_year_id',
  'academic_year_name','semester_id','semester_name','semester_code','level_id','level_name',
  'level_number','course_id','course_code','course_name','credit_hours','section_code',
  'final_score','max_score','percentage','course_status','enrollment_status','notes',
  'official_result','grade_label'];
BEGIN
  SELECT array_agg(attname ORDER BY attnum) INTO v_cols
  FROM pg_attribute WHERE attrelid='public.student_unofficial_transcript'::regclass AND attnum>0 AND NOT attisdropped;
  PERFORM public.t_expect('TRANSCRIPT column contract preserved + appended', v_cols = v_expect);
END $$;

-- 3. Official grading boundaries, asserted through the VIEW.
DO $$
DECLARE
  v_dept uuid; v_prog uuid; v_year uuid; v_sem uuid; v_lvl uuid; v_stu uuid;
  v_course uuid; v_off uuid; v_sec uuid; v_enr uuid; v_gc uuid;
  v_raw numeric; v_official numeric; v_label text; v_status text;
  r record;
  v_cases numeric[] := ARRAY[47.99,48.00,49.99,50,64.99,65,79.99,80,89.99,90,100];
BEGIN
  INSERT INTO public.departments DEFAULT VALUES RETURNING id INTO v_dept;
  INSERT INTO public.programs (department_id) VALUES (v_dept) RETURNING id INTO v_prog;
  INSERT INTO public.academic_years DEFAULT VALUES RETURNING id INTO v_year;
  INSERT INTO public.semesters DEFAULT VALUES RETURNING id INTO v_sem;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('المستوى الخامس',5) RETURNING id INTO v_lvl;
  INSERT INTO public.student_profiles (academic_number, full_name_ar, department_id, program_id)
  VALUES ('S-GRADE-01','طالب مقياس التقدير', v_dept, v_prog) RETURNING id INTO v_stu;
  INSERT INTO public.courses (code, name_ar, department_id) VALUES ('GRD1','مقرر التقدير', v_dept)
  RETURNING id INTO v_course;
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_course, v_year, v_sem, v_prog, v_lvl) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'نهائي',100)
  RETURNING id INTO v_gc;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 0, 'approved', now());

  FOREACH v_raw IN ARRAY v_cases LOOP
    UPDATE public.student_grades SET score = v_raw WHERE student_enrollment_id = v_enr;
    SELECT t.official_result, t.grade_label, t.course_status
      INTO v_official, v_label, v_status
    FROM public.student_unofficial_transcript t WHERE t.enrollment_id = v_enr;

    IF v_raw < 48 THEN
      PERFORM public.t_expect(format('SCALE %s FAIL verbatim', v_raw),
        v_status='failed' AND v_official = v_raw AND v_label='ضعيف');
    ELSE
      PERFORM public.t_expect(format('SCALE %s PASS', v_raw), v_status='passed');
      IF v_raw < 50 THEN
        PERFORM public.t_expect(format('SCALE %s normalizes to 50', v_raw),
          v_official = 50 AND v_label='مقبول');
      ELSIF v_raw < 65 THEN
        PERFORM public.t_expect(format('SCALE %s مقبول', v_raw), v_official = v_raw AND v_label='مقبول');
      ELSIF v_raw < 80 THEN
        PERFORM public.t_expect(format('SCALE %s جيد', v_raw), v_official = v_raw AND v_label='جيد');
      ELSIF v_raw < 90 THEN
        PERFORM public.t_expect(format('SCALE %s جيد جدًا', v_raw), v_official = v_raw AND v_label='جيد جدًا');
      ELSE
        PERFORM public.t_expect(format('SCALE %s ممتاز', v_raw), v_official = v_raw AND v_label='ممتاز');
      END IF;
    END IF;
  END LOOP;

  -- no 4-point mapping anywhere in the row
  SELECT * INTO r FROM public.student_unofficial_transcript t WHERE t.enrollment_id = v_enr;
  PERFORM public.t_expect('SCALE no 4-point value emitted', r.official_result > 4);
END $$;

-- 4. KPI functions execute (authorized) and expose the official contract.
DO $$
DECLARE v_dash jsonb; v_prog jsonb;
BEGIN
  PERFORM public.t_raises('KPI dashboard denies unauthorized',
    'SELECT public.get_admin_dashboard_kpis()', 'Not authorized');
  PERFORM set_config('harness.roles_ok','1', true);
  v_dash := public.get_admin_dashboard_kpis();
  v_prog := public.get_admin_progress_kpis(500);
  PERFORM public.t_expect('KPI dashboard returns successRate', v_dash ? 'successRate');
  PERFORM public.t_expect('KPI dashboard dropped legacy marker', NOT (v_dash ? 'legacyPassMark'));
  PERFORM public.t_expect('KPI progress returns avgOfficialPercentage', v_prog ? 'avgOfficialPercentage');
  PERFORM public.t_expect('KPI progress has no avgGpa', NOT (v_prog ? 'avgGpa'));
  PERFORM set_config('harness.roles_ok','', true);
END $$;

-- 5. October parity re-tested AFTER P1-05 is installed.
DO $$
DECLARE
  v_dept uuid; v_prog uuid; v_plan uuid; v_year uuid; v_sem uuid; v_l3 uuid; v_l4 uuid;
  v_stu uuid; v_stu3 uuid; v_c uuid[]; v_i integer; v_off uuid; v_sec uuid; v_enr uuid;
  v_gc uuid; v_n integer; v_res jsonb; v_enr2 uuid;
BEGIN
  INSERT INTO public.departments DEFAULT VALUES RETURNING id INTO v_dept;
  INSERT INTO public.programs (department_id) VALUES (v_dept) RETURNING id INTO v_prog;
  INSERT INTO public.academic_years DEFAULT VALUES RETURNING id INTO v_year;
  INSERT INTO public.semesters DEFAULT VALUES RETURNING id INTO v_sem;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('المستوى الثالث',3) RETURNING id INTO v_l3;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('المستوى الرابع',4) RETURNING id INTO v_l4;
  INSERT INTO public.study_plans (program_id) VALUES (v_prog) RETURNING id INTO v_plan;
  INSERT INTO public.student_profiles (academic_number, full_name_ar, department_id, program_id)
  VALUES ('S-OCT-4','طالب أكتوبر', v_dept, v_prog) RETURNING id INTO v_stu;
  INSERT INTO public.student_profiles (academic_number, full_name_ar, department_id, program_id)
  VALUES ('S-OCT-3','طالب المستوى الثالث', v_dept, v_prog) RETURNING id INTO v_stu3;
  INSERT INTO public.student_academic_status (student_profile_id, academic_year_id, semester_id, level_id)
  VALUES (v_stu, v_year, v_sem, v_l4), (v_stu3, v_year, v_sem, v_l3);

  v_c := ARRAY[]::uuid[];
  FOR v_i IN 1..5 LOOP
    INSERT INTO public.courses (code, name_ar, department_id)
    VALUES ('OCT'||v_i||'-'||substr(v_stu::text,1,8), 'مقرر أكتوبر '||v_i, v_dept)
    RETURNING id INTO v_off;  -- reuse v_off as scratch
    v_c := v_c || v_off;
    INSERT INTO public.study_plan_courses (study_plan_id, course_id, level_id, sort_order)
    VALUES (v_plan, v_off, v_l4, v_i);
  END LOOP;

  -- Level 4 + 5 remaining -> DENY
  PERFORM public.t_raises('OCT/P1-05 level4 + 5 remaining DENY',
    format('SELECT public.p1_assert_october_eligibility(%L)', v_stu),
    'OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT');

  -- pass course #1 at 47.99 -> still remaining
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_c[1], v_year, v_sem, v_prog, v_l4) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'نهائي',100)
  RETURNING id INTO v_gc;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 47.99, 'approved', now());
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('OCT/P1-05 47.99 still remaining', v_n = 5);

  UPDATE public.student_grades SET score = 48.00 WHERE student_enrollment_id = v_enr;
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('OCT/P1-05 48.00 removed from remaining', v_n = 4);
  UPDATE public.student_grades SET score = 49.99 WHERE student_enrollment_id = v_enr;
  SELECT count(*) INTO v_n FROM public.p1_october_remaining_requirements(v_stu);
  PERFORM public.t_expect('OCT/P1-05 49.99 removed from remaining', v_n = 4);

  -- Level 4 + exactly 4 remaining -> PASS
  v_res := public.p1_assert_october_eligibility(v_stu);
  PERFORM public.t_expect('OCT/P1-05 level4 + 4 remaining PASS',
    (v_res->>'remaining_courses_count')::int = 4);

  -- Level 3 with <=4 remaining -> DENY
  PERFORM public.t_raises('OCT/P1-05 level3 DENY',
    format('SELECT public.p1_assert_october_eligibility(%L)', v_stu3),
    'OCTOBER_NOT_LEVEL_4');

  -- repeated attempts 47 then 52 -> passed exactly once
  UPDATE public.student_grades SET score = 47 WHERE student_enrollment_id = v_enr;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr2;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr2, v_gc, 52, 'approved', now());
  SELECT count(*) INTO v_n FROM unnest(public.p1_passed_course_ids(v_stu)) x WHERE x = v_c[1];
  PERFORM public.t_expect('OCT/P1-05 repeated attempt counted once', v_n = 1);
END $$;

-- 6. Final result appeal interaction with P1-05 (raw 47 -> approved 48 -> official 50).
DO $$
DECLARE
  v_dept uuid; v_prog uuid; v_year uuid; v_sem uuid; v_lvl uuid; v_stu uuid;
  v_course uuid; v_off uuid; v_sec uuid; v_enr uuid; v_gc uuid; v_gc2 uuid;
  v_req uuid; v_reg uuid := gen_random_uuid();
  v_unit uuid; v_role uuid; v_res jsonb; v_official numeric; v_label text; v_status text;
  v_before numeric; v_comp numeric;
BEGIN
  INSERT INTO public.departments DEFAULT VALUES RETURNING id INTO v_dept;
  INSERT INTO public.programs (department_id) VALUES (v_dept) RETURNING id INTO v_prog;
  INSERT INTO public.academic_years DEFAULT VALUES RETURNING id INTO v_year;
  INSERT INTO public.semesters DEFAULT VALUES RETURNING id INTO v_sem;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('المستوى السادس',6) RETURNING id INTO v_lvl;
  INSERT INTO auth.users (id) VALUES (v_reg);
  INSERT INTO public.student_profiles (academic_number, full_name_ar, department_id, program_id)
  VALUES ('S-APPEAL-1','طالب التظلم', v_dept, v_prog) RETURNING id INTO v_stu;
  INSERT INTO public.courses (code, name_ar, department_id) VALUES ('APL1','مقرر التظلم', v_dept)
  RETURNING id INTO v_course;
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_course, v_year, v_sem, v_prog, v_lvl) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'أعمال فصلية',40)
  RETURNING id INTO v_gc2;
  INSERT INTO public.grade_components (course_section_id, name, max_score) VALUES (v_sec,'نهائي',60)
  RETURNING id INTO v_gc;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc2, 20, 'approved', now()), (v_enr, v_gc, 27, 'approved', now());

  SELECT t.percentage, t.official_result, t.grade_label, t.course_status
    INTO v_before, v_official, v_label, v_status
  FROM public.student_unofficial_transcript t WHERE t.enrollment_id = v_enr;
  PERFORM public.t_expect('APPEAL before: raw 47 fail',
    v_before = 47 AND v_official = 47 AND v_label = 'ضعيف' AND v_status = 'failed');

  SELECT id INTO v_unit FROM public.request_processing_units WHERE code='registrar';
  SELECT id INTO v_role FROM public.request_processing_roles WHERE unit_id=v_unit AND code='registrar_general';
  INSERT INTO public.request_processing_assignments (unit_id, role_id, user_id) VALUES (v_unit, v_role, v_reg);
  INSERT INTO public.student_requests (student_profile_id, request_type, status)
  VALUES (v_stu, 'grade_appeal', 'submitted') RETURNING id INTO v_req;
  INSERT INTO public.student_request_workflow_steps
    (student_request_id, step_key, step_order, processing_unit_id, processing_role_id)
  VALUES (v_req, 'registrar_apply_result', 1, v_unit, v_role);
  INSERT INTO public.grade_appeal_details
    (request_id, student_profile_id, academic_year_id, semester_id, course_section_id,
     student_enrollment_id, reason)
  VALUES (v_req, v_stu, v_year, v_sem, v_sec, v_enr, 'تظلم على النتيجة النهائية');

  PERFORM set_config('harness.uid', v_reg::text, true);
  v_res := public.p1_apply_final_result_decision(v_req, 48);
  PERFORM set_config('harness.uid', '', true);
  PERFORM public.t_expect('APPEAL raw before/after audited',
    (v_res->>'previous_final_result')::numeric = 47 AND (v_res->>'approved_final_result')::numeric = 48);

  SELECT t.percentage, t.official_result, t.grade_label, t.course_status
    INTO v_before, v_official, v_label, v_status
  FROM public.student_unofficial_transcript t WHERE t.enrollment_id = v_enr;
  PERFORM public.t_expect('APPEAL after: 48 -> official 50 مقبول ناجح',
    v_before = 48 AND v_official = 50 AND v_label = 'مقبول' AND v_status = 'passed');

  SELECT sum(score) INTO v_comp FROM public.student_grades
   WHERE student_enrollment_id = v_enr AND grade_component_id = v_gc2;
  PERFORM public.t_expect('APPEAL no coursework component mutation', v_comp = 20);
  PERFORM public.t_expect('APPEAL audit row intact',
    EXISTS (SELECT 1 FROM public.audit_logs WHERE action='apply_final_result'
              AND (new_values->>'approved_final_result')::numeric = 48));
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL_P1_05_CASES_PASSED'; END $$;
