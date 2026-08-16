-- P1-06 atomic submit path — rehearsal matrix (isolated PG17 only).
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
    RAISE EXCEPTION 'FAIL % (expected %, no error)', p_label, p_msg;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%' || p_msg || '%' THEN RAISE NOTICE 'PASS % (%)', p_label, p_msg;
    ELSE RAISE EXCEPTION 'FAIL % expected % got %', p_label, p_msg, v_err; END IF;
  END;
END $$;

-- Rollback proof: run p_sql expecting failure, assert zero row deltas.
CREATE OR REPLACE FUNCTION public.t_no_delta(p_label text, p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r0 bigint; d0 bigint; d1 bigint; d2 bigint; s0 bigint;
        r1 bigint; e0 bigint; e1 bigint; x0 bigint; x1 bigint; y0 bigint; y1 bigint;
BEGIN
  SELECT count(*) INTO r0 FROM public.student_requests;
  SELECT count(*) INTO d0 FROM public.october_exam_entry_details;
  SELECT count(*) INTO d1 FROM public.replacement_card_details;
  SELECT count(*) INTO d2 FROM public.grade_appeal_details;
  SELECT count(*) INTO s0 FROM public.student_request_workflow_steps;
  SELECT count(*) INTO e0 FROM public.student_request_workflow_events;
  PERFORM public.t_raises(p_label, p_sql, p_msg);
  SELECT count(*) INTO r1 FROM public.student_requests;
  SELECT count(*) INTO x0 FROM public.october_exam_entry_details;
  SELECT count(*) INTO x1 FROM public.replacement_card_details;
  SELECT count(*) INTO y0 FROM public.grade_appeal_details;
  SELECT count(*) INTO y1 FROM public.student_request_workflow_steps;
  SELECT count(*) INTO e1 FROM public.student_request_workflow_events;
  PERFORM public.t_expect(p_label || ' :: request delta 0', r1 = r0);
  PERFORM public.t_expect(p_label || ' :: october detail delta 0', x0 = d0);
  PERFORM public.t_expect(p_label || ' :: replacement detail delta 0', x1 = d1);
  PERFORM public.t_expect(p_label || ' :: appeal detail delta 0', y0 = d2);
  PERFORM public.t_expect(p_label || ' :: runtime step delta 0', y1 = s0);
  PERFORM public.t_expect(p_label || ' :: workflow event delta 0', e1 = e0);
END $$;

-- ============================ FIXTURE ================================
DROP TABLE IF EXISTS public.t_fx;
CREATE TABLE public.t_fx (k text PRIMARY KEY, v uuid, t text);

DO $$
DECLARE
  v_dept uuid; v_prog uuid; v_plan uuid; v_year uuid; v_sem uuid;
  v_l3 uuid; v_l4 uuid;
  v_c uuid; v_i int;
  v_stu uuid; v_stu_user uuid := gen_random_uuid();
  v_t_stu uuid; v_t_user uuid := gen_random_uuid();
  v_l3_stu uuid; v_l3_user uuid := gen_random_uuid();
  v_o5_stu uuid; v_o5_user uuid := gen_random_uuid();
  v_off uuid; v_sec uuid; v_gc uuid; v_enr uuid; v_enr2 uuid; v_enr3 uuid; v_enr_old uuid;
  v_extra_course uuid;
BEGIN
  INSERT INTO public.departments DEFAULT VALUES RETURNING id INTO v_dept;
  INSERT INTO public.programs (department_id) VALUES (v_dept) RETURNING id INTO v_prog;
  INSERT INTO public.academic_years (name, is_current) VALUES ('2026', true) RETURNING id INTO v_year;
  INSERT INTO public.semesters (name, is_current, academic_year_id) VALUES ('الفصل الأول', true, v_year) RETURNING id INTO v_sem;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('الثالث', 3) RETURNING id INTO v_l3;
  INSERT INTO public.academic_levels (name, level_number) VALUES ('الرابع', 4) RETURNING id INTO v_l4;
  INSERT INTO public.study_plans (program_id) VALUES (v_prog) RETURNING id INTO v_plan;

  FOR v_i IN 1..4 LOOP
    INSERT INTO public.courses (code, name_ar) VALUES ('C' || v_i, 'مقرر ' || v_i) RETURNING id INTO v_c;
    INSERT INTO public.study_plan_courses (study_plan_id, course_id, level_id, sort_order)
    VALUES (v_plan, v_c, v_l4, v_i);
    IF v_i = 1 THEN INSERT INTO public.t_fx VALUES ('course1', v_c, NULL); END IF;
  END LOOP;

  -- users
  INSERT INTO auth.users (id, email) VALUES
    (v_stu_user, 'normal.student@usr.edu.ye'),
    (v_t_user,  'test-only.p1.e2e07@usr.edu.ye'),
    (v_l3_user, 'level3.student@usr.edu.ye'),
    (v_o5_user, 'five.remaining@usr.edu.ye');

  INSERT INTO public.student_profiles (user_id, academic_number, full_name_ar, department_id, program_id)
  VALUES (v_stu_user, 'S-NORMAL', 'طالب عادي', v_dept, v_prog) RETURNING id INTO v_stu;
  INSERT INTO public.student_profiles (user_id, academic_number, full_name_ar, department_id, program_id)
  VALUES (v_t_user, 'S-TESTONLY', 'طالب اختبار', v_dept, v_prog) RETURNING id INTO v_t_stu;
  INSERT INTO public.student_profiles (user_id, academic_number, full_name_ar, department_id, program_id)
  VALUES (v_l3_user, 'S-L3', 'طالب مستوى ثالث', v_dept, v_prog) RETURNING id INTO v_l3_stu;

  INSERT INTO public.student_academic_status (student_profile_id, academic_year_id, semester_id, level_id)
  VALUES (v_stu, v_year, v_sem, v_l4), (v_t_stu, v_year, v_sem, v_l4), (v_l3_stu, v_year, v_sem, v_l3);

  -- 5th-remaining student lives in its own program/plan with 5 required courses
  DECLARE v_prog5 uuid; v_plan5 uuid;
  BEGIN
    INSERT INTO public.programs (department_id) VALUES (v_dept) RETURNING id INTO v_prog5;
    INSERT INTO public.study_plans (program_id) VALUES (v_prog5) RETURNING id INTO v_plan5;
    FOR v_i IN 1..5 LOOP
      INSERT INTO public.courses (code, name_ar) VALUES ('D' || v_i, 'مقرر د' || v_i) RETURNING id INTO v_c;
      INSERT INTO public.study_plan_courses (study_plan_id, course_id, level_id, sort_order)
      VALUES (v_plan5, v_c, v_l4, v_i);
    END LOOP;
    INSERT INTO public.student_profiles (user_id, academic_number, full_name_ar, department_id, program_id)
    VALUES (v_o5_user, 'S-FIVE', 'طالب خمسة', v_dept, v_prog5) RETURNING id INTO v_o5_stu;
    INSERT INTO public.student_academic_status (student_profile_id, academic_year_id, semester_id, level_id)
    VALUES (v_o5_stu, v_year, v_sem, v_l4);
  END;

  -- graded offering/section for the appeal cases
  SELECT v FROM public.t_fx WHERE k = 'course1' INTO v_c;
  INSERT INTO public.course_offerings (course_id, academic_year_id, semester_id, program_id, level_id)
  VALUES (v_c, v_year, v_sem, v_prog, v_l4) RETURNING id INTO v_off;
  INSERT INTO public.course_sections (course_offering_id) VALUES (v_off) RETURNING id INTO v_sec;
  INSERT INTO public.grade_components (course_section_id, name, max_score)
  VALUES (v_sec, 'النهائي', 100) RETURNING id INTO v_gc;

  -- normal student: published 47 (in-window)
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr, v_gc, 47, 'approved', now() - interval '1 day');

  -- normal student: published 47 but 30 days old (expired window)
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_stu, v_sec) RETURNING id INTO v_enr_old;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr_old, v_gc, 47, 'approved', now() - interval '30 days');

  -- test-only student enrollment: published 47.99 (still failing at 48 policy)
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_t_stu, v_sec) RETURNING id INTO v_enr2;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr2, v_gc, 47.99, 'approved', now() - interval '1 hour');

  -- level3 student enrollment: published 48 (passed)
  INSERT INTO public.student_enrollments (student_profile_id, course_section_id)
  VALUES (v_l3_stu, v_sec) RETURNING id INTO v_enr3;
  INSERT INTO public.student_grades (student_enrollment_id, grade_component_id, score, status, approved_at)
  VALUES (v_enr3, v_gc, 48, 'approved', now() - interval '1 hour');

  INSERT INTO public.t_fx (k, v, t) VALUES
    ('stu', v_stu, NULL), ('stu_user', v_stu_user, NULL),
    ('t_stu', v_t_stu, NULL), ('t_user', v_t_user, NULL),
    ('l3_stu', v_l3_stu, NULL), ('l3_user', v_l3_user, NULL),
    ('o5_stu', v_o5_stu, NULL), ('o5_user', v_o5_user, NULL),
    ('enr', v_enr, NULL), ('enr_old', v_enr_old, NULL),
    ('enr_t', v_enr2, NULL), ('enr_l3', v_enr3, NULL),
    ('section', v_sec, NULL);
