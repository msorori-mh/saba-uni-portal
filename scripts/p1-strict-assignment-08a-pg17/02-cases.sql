-- P1-08 rehearsal — repair coverage, positive/negative authorization matrix,
-- contextual-instructor closure and B1 non-regression.

CREATE OR REPLACE FUNCTION public.h_assert(p_cond boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE_FAIL: %', p_label; END IF;
  RAISE NOTICE 'ok: %', p_label;
END $$;

CREATE OR REPLACE FUNCTION public.h_as(p_uid text) RETURNS void
LANGUAGE sql AS $$ SELECT set_config('harness.uid', p_uid, false)::text; SELECT NULL::void $$;

CREATE OR REPLACE FUNCTION public.h_step(p_request uuid, p_key text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM public.student_request_workflow_steps
  WHERE student_request_id = p_request AND step_key = p_key $$;

CREATE OR REPLACE FUNCTION public.h_complete(p_request uuid, p_key text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_order integer;
BEGIN
  UPDATE public.student_request_workflow_steps
  SET status='completed', completed_at=now(), decision='approved'
  WHERE student_request_id=p_request AND step_key=p_key RETURNING step_order INTO v_order;
  UPDATE public.student_request_workflow_steps
  SET status='active', entered_at=now()
  WHERE student_request_id=p_request AND step_order=v_order+1;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Contract pinning
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.h_assert(
    (SELECT count(*) FROM public.b1_workflow_runtime_contract_snapshot
     WHERE request_type_code IN ('october_exam_entry_form','replacement_student_card','grade_appeal')) = 13,
    'P1 runtime contract pinned for all 13 configured steps');
  PERFORM public.h_assert(
    (SELECT bool_and(NOT legacy_fallback_enabled) FROM public.service_platform_runtime_flags
     WHERE service_code IN ('october_exam_entry_form','replacement_student_card','grade_appeal')),
    'P1 legacy shape fallback disabled');
  PERFORM public.h_assert(public.b1_legacy_fallback_enabled('excused_absence'),
    'B1 legacy fallback untouched');
END $$;

-- ---------------------------------------------------------------------------
-- 2. Repair coverage — zero unassigned runtime rows remain
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad FROM public.student_request_workflow_steps s
  JOIN public.student_requests r ON r.id = s.student_request_id
  WHERE r.request_number IN ('SR-20260816-14A2339B','SR-20260816-F01018CE','SR-20260816-E852B4E3')
    AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
        s.assigned_faculty_profile_id,s.assigned_position_assignment_id) <> 1;
  PERFORM public.h_assert(v_bad = 0, 'every repaired runtime row carries exactly one assignee');

  PERFORM public.h_assert((
    SELECT s.assigned_faculty_profile_id = '44444444-4444-4444-4444-000000000001'
       AND s.metadata->>'assignment_source' = 'course_section_faculty'
       AND s.assigned_position_assignment_id IS NULL
       AND s.assigned_user_id IS NULL AND s.assigned_staff_profile_id IS NULL
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id='88888888-8888-8888-8888-000000000003' AND s.step_key='instructor_review'),
    'instructor_review bound to the authoritative section instructor only');

  PERFORM public.h_assert((
    SELECT bool_and(s.assigned_position_assignment_id = '55555555-5555-5555-5555-000000000001')
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id='88888888-8888-8888-8888-000000000003'
      AND s.step_key IN ('department_head_review','academic_decision')),
    'appeal department-head steps scoped to the appealed course department');
END $$;

-- ---------------------------------------------------------------------------
-- 3. Authorization matrix — first active step of each service
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_step uuid;
  v_uid text;
  v_allowed text;
  v_uids text[] := ARRAY[
    '11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000002',
    '11111111-1111-1111-1111-000000000003','11111111-1111-1111-1111-000000000004',
    '11111111-1111-1111-1111-000000000005','11111111-1111-1111-1111-000000000006',
    '11111111-1111-1111-1111-000000000007','11111111-1111-1111-1111-000000000008',
    '11111111-1111-1111-1111-000000000009','11111111-1111-1111-1111-000000000010'];
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('88888888-8888-8888-8888-000000000001','student_affairs_review','review','11111111-1111-1111-1111-000000000001'),
      ('88888888-8888-8888-8888-000000000002','student_affairs_review','review','11111111-1111-1111-1111-000000000001'),
      ('88888888-8888-8888-8888-000000000003','registrar_intake','review','11111111-1111-1111-1111-000000000004')
    ) AS t(request, step_key, action, allowed_uid)
  LOOP
    v_step := public.h_step(v_case.request::uuid, v_case.step_key);
    v_allowed := v_case.allowed_uid;
    FOREACH v_uid IN ARRAY v_uids LOOP
      PERFORM public.h_as(v_uid);
      PERFORM public.h_assert(
        public.can_current_user_act_on_step(v_step, v_case.action) = (v_uid = v_allowed),
        format('%s/%s action=%s actor=%s expected=%s',
          v_case.request, v_case.step_key, v_case.action, right(v_uid,4), (v_uid = v_allowed)));
    END LOOP;
    -- wrong action for the same (allowed) actor is denied
    PERFORM public.h_as(v_allowed);
    PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'archive'),
      format('%s/%s wrong action denied', v_case.request, v_case.step_key));
  END LOOP;
  PERFORM set_config('harness.uid','',false);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Grade appeal continuation: department_head_review
