-- B1 E2E 88 — decommission proof seed (LOCAL ONLY)
-- Applied AFTER exact base function restores + migration 88.
-- Seeds 19 fixtures, five hidden services, enrollment_certificate visible,
-- a normal assignee step, one disposable E2E open→create→cleanup cycle
-- (audit evidence, no open execution / active binding left).

BEGIN;

DO $seed$
DECLARE
  u_student uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  u_real_sa uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  u_unbound_sa uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';

  unit_sa uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  role_sa uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff3';

  rt_susp uuid;
  wf_susp uuid := '13131313-1313-4131-8131-131313131311';
  cfg_review uuid := '14141414-1414-4141-8141-141414141411';

  sp_student uuid := '15151515-1515-4151-8151-151515151511';
  req_normal uuid := '16161616-1616-4161-8161-161616161611';
  step_normal uuid := '17171717-1717-4171-8171-171717171711';

  corr uuid := gen_random_uuid();
  exec_id uuid;
  created_id uuid;
  i int;
  v_fix bigint;
  v_vis_five bigint;
  v_vis_enroll boolean;
  v_open bigint;
  v_active bigint;
  v_audit bigint;
BEGIN
  IF to_regprocedure('public.cleanup_b1_e2e_88_package(uuid,boolean)') IS NOT NULL THEN
    -- restore_assignees=false: clear open/active harness leftovers without CAS
    -- against synthetic mutant bindings that have empty assignee snapshots.
    PERFORM public.cleanup_b1_e2e_88_package(NULL, false);
  END IF;

  INSERT INTO auth.users(id, email) VALUES
    (u_student, 'student@testonly.quboolye.com'),
    (u_real_sa, 'real.sa@example.com'),
    (u_unbound_sa, 'unassigned@testonly.quboolye.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.request_processing_units(id, code) VALUES
    (unit_sa, 'student_affairs')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.request_processing_roles(id, unit_id, code) VALUES
    (role_sa, unit_sa, 'student_affairs_specialist')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.request_processing_assignments;
  INSERT INTO public.request_processing_assignments(unit_id, role_id, assignment_type, user_id, is_active)
  VALUES (unit_sa, role_sa, 'user', u_real_sa, true);
  INSERT INTO public.request_processing_assignments(unit_id, role_id, assignment_type, user_id, is_active)
  SELECT unit_sa, role_sa, 'user', u_real_sa, true FROM generate_series(1, 12);

  INSERT INTO public.request_types(code, is_active, student_visible, request_audience) VALUES
    ('enrollment_suspension', true, false, 'active_student'),
    ('excused_absence', true, false, 'active_student'),
    ('department_transfer', true, false, 'active_student'),
    ('final_chance', true, false, 'active_student'),
    ('file_withdrawal', true, false, 'active_student'),
    ('enrollment_certificate', true, true, 'active_student')
  ON CONFLICT (code) DO UPDATE
    SET is_active = EXCLUDED.is_active,
        student_visible = EXCLUDED.student_visible,
        request_audience = EXCLUDED.request_audience;

  SELECT id INTO rt_susp FROM public.request_types WHERE code = 'enrollment_suspension';

  INSERT INTO public.request_type_workflows(id, request_type_id, status, is_active) VALUES
    (wf_susp, rt_susp, 'active', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.request_type_workflow_steps(
    id, workflow_id, step_key, step_order, processing_unit_id, processing_role_id, action_type
  ) VALUES
    (cfg_review, wf_susp, 'initial_review', 1, unit_sa, role_sa, 'review')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.request_type_workflow_transitions(workflow_id, from_step_id, to_step_id, action_result)
  SELECT wf_susp, cfg_review, NULL, 'reviewed'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = wf_susp AND t.from_step_id = cfg_review AND t.action_result = 'reviewed'
  );

  INSERT INTO public.student_profiles(id, user_id, status, academic_number) VALUES
    (sp_student, u_student, 'active', 'TEST_ONLY_E2E_88_STU')
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('b1.atomic_init', '1', true);
  DELETE FROM public.student_request_workflow_steps WHERE student_request_id = req_normal
    OR student_request_id IN (
      SELECT id FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%'
    );
  DELETE FROM public.student_requests WHERE id = req_normal
     OR request_number LIKE 'SR-20260801-13%';

  INSERT INTO public.student_requests(id, request_number, student_profile_id, request_type, title, status, form_data)
  VALUES (req_normal, 'SR-NORMAL-88', sp_student, 'enrollment_suspension', 'normal', 'submitted', '{}'::jsonb);

  INSERT INTO public.student_request_workflow_steps(
    id, student_request_id, workflow_id, workflow_step_id, step_key, step_order, status,
    processing_unit_id, processing_role_id, assigned_user_id, metadata
  ) VALUES (
    step_normal, req_normal, wf_susp, cfg_review, 'initial_review', 1, 'active',
    unit_sa, role_sa, u_real_sa,
    jsonb_build_object(
      'direct_assignment_id',
      (SELECT id FROM public.request_processing_assignments WHERE user_id = u_real_sa LIMIT 1)
    )
  );
  PERFORM set_config('b1.atomic_init', '', true);

  FOR i IN 1..19 LOOP
    INSERT INTO public.student_requests(id, request_number, student_profile_id, request_type, title, status, form_data)
    VALUES (
      ('16161616-1616-4161-8161-16161616' || lpad(i::text, 4, '0'))::uuid,
      'SR-20260801-13' || lpad(i::text, 6, '0'),
      sp_student, 'enrollment_suspension', 'fixture', 'submitted',
      jsonb_build_object('authoritative_fixture', 'true')
    );
  END LOOP;

  -- Disposable E2E cycle for audit evidence, then operational cleanup
  exec_id := public.open_b1_e2e_88_execution(
    corr, u_student, 'enrollment_suspension', now() + interval '1 hour'
  );
  PERFORM set_config('e_rpcmatrix.uid', u_student::text, true);
  created_id := public.create_student_request(
    'enrollment_suspension', 'decom seed',
    jsonb_build_object(
      'e2e_marker', 'TEST_ONLY_B1_E2E_88',
      'e2e_correlation_id', corr::text
    ),
    NULL
  );
  IF created_id IS NULL THEN
    RAISE EXCEPTION 'DECOM_SEED_E2E_CREATE_FAILED';
  END IF;

  PERFORM public.cleanup_b1_e2e_88_package(NULL, true);

  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;
  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings WHERE active;
  SELECT count(*) INTO v_fix
  FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_five FROM public.request_types
  WHERE code IN (
    'enrollment_suspension', 'excused_absence', 'department_transfer',
    'final_chance', 'file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;
  SELECT student_visible INTO v_vis_enroll
  FROM public.request_types WHERE code = 'enrollment_certificate';
  SELECT count(*) INTO v_audit FROM public.b1_e2e_88_audit_events;

  IF v_open <> 0 OR v_active <> 0 THEN
    RAISE EXCEPTION 'DECOM_SEED_NOT_CLEAN open=% active=%', v_open, v_active;
  END IF;
  IF v_fix IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'DECOM_SEED_FIXTURE_DRIFT:%', v_fix;
  END IF;
  IF v_vis_five <> 0 THEN
    RAISE EXCEPTION 'DECOM_SEED_VISIBILITY_DRIFT';
  END IF;
  IF v_vis_enroll IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'DECOM_SEED_ENROLLMENT_VISIBILITY_DRIFT';
  END IF;
  IF v_audit < 1 THEN
    RAISE EXCEPTION 'DECOM_SEED_AUDIT_MISSING';
  END IF;

  RAISE NOTICE 'PASS_B1_E2E_88_DECOM_SEED fixtures=% audit=%', v_fix, v_audit;
END;
$seed$;

COMMIT;