END $$;

-- =================== PHASE A — HIDDEN (student_visible = false) ==========
DO $$
DECLARE
  v_t_user uuid := (SELECT v FROM public.t_fx WHERE k='t_user');
  v_stu_user uuid := (SELECT v FROM public.t_fx WHERE k='stu_user');
  v_sel jsonb;
  v_req uuid; v_n int;
BEGIN
  PERFORM public.t_expect('P1 types hidden at start',
    (SELECT bool_and(student_visible = false) FROM public.request_types
     WHERE code IN ('october_exam_entry_form','replacement_student_card','grade_appeal')));

  -- authoritative selection ids for the TEST_ONLY student
  SELECT jsonb_agg(requirement_id) INTO v_sel
  FROM public.p1_october_remaining_requirements((SELECT v FROM public.t_fx WHERE k='t_stu'));

  -- 1. normal (non TEST_ONLY) student, hidden type
  PERFORM set_config('harness.uid', v_stu_user::text, false);
  PERFORM public.t_no_delta('HIDDEN normal student DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb,NULL,%L)',
           'october_exam_entry_form','استمارة', '{"remaining_courses":[]}', 'TEST_ONLY_P1_E2E_07_RUN1'),
    'غير متاح');

  -- 2. TEST_ONLY actor, no run marker
  PERFORM set_config('harness.uid', v_t_user::text, false);
  PERFORM public.t_no_delta('HIDDEN test-only without marker DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'october_exam_entry_form','استمارة', jsonb_build_object('remaining_courses', v_sel)::text),
    'غير متاح');

  -- 3. TEST_ONLY actor, marker with no registry row
  PERFORM public.t_no_delta('HIDDEN unregistered run id DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb,NULL,%L)',
           'october_exam_entry_form','استمارة', jsonb_build_object('remaining_courses', v_sel)::text,
           'TEST_ONLY_P1_E2E_07_GHOST'),
    'غير متاح');

  -- register a run bound to the TEST_ONLY user
  INSERT INTO public.p1_e2e_07_executions (run_id, service_code, student_user_id)
  VALUES ('TEST_ONLY_P1_E2E_07_OCT1', 'october_exam_entry_form', v_t_user);

  -- 4. real-like student replaying the very same valid marker
  PERFORM set_config('harness.uid', v_stu_user::text, false);
  PERFORM public.t_no_delta('HIDDEN copied marker by real student DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb,NULL,%L)',
           'october_exam_entry_form','استمارة', jsonb_build_object('remaining_courses', v_sel)::text,
           'TEST_ONLY_P1_E2E_07_OCT1'),
    'غير متاح');

  -- 5. TEST_ONLY actor with its own bound run: ALLOW
  PERFORM set_config('harness.uid', v_t_user::text, false);
  v_req := public.submit_student_request_with_details(
    'october_exam_entry_form', 'استمارة أكتوبر',
    jsonb_build_object('remaining_courses', v_sel), NULL, 'TEST_ONLY_P1_E2E_07_OCT1');
  PERFORM public.t_expect('HIDDEN test-only ALLOW -> submitted',
    (SELECT status = 'submitted' FROM public.student_requests WHERE id = v_req));
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps WHERE student_request_id = v_req;
  PERFORM public.t_expect('HIDDEN october runtime steps = 4', v_n = 4);
  PERFORM public.t_expect('HIDDEN october detail produced',
    EXISTS (SELECT 1 FROM public.october_exam_entry_details WHERE request_id = v_req));
  PERFORM public.t_expect('HIDDEN run claimed',
    (SELECT created_request_id = v_req FROM public.p1_e2e_07_executions WHERE run_id='TEST_ONLY_P1_E2E_07_OCT1'));

  -- 6. replay of a claimed run
  PERFORM public.t_no_delta('HIDDEN claimed run replay DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb,NULL,%L)',
           'october_exam_entry_form','استمارة', jsonb_build_object('remaining_courses', v_sel)::text,
           'TEST_ONLY_P1_E2E_07_OCT1'),
    'غير متاح');

  -- 7. anonymous
  PERFORM set_config('harness.uid', '', false);
  PERFORM public.t_no_delta('ANON DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'october_exam_entry_form','استمارة','{}'),
    'تسجيل الدخول');