-- ---------------------------------------------------------------------------
SELECT public.h_complete('88888888-8888-8888-8888-000000000003','registrar_intake');

DO $$
DECLARE v_step uuid := public.h_step('88888888-8888-8888-8888-000000000003','department_head_review');
BEGIN
  PERFORM public.h_as('11111111-1111-1111-1111-000000000006');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_step,'review'),
    'CS department head (appealed course department) may review');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000007');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'other-department head denied on appeal department scope');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000008');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'section instructor denied on department-head step');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000004');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'registrar denied on department-head step (no global bypass)');
  PERFORM set_config('harness.uid','',false);
END $$;

-- ---------------------------------------------------------------------------
-- 5. Grade appeal continuation: instructor_review (contextual exception)
-- ---------------------------------------------------------------------------
SELECT public.h_complete('88888888-8888-8888-8888-000000000003','department_head_review');

DO $$
DECLARE v_step uuid := public.h_step('88888888-8888-8888-8888-000000000003','instructor_review');
BEGIN
  PERFORM public.h_as('11111111-1111-1111-1111-000000000008');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_step,'review'),
    'authoritative section instructor may review');
  FOR v_step IN SELECT public.h_step('88888888-8888-8888-8888-000000000003','instructor_review') LOOP END LOOP;

  PERFORM public.h_as('11111111-1111-1111-1111-000000000009');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'other faculty of the same department denied');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000006');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'department head denied on instructor step');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000001');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'student affairs denied on instructor step');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000010');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'request owner denied');
  PERFORM set_config('harness.uid','',false);
END $$;

-- tamper: metadata provenance removed -> instructor denied
DO $$
DECLARE v_step uuid := public.h_step('88888888-8888-8888-8888-000000000003','instructor_review');
BEGIN
  UPDATE public.student_request_workflow_steps
  SET metadata = metadata - 'assignment_source' WHERE id = v_step;
  PERFORM public.h_as('11111111-1111-1111-1111-000000000008');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'instructor denied when contextual provenance is missing');
  UPDATE public.student_request_workflow_steps
  SET metadata = metadata || jsonb_build_object('assignment_source','course_section_faculty') WHERE id = v_step;

  -- tamper: section instructor changed -> the stale assignee loses authority
  UPDATE public.course_sections SET faculty_profile_id='44444444-4444-4444-4444-000000000002'
  WHERE id='66666666-6666-6666-6666-000000000007';
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'stale instructor denied after the section instructor changed');
  UPDATE public.course_sections SET faculty_profile_id='44444444-4444-4444-4444-000000000001'
  WHERE id='66666666-6666-6666-6666-000000000007';
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_step,'review'),
    'restored section instructor may review again');
  PERFORM set_config('harness.uid','',false);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Grade appeal continuation: academic_decision
-- ---------------------------------------------------------------------------
SELECT public.h_complete('88888888-8888-8888-8888-000000000003','instructor_review');

DO $$
DECLARE v_step uuid := public.h_step('88888888-8888-8888-8888-000000000003','academic_decision');
BEGIN
  PERFORM public.h_as('11111111-1111-1111-1111-000000000006');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_step,'approve'),
    'CS department head may take the academic decision');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000007');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'approve'),
    'other-department head denied on academic decision');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000008');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'approve'),
    'section instructor denied on academic decision');
  PERFORM set_config('harness.uid','',false);
