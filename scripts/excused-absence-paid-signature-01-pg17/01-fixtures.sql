-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 rehearsal fixtures
-- (isolated throwaway cluster ONLY).
--
-- Reproduces the verified production topology for this service:
--   * excused_absence_free_workflow v1 retired, v2 ACTIVE with three
--     specific_user steps bound to catalog actions and a pinned runtime contract;
--   * one in-flight request already running on v2 (created by the P1-08 chain);
--   * exactly one direct assignee for dean / registrar / finance /
--     student-affairs manager / archive and one department head PER department.

-- ---------------------------------------------------------------------------
-- 1. The active free cycle, shaped exactly like production v2
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_type uuid; v_wf uuid; v_old uuid;
BEGIN
  SELECT id INTO v_type FROM public.request_types WHERE code = 'excused_absence';

  -- The P1-08 fixture seeds the cycle as `excused_absence_v1`; production
  -- carries it as excused_absence_free_workflow version 2.
  UPDATE public.request_type_workflows
     SET code = 'excused_absence_free_workflow', version = 2, name_ar = 'غياب بعذر',
         description_ar = 'B1_FREE_NO_PAYMENT/workflow-v1'
   WHERE request_type_id = v_type AND code = 'excused_absence_v1'
   RETURNING id INTO v_wf;
  IF v_wf IS NULL THEN RAISE EXCEPTION 'FIXTURE_ACTIVE_FREE_WORKFLOW_NOT_FOUND'; END IF;

  UPDATE public.request_type_workflow_steps s
     SET assignment_strategy = 'specific_user',
         status_on_enter = 'in_progress',
         status_on_complete = 'completed',
         action_code = CASE s.action_type
           WHEN 'review' THEN 'REVIEW' WHEN 'approve' THEN 'APPROVE'
           WHEN 'apply_decision' THEN 'REGISTER_EXCUSED_ABSENCE' END,
         config = jsonb_build_object(
           'authorization','exactly_one_direct_assignee','payment_policy','FREE_NO_PAYMENT')
   WHERE s.workflow_id = v_wf;

  -- Retired version 1 (history only).
  INSERT INTO public.request_type_workflows
    (request_type_id, code, name_ar, description_ar, version, status, is_active)
  VALUES (v_type, 'excused_absence_free_workflow', 'غياب بعذر',
          'B1_FREE_NO_PAYMENT/workflow-v1', 1, 'retired', false)
  RETURNING id INTO v_old;

  INSERT INTO public.request_type_workflow_steps
    (workflow_id, step_key, step_name_ar, step_order, processing_unit_id, processing_role_id,
     assignment_strategy, action_type, status_on_enter, status_on_complete, config)
  SELECT v_old, s.step_key, s.step_name_ar, s.step_order, s.processing_unit_id, s.processing_role_id,
         s.assignment_strategy, s.action_type, s.status_on_enter, s.status_on_complete, s.config
  FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_wf;

  -- Runtime contract pins exactly as migration 20260811204643 seeded them.
  INSERT INTO public.b1_workflow_runtime_contract_snapshot
    (workflow_id, request_type_code, workflow_version, step_key, step_order,
     unit_code, role_code, action_type, action_code)
  SELECT s.workflow_id, 'excused_absence', w.version, s.step_key, s.step_order,
         u.code, r.code, s.action_type, s.action_code
  FROM public.request_type_workflow_steps s
  JOIN public.request_type_workflows w ON w.id = s.workflow_id
  JOIN public.request_processing_units u ON u.id = s.processing_unit_id
  JOIN public.request_processing_roles r ON r.id = s.processing_role_id
  WHERE w.request_type_id = v_type
  ON CONFLICT (workflow_id, step_key) DO NOTHING;

  INSERT INTO public.service_platform_runtime_flags (service_code, legacy_fallback_enabled)
  VALUES ('excused_absence', true)
  ON CONFLICT (service_code) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Actors (the P1-08 fixture already provides users …01–…10)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-000000000011'), -- dean
  ('11111111-1111-1111-1111-000000000012'), -- student, information-systems department
  ('11111111-1111-1111-1111-000000000013'), -- student without a department
  ('11111111-1111-1111-1111-000000000014'), -- admin with NO processing assignment
  ('11111111-1111-1111-1111-000000000015'), -- second student-affairs manager, NOT assigned
  ('11111111-1111-1111-1111-000000000016'), -- student, department without a head
  ('11111111-1111-1111-1111-000000000017')  -- student, moved between departments mid-flight
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.departments (id, name_ar) VALUES
  ('22222222-2222-2222-2222-000000000003','قسم بلا رئيس معيّن')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_profiles (id, user_id, full_name_ar, status) VALUES
  ('33333333-3333-3333-3333-000000000011','11111111-1111-1111-1111-000000000011','عميد الكلية','active'),
  ('33333333-3333-3333-3333-000000000014','11111111-1111-1111-1111-000000000014','مدير النظام','active'),
  ('33333333-3333-3333-3333-000000000015','11111111-1111-1111-1111-000000000015','مدير شؤون طلاب غير معيّن','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.request_processing_assignments
  (unit_id, role_id, assignment_type, staff_profile_id, is_active)
SELECT u.id, r.id, 'staff_profile', '33333333-3333-3333-3333-000000000011', true
FROM public.request_processing_units u
JOIN public.request_processing_roles r ON r.unit_id = u.id AND r.code = 'dean'
WHERE u.code = 'dean';

INSERT INTO public.student_profiles (id, user_id, academic_number, full_name_ar, department_id, program_id, status) VALUES
  ('77777777-7777-7777-7777-000000000002','11111111-1111-1111-1111-000000000012','TESTONLY-EAWF01-IS','طالب نظم المعلومات',
   '22222222-2222-2222-2222-000000000002', NULL, 'active'),
  ('77777777-7777-7777-7777-000000000003','11111111-1111-1111-1111-000000000013','TESTONLY-EAWF01-NODEPT','طالب بلا قسم',
   NULL, NULL, 'active'),
  ('77777777-7777-7777-7777-000000000006','11111111-1111-1111-1111-000000000016','TESTONLY-EAWF01-NOHEAD','طالب قسم بلا رئيس',
   '22222222-2222-2222-2222-000000000003', NULL, 'active'),
  ('77777777-7777-7777-7777-000000000007','11111111-1111-1111-1111-000000000017','TESTONLY-EAWF01-MOVED','طالب منقول',
   '22222222-2222-2222-2222-000000000001', NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- Every fixture student is enrolled in the section the excuse refers to.
INSERT INTO public.student_enrollments (student_profile_id, course_section_id, enrollment_status)
SELECT sp.id, '66666666-6666-6666-6666-000000000007', 'enrolled'
FROM public.student_profiles sp
WHERE sp.academic_number LIKE 'TESTONLY-%'
  AND NOT EXISTS (
    SELECT 1 FROM public.student_enrollments e
    WHERE e.student_profile_id = sp.id
      AND e.course_section_id = '66666666-6666-6666-6666-000000000007');

-- The in-flight request on the free cycle keeps its details (real data shape).
INSERT INTO public.absence_excuse_details (request_id, course_section_id, absence_date, reason_type, absence_reason_detail)
VALUES ('88888888-8888-8888-8888-000000000009','66666666-6666-6666-6666-000000000007',
        DATE '2026-09-01','medical','عذر طبي — طلب قائم قبل التحويل')
ON CONFLICT (request_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Harness helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.h_assert(p_cond boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE_FAIL: %', p_label; END IF;
  RAISE NOTICE 'ok: %', p_label;
END $$;

CREATE OR REPLACE FUNCTION public.h_as(p_uid text) RETURNS void
LANGUAGE sql AS $$ SELECT set_config('harness.uid', COALESCE(p_uid,''), false)::text; SELECT NULL::void $$;

CREATE OR REPLACE FUNCTION public.h_step(p_request uuid, p_key text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM public.student_request_workflow_steps
  WHERE student_request_id = p_request AND step_key = p_key $$;

-- Everything the draft may legitimately change, plus everything it must never
-- touch. Used for "a failed apply changed nothing" and for idempotency.
CREATE OR REPLACE FUNCTION public.h_eawf01_fingerprint() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id)::text FROM public.request_type_workflows w),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM public.request_type_workflow_steps s),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.request_type_workflow_transitions t),
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)::text FROM public.b1_workflow_runtime_contract_snapshot c),
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)::text FROM public.request_type_workflow_change_log l),
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)::text FROM public.request_workflow_publish_validations v),
    (SELECT jsonb_agg(to_jsonb(rt) ORDER BY rt.id)::text FROM public.request_types rt),
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text FROM public.request_processing_assignments a),
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM public.student_requests r),
    (SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.id)::text FROM public.student_request_workflow_steps rs),
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM public.student_request_workflow_events e),
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)::text FROM public.absence_excuse_details d),
    (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id)::text FROM public.notifications n),
    (SELECT jsonb_agg(to_jsonb(cc) ORDER BY cc.code)::text FROM public.request_workflow_transition_condition_catalog cc),
    (SELECT string_agg(c.relname, ',' ORDER BY c.relname) FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'),
    (SELECT string_agg(t.tgrelid::regclass::text || ':' || t.tgname, ',' ORDER BY 1) FROM pg_trigger t
      WHERE NOT t.tgisinternal),
    (SELECT string_agg(md5(pg_get_functiondef(p.oid)), ',' ORDER BY p.oid::regprocedure::text)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
        AND p.proname NOT LIKE 'h\_%')
  ));