END $$;

-- =================== PHASE B — NORMAL ACTIVATED PATH =====================
-- Isolated rehearsal only: production visibility is NEVER flipped by source.
UPDATE public.request_types SET student_visible = true
WHERE code IN ('october_exam_entry_form','replacement_student_card','grade_appeal');

DO $$
DECLARE
  v_user uuid := (SELECT v FROM public.t_fx WHERE k='stu_user');
  v_stu  uuid := (SELECT v FROM public.t_fx WHERE k='stu');
  v_l3_user uuid := (SELECT v FROM public.t_fx WHERE k='l3_user');
  v_o5_user uuid := (SELECT v FROM public.t_fx WHERE k='o5_user');
  v_enr uuid := (SELECT v FROM public.t_fx WHERE k='enr');
  v_enr_old uuid := (SELECT v FROM public.t_fx WHERE k='enr_old');
  v_enr_t uuid := (SELECT v FROM public.t_fx WHERE k='enr_t');
  v_sel jsonb; v_bad jsonb; v_req uuid; v_n int; v_reqx uuid;
BEGIN
  PERFORM set_config('harness.uid', v_user::text, false);
  SELECT jsonb_agg(requirement_id) INTO v_sel
  FROM public.p1_october_remaining_requirements(v_stu);

  -- OCTOBER: level 4 + 4 remaining
  v_req := public.submit_student_request_with_details(
    'october_exam_entry_form', 'استمارة أكتوبر', jsonb_build_object('remaining_courses', v_sel));
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps WHERE student_request_id = v_req;
  PERFORM public.t_expect('NORMAL october submit PASS + 4 steps', v_n = 4);
  PERFORM public.t_expect('NORMAL october server recompute authoritative',
    (SELECT d.academic_level_order = 4 AND d.remaining_courses_count = 4
            AND array_length(d.eligible_requirement_ids,1) = 4
     FROM public.october_exam_entry_details d WHERE d.request_id = v_req));
  PERFORM public.t_expect('NORMAL october step order preserved',
    (SELECT array_agg(step_key ORDER BY step_order) =
            ARRAY['student_affairs_review','payment_confirmation','registrar_finalize','archive']
     FROM public.student_request_workflow_steps WHERE student_request_id = v_req));
  PERFORM public.t_expect('NORMAL october first step active',
    (SELECT status = 'active' FROM public.student_request_workflow_steps
     WHERE student_request_id = v_req AND step_order = 1));

  -- OCTOBER tampering: requirement id not in the authoritative set
  v_bad := jsonb_build_array(gen_random_uuid()::text);
  PERFORM public.t_no_delta('OCTOBER tampered selection DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'october_exam_entry_form','استمارة', jsonb_build_object('remaining_courses', v_bad)::text),
    'OCTOBER_SELECTION_NOT_AUTHORITATIVE');

  PERFORM public.t_no_delta('OCTOBER empty selection DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'october_exam_entry_form','استمارة', '{"remaining_courses":[]}'),
    'OCTOBER_SELECTION_REQUIRED');

  -- OCTOBER level 3
  PERFORM set_config('harness.uid', v_l3_user::text, false);
  PERFORM public.t_no_delta('OCTOBER level 3 DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'october_exam_entry_form','استمارة',
           jsonb_build_object('remaining_courses',
             (SELECT jsonb_agg(requirement_id) FROM public.p1_october_remaining_requirements(
                (SELECT v FROM public.t_fx WHERE k='l3_stu'))))::text),
    'OCTOBER_NOT_LEVEL_4');

  -- OCTOBER level 4 with 5 remaining
  PERFORM set_config('harness.uid', v_o5_user::text, false);
  PERFORM public.t_no_delta('OCTOBER level 4 + 5 remaining DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'october_exam_entry_form','استمارة',
           jsonb_build_object('remaining_courses',
             (SELECT jsonb_agg(requirement_id) FROM public.p1_october_remaining_requirements(
                (SELECT v FROM public.t_fx WHERE k='o5_stu'))))::text),
    'OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT');

  -- REPLACEMENT CARD
  PERFORM set_config('harness.uid', v_user::text, false);
  v_req := public.submit_student_request_with_details(
    'replacement_student_card', 'بطاقة بدل فاقد',
    '{"loss_reason":"فقدت البطاقة في الحرم","loss_declaration_ack":true}'::jsonb);
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps WHERE student_request_id = v_req;
  PERFORM public.t_expect('NORMAL replacement submit PASS + 3 steps', v_n = 3);
  PERFORM public.t_expect('REPLACEMENT detail producer + no fabricated issuance',
    (SELECT loss_declaration_ack AND issued_card_serial IS NULL AND payment_confirmed_at IS NULL
            AND card_issued_at IS NULL
     FROM public.replacement_card_details WHERE request_id = v_req));

  PERFORM public.t_no_delta('REPLACEMENT duplicate open DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'replacement_student_card','بطاقة','{"loss_reason":"مرة أخرى","loss_declaration_ack":true}'),
    'REPLACEMENT_CARD_DUPLICATE_OPEN_REQUEST');

  -- FINAL RESULT APPEAL
  v_req := public.submit_student_request_with_details(
    'grade_appeal', 'تظلم',
    jsonb_build_object('final_result_id', v_enr::text, 'appeal_reason', 'مراجعة رصد الدرجة'));
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps WHERE student_request_id = v_req;
  PERFORM public.t_expect('NORMAL final appeal submit PASS + 6 steps', v_n = 6);
  PERFORM public.t_expect('APPEAL detail producer authoritative',
    (SELECT appeal_kind = 'final_result' AND student_enrollment_id = v_enr
            AND current_grade_total = 47 AND current_grade_status = 'failed'
            AND final_result_published_at IS NOT NULL
            AND appeal_window_end = final_result_published_at + interval '7 days'
     FROM public.grade_appeal_details WHERE request_id = v_req));

  PERFORM public.t_no_delta('APPEAL duplicate open DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'grade_appeal','تظلم',
           jsonb_build_object('final_result_id', v_enr::text, 'appeal_reason','مرة أخرى')::text),
    'FINAL_RESULT_APPEAL_DUPLICATE_OPEN');

  PERFORM public.t_no_delta('APPEAL other student enrollment DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'grade_appeal','تظلم',
           jsonb_build_object('final_result_id', v_enr_t::text, 'appeal_reason','ليس لي')::text),
    'FINAL_RESULT_APPEAL_NO_ENROLLMENT');

  PERFORM public.t_no_delta('APPEAL 7-day window expired DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'grade_appeal','تظلم',
           jsonb_build_object('final_result_id', v_enr_old::text, 'appeal_reason','متأخر')::text),
    'FINAL_RESULT_APPEAL_WINDOW_EXPIRED');

  PERFORM public.t_no_delta('APPEAL missing reason DENY',
    format('SELECT public.submit_student_request_with_details(%L,%L,%L::jsonb)',
           'grade_appeal','تظلم', jsonb_build_object('final_result_id', v_enr_old::text)::text),
    'FINAL_RESULT_APPEAL_REASON_REQUIRED');

  -- 48 boundary: TEST_ONLY student 47.99 = failed, level3 student 48 = passed
  PERFORM public.t_expect('THRESHOLD 47.99 outstanding',
    (SELECT NOT ((r.total / r.max_total) >= 0.48)
     FROM public.p1_enrollment_result(v_enr_t) r));
  PERFORM public.t_expect('THRESHOLD 48.00 passed',
    (SELECT (r.total / r.max_total) >= 0.48
     FROM public.p1_enrollment_result((SELECT v FROM public.t_fx WHERE k='enr_l3')) r));

  -- GENERIC CREATE BYPASS closed
  FOREACH v_bad IN ARRAY ARRAY['"october_exam_entry_form"'::jsonb,'"replacement_student_card"'::jsonb,'"grade_appeal"'::jsonb]
  LOOP
    PERFORM public.t_no_delta('GENERIC create DENY ' || (v_bad #>> '{}'),
      format('SELECT public.create_student_request(%L,%L,%L::jsonb)', v_bad #>> '{}', 'طلب', '{}'),
      'P1_ATOMIC_SUBMIT_REQUIRED');
  END LOOP;

  -- DETAIL-LESS SUBMIT closed (privileged/internal direct write path)
  INSERT INTO public.student_requests (request_number, student_profile_id, request_type, title, status)
  VALUES ('SR-TEST-DETAILLESS', v_stu, 'grade_appeal', 'تظلم بدون تفاصيل', 'draft')
  RETURNING id INTO v_reqx;
  PERFORM public.t_raises('SUBMIT RPC detail-less DENY',
    format('SELECT public.submit_student_request(%L)', v_reqx), 'P1_ATOMIC_SUBMIT_REQUIRED');
  PERFORM public.t_raises('DIRECT status update detail-less DENY',
    format('UPDATE public.student_requests SET status=''submitted'' WHERE id=%L', v_reqx),
    'P1_DETAILLESS_SUBMIT_FORBIDDEN');
  PERFORM public.t_raises('DIRECT insert submitted detail-less DENY',
    format('INSERT INTO public.student_requests (request_number, student_profile_id, request_type, title, status)
            VALUES (''SR-TEST-DETAILLESS-2'', %L, ''october_exam_entry_form'', ''ط'', ''submitted'')', v_stu),
    'P1_DETAILLESS_SUBMIT_FORBIDDEN');
  DELETE FROM public.student_requests WHERE id = v_reqx;

  -- NON-P1 REGRESSION: an unrelated visible service still creates normally
  INSERT INTO public.request_types (code, name_ar, is_active, student_visible, request_audience)
  VALUES ('enrollment_suspension', 'إيقاف قيد', true, true, 'active_student')
  ON CONFLICT (code) DO UPDATE SET student_visible = true;
  v_reqx := public.create_student_request('enrollment_suspension', 'إيقاف قيد', '{}'::jsonb);
  PERFORM public.t_expect('NON_P1 create regression PASS', v_reqx IS NOT NULL);
END $$;

-- =================== PHASE C — GRANTS / DIRECT WRITES ====================
DO $$
BEGIN
  PERFORM public.t_expect('anon cannot execute atomic submit',
    NOT has_function_privilege('anon',
      'public.submit_student_request_with_details(text,text,jsonb,text,text)', 'EXECUTE'));
  PERFORM public.t_expect('authenticated can execute atomic submit',
    has_function_privilege('authenticated',
      'public.submit_student_request_with_details(text,text,jsonb,text,text)', 'EXECUTE'));
  PERFORM public.t_expect('service_role has no atomic submit execute',
    NOT has_function_privilege('service_role',
      'public.submit_student_request_with_details(text,text,jsonb,text,text)', 'EXECUTE'));
  PERFORM public.t_expect('no client table grants on october details',
    NOT has_table_privilege('authenticated', 'public.october_exam_entry_details', 'INSERT'));
  PERFORM public.t_expect('no client table grants on replacement details',
    NOT has_table_privilege('authenticated', 'public.replacement_card_details', 'INSERT'));
  PERFORM public.t_expect('E2E registry hidden from authenticated',
    NOT has_table_privilege('authenticated', 'public.p1_e2e_07_executions', 'SELECT'));
  PERFORM public.t_expect('grade appeal detail student-write policy removed',
    NOT EXISTS (SELECT 1 FROM pg_policy p
                WHERE p.polrelid = 'public.grade_appeal_details'::regclass
                  AND p.polname IN ('gad_insert','gad_update')
                  AND pg_get_expr(COALESCE(p.polwithcheck, p.polqual), p.polrelid) LIKE '%is_owner_of_request%'));
  PERFORM public.t_expect('B1-88 five-service allowlist unchanged',
    public.b1_e2e_88_is_five_service('excused_absence')
    AND NOT public.b1_e2e_88_is_five_service('grade_appeal'));
END $$;

SELECT 'P1-06 REHEARSAL MATRIX COMPLETE' AS result;