END $$;

-- ---------------------------------------------------------------------------
-- 7. October exam / replacement card continuation (payment + finalize)
-- ---------------------------------------------------------------------------
SELECT public.h_complete('88888888-8888-8888-8888-000000000001','student_affairs_review');
SELECT public.h_complete('88888888-8888-8888-8888-000000000002','student_affairs_review');

DO $$
DECLARE v_a uuid := public.h_step('88888888-8888-8888-8888-000000000001','payment_confirmation');
        v_b uuid := public.h_step('88888888-8888-8888-8888-000000000002','payment_confirmation');
BEGIN
  PERFORM public.h_as('11111111-1111-1111-1111-000000000003');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_a,'confirm_payment')
    AND public.can_current_user_act_on_step(v_b,'confirm_payment'),
    'revenue officer may confirm the external payment on both services');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000004');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_a,'confirm_payment'),
    'registrar denied on payment confirmation');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000002');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_b,'confirm_payment'),
    'student affairs manager denied on payment confirmation');
  PERFORM set_config('harness.uid','',false);
END $$;

SELECT public.h_complete('88888888-8888-8888-8888-000000000001','payment_confirmation');
SELECT public.h_complete('88888888-8888-8888-8888-000000000002','payment_confirmation');

DO $$
DECLARE v_a uuid := public.h_step('88888888-8888-8888-8888-000000000001','registrar_finalize');
        v_b uuid := public.h_step('88888888-8888-8888-8888-000000000002','card_issuance');
BEGIN
  PERFORM public.h_as('11111111-1111-1111-1111-000000000004');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_a,'apply_decision'),
    'registrar may finalize the October exam entry');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_b,'apply_decision'),
    'registrar denied on card issuance');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000002');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_b,'apply_decision'),
    'student affairs manager may issue the replacement card');
  PERFORM set_config('harness.uid','',false);
END $$;

-- ---------------------------------------------------------------------------
-- 8. Future P1 submissions initialize strictly (no repair involved)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_res jsonb;
BEGIN
  INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data)
  VALUES (v_id,'77777777-7777-7777-7777-000000000001','october_exam_entry_form','SR-TESTONLY-NEW-OCT',
    'استمارة دخول دور أكتوبر','submitted', jsonb_build_object('p1_e2e_marker','TEST_ONLY_P1_E2E_07_'));
  v_res := public.initialize_b1_request_workflow_strict(v_id,'october_exam_entry_form');
  PERFORM public.h_assert((v_res->>'initialized')::boolean, 'strict initializer accepts october_exam_entry_form');
  PERFORM public.h_assert((SELECT count(*) FROM public.student_request_workflow_steps s
    WHERE s.student_request_id=v_id AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
      s.assigned_faculty_profile_id,s.assigned_position_assignment_id)=1) = 4,
    'ZERO_UNASSIGNED_FUTURE_RUNTIME for october_exam_entry_form');

  v_id := gen_random_uuid();
  INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data)
  VALUES (v_id,'77777777-7777-7777-7777-000000000001','grade_appeal','SR-TESTONLY-NEW-APPEAL',
    'التظلم على النتيجة النهائية','submitted', jsonb_build_object('p1_e2e_marker','TEST_ONLY_P1_E2E_07_'));
  INSERT INTO public.grade_appeal_details (request_id, student_profile_id, academic_year_id, semester_id, course_section_id, reason)
  VALUES (v_id,'77777777-7777-7777-7777-000000000001','66666666-6666-6666-6666-000000000001',
    '66666666-6666-6666-6666-000000000002','66666666-6666-6666-6666-000000000007','تظلم اختباري');
  v_res := public.initialize_b1_request_workflow_strict(v_id,'grade_appeal');
  PERFORM public.h_assert((SELECT count(*) FROM public.student_request_workflow_steps s
    WHERE s.student_request_id=v_id AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
      s.assigned_faculty_profile_id,s.assigned_position_assignment_id)=1) = 6,
    'ZERO_UNASSIGNED_FUTURE_RUNTIME for grade_appeal');
  PERFORM public.h_assert((SELECT s.assigned_faculty_profile_id='44444444-4444-4444-4444-000000000001'
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id=v_id AND s.step_key='instructor_review'),
    'new grade_appeal instructor step bound contextually');