$$;

-- ACL / security attributes of the functions the draft patches, captured
-- BEFORE the apply so 03-cases.sql can prove they were preserved verbatim.
CREATE TABLE IF NOT EXISTS public.h_eawf01_pre_apply_function_attrs AS
SELECT p.oid::regprocedure::text AS signature, p.proowner, p.prosecdef, p.provolatile,
       p.proconfig::text AS proconfig, p.proacl::text AS proacl
FROM pg_proc p
WHERE p.oid IN (
  'public.initialize_b1_request_workflow_strict(uuid,text)'::regprocedure,
  'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)'::regprocedure,
  'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure,
  'public.record_external_university_payment_confirmation(uuid,text)'::regprocedure,
  'public.apply_b1_excused_absence_effect(uuid)'::regprocedure,
  'public.evaluate_workflow_transition_condition(uuid,jsonb)'::regprocedure,
  'public.trg_notify_student_request()'::regprocedure,
  'public.can_current_user_act_on_step(uuid,text)'::regprocedure);

-- ---------------------------------------------------------------------------
-- 4. A SECOND in-flight request on the free cycle (initialized BEFORE the
--    cut-over), used to prove the documented resubmit limitation.
-- ---------------------------------------------------------------------------
INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status, form_data, submitted_at)
VALUES ('88888888-8888-8888-8888-00000000000a','77777777-7777-7777-7777-000000000002','excused_absence',
  'SR-TESTONLY-EAWF01-INFLIGHT-B','غياب بعذر','submitted','{}'::jsonb, now());

INSERT INTO public.absence_excuse_details (request_id, course_section_id, absence_date, reason_type, absence_reason_detail)
VALUES ('88888888-8888-8888-8888-00000000000a','66666666-6666-6666-6666-000000000007',
        DATE '2026-09-02','official','طلب قائم ثانٍ قبل التحويل');

SELECT public.initialize_b1_request_workflow_strict('88888888-8888-8888-8888-00000000000a','excused_absence') ->> 'initialized';