END $$;

-- fail closed: an appeal whose section has no valid instructor cannot initialize
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_sec uuid := gen_random_uuid(); v_err text;
BEGIN
  INSERT INTO public.course_sections (id, course_offering_id, section_code, faculty_profile_id)
  VALUES (v_sec,'66666666-6666-6666-6666-000000000006','TESTONLY-NOINSTR',NULL);
  INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data)
  VALUES (v_id,'77777777-7777-7777-7777-000000000001','grade_appeal','SR-TESTONLY-NOINSTR',
    'التظلم على النتيجة النهائية','submitted','{}'::jsonb);
  INSERT INTO public.grade_appeal_details (request_id, student_profile_id, academic_year_id, semester_id, course_section_id, reason)
  VALUES (v_id,'77777777-7777-7777-7777-000000000001','66666666-6666-6666-6666-000000000001',
    '66666666-6666-6666-6666-000000000002',v_sec,'تظلم اختباري');
  BEGIN
    PERFORM public.initialize_b1_request_workflow_strict(v_id,'grade_appeal');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  PERFORM public.h_assert(v_err LIKE 'P1_SECTION_INSTRUCTOR_CONTEXT_MISSING%',
    'appeal without a valid section instructor fails closed: ' || v_err);
END $$;

-- ---------------------------------------------------------------------------
-- 9. TEST_ONLY gate on the repair function
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_err text;
BEGIN
  INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data)
  VALUES (v_id,'77777777-7777-7777-7777-000000000001','replacement_student_card','SR-REAL-NOT-TESTONLY',
    'بطاقة طالب بدل فاقد','submitted','{}'::jsonb);
  PERFORM public.h_seed_unassigned_runtime(v_id,'replacement_student_card_v1');
  BEGIN
    PERFORM public.p1_repair_testonly_runtime_assignments('SR-REAL-NOT-TESTONLY');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  PERFORM public.h_assert(v_err LIKE 'P1_REPAIR_NON_TESTONLY_REQUEST_DENIED%',
    'repair refuses a non TEST_ONLY request: ' || v_err);
  DELETE FROM public.student_request_workflow_steps WHERE student_request_id=v_id;
  DELETE FROM public.student_requests WHERE id=v_id;
END $$;

-- ---------------------------------------------------------------------------
-- 10. B1 NON-REGRESSION — excused_absence still initializes and authorizes
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_res jsonb; v_step uuid;
BEGIN
  v_res := public.initialize_b1_request_workflow_strict('88888888-8888-8888-8888-000000000009','excused_absence');
  PERFORM public.h_assert((v_res->>'initialized')::boolean, 'B1 excused_absence still initializes strictly');
  PERFORM public.h_assert((SELECT count(*) FROM public.student_request_workflow_steps s
    WHERE s.student_request_id='88888888-8888-8888-8888-000000000009'
      AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
        s.assigned_faculty_profile_id,s.assigned_position_assignment_id)=1) = 3,
    'B1 runtime keeps exactly one assignee per step');

  v_step := public.h_step('88888888-8888-8888-8888-000000000009','student_affairs_intake');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000001');
  PERFORM public.h_assert(public.can_current_user_act_on_step(v_step,'review'),
    'B1: assigned specialist may still review');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000002');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'B1: non-assigned manager still denied');
  PERFORM public.h_as('11111111-1111-1111-1111-000000000006');
  PERFORM public.h_assert(NOT public.can_current_user_act_on_step(v_step,'review'),
    'B1: department head still denied');
  PERFORM set_config('harness.uid','',false);
END $$;

-- ---------------------------------------------------------------------------
-- 11. Submit path now routes P1 through the strict initializer
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='submit_student_request_with_details';
  PERFORM public.h_assert(position('public.initialize_b1_request_workflow_strict(v_request_id' in v_src) > 0,
    'submit_student_request_with_details calls the strict initializer');
  PERFORM public.h_assert(position('public.initialize_student_request_workflow(v_request_id)' in v_src) = 0,
    'generic (unassigned) initializer callsite removed from the P1 submit path');
END $$;

SELECT 'P1_08_PG17_REHEARSAL_CASES_PASS' AS result;
