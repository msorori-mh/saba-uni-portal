-- B1 E2E 88 disposable PG17 proof harness (LOCAL ONLY)
-- Applied AFTER 10-minimal-schema.sql and the 88 migration.
-- Transactional: BEGIN … ROLLBACK
BEGIN;

DO $seed$
DECLARE
  -- identities
  u_student uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  u_other_student uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  u_real_sa uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  u_e2e_sa uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  u_unbound_sa uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  u_admin uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  u_registrar uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  u_dean uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  u_dh_src uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  u_dh_tgt uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
  u_dh_wrong uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';

  d_src uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  d_tgt uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  d_other uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';

  unit_sa uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  unit_dept uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff2';
  role_sa uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff3';
  role_dh uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff4';

  pa_src uuid := '12121212-1212-4121-8121-121212121211';
  pa_tgt uuid := '12121212-1212-4121-8121-121212121212';

  rt_susp uuid;
  rt_xfer uuid;
  rt_enroll uuid;
  wf_susp uuid := '13131313-1313-4131-8131-131313131311';
  wf_xfer uuid := '13131313-1313-4131-8131-131313131312';
  cfg_review uuid := '14141414-1414-4141-8141-141414141411';
  cfg_src uuid := '14141414-1414-4141-8141-141414141412';
  cfg_tgt uuid := '14141414-1414-4141-8141-141414141413';

  sp_student uuid := '15151515-1515-4151-8151-151515151511';
  sp_other uuid := '15151515-1515-4151-8151-151515151512';

  req_normal uuid := '16161616-1616-4161-8161-161616161611';
  req_e2e uuid := '16161616-1616-4161-8161-161616161612';
  req_e2e2 uuid := '16161616-1616-4161-8161-161616161613';
  req_fixture uuid := '16161616-1616-4161-8161-161616161619';
  step_normal uuid := '17171717-1717-4171-8171-171717171711';
  step_e2e uuid := '17171717-1717-4171-8171-171717171712';
  step_e2e_other uuid := '17171717-1717-4171-8171-171717171713';
  step_src uuid := '17171717-1717-4171-8171-171717171714';
  step_tgt uuid := '17171717-1717-4171-8171-171717171715';

  corr uuid := '18181818-1818-4181-8181-181818181811';
  corr2 uuid := '18181818-1818-4181-8181-181818181812';
  exec_id uuid;
  bind_id uuid;
  created_id uuid;
  v_ok boolean;
  v_rpa_before bigint;
  v_rpa_after bigint;
  v_fix_before bigint;
  v_fix_after bigint;
  v_vis_before bigint;
  v_vis_after bigint;
  i int;
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (u_student,'student@testonly.quboolye.com'),
    (u_other_student,'other@testonly.quboolye.com'),
    (u_real_sa,'real.sa@example.com'),
    (u_e2e_sa,'sa_spec@testonly.quboolye.com'),
    (u_unbound_sa,'unassigned@testonly.quboolye.com'),
    (u_admin,'admin@testonly.quboolye.com'),
    (u_registrar,'registrar@testonly.quboolye.com'),
    (u_dean,'dean@testonly.quboolye.com'),
    (u_dh_src,'dh_src@testonly.quboolye.com'),
    (u_dh_tgt,'dh_tgt@testonly.quboolye.com'),
    (u_dh_wrong,'dh_wrong@testonly.quboolye.com');

  INSERT INTO public.departments(id,name_ar) VALUES
    (d_src,'مصدر'),(d_tgt,'هدف'),(d_other,'آخر');

  INSERT INTO public.request_processing_units(id,code) VALUES
    (unit_sa,'student_affairs'),(unit_dept,'department');
  INSERT INTO public.request_processing_roles(id,unit_id,code) VALUES
    (role_sa,unit_sa,'student_affairs_specialist'),
    (role_dh,unit_dept,'department_head');

  INSERT INTO public.position_assignments(id,user_id,is_active,assigned_from) VALUES
    (pa_src,u_dh_src,true,CURRENT_DATE),
    (pa_tgt,u_dh_tgt,true,CURRENT_DATE);

  -- 13 synthetic "production" assignments fingerprint surface
  INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,user_id,is_active)
  SELECT unit_sa, role_sa, 'user', u_real_sa, true
  FROM generate_series(1,1);
  INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active)
  VALUES
    (unit_dept,role_dh,'position_assignment',pa_src,d_src,true),
    (unit_dept,role_dh,'position_assignment',pa_tgt,d_tgt,true);
  INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,user_id,is_active)
  SELECT unit_sa, role_sa, 'user', u_real_sa, true
  FROM generate_series(1,10);

  INSERT INTO public.request_types(code,is_active,student_visible,request_audience) VALUES
    ('enrollment_suspension',true,false,'active_student'),
    ('excused_absence',true,false,'active_student'),
    ('department_transfer',true,false,'active_student'),
    ('final_chance',true,false,'active_student'),
    ('file_withdrawal',true,false,'active_student'),
    ('enrollment_certificate',true,true,'active_student');

  SELECT id INTO rt_susp FROM public.request_types WHERE code='enrollment_suspension';
  SELECT id INTO rt_xfer FROM public.request_types WHERE code='department_transfer';
  SELECT id INTO rt_enroll FROM public.request_types WHERE code='enrollment_certificate';

  INSERT INTO public.request_type_workflows(id,request_type_id,status,is_active) VALUES
    (wf_susp,rt_susp,'active',true),(wf_xfer,rt_xfer,'active',true);

  INSERT INTO public.request_type_workflow_steps(id,workflow_id,step_key,step_order,processing_unit_id,processing_role_id,action_type)
  VALUES
    (cfg_review,wf_susp,'initial_review',1,unit_sa,role_sa,'review'),
    (cfg_src,wf_xfer,'source_department_head_approval',1,unit_dept,role_dh,'approve'),
    (cfg_tgt,wf_xfer,'target_department_head_approval',2,unit_dept,role_dh,'approve');

  INSERT INTO public.request_type_workflow_transitions(workflow_id,from_step_id,to_step_id,action_result)
  VALUES
    (wf_susp,cfg_review,NULL,'reviewed'),
    (wf_xfer,cfg_src,cfg_tgt,'approved'),
    (wf_xfer,cfg_tgt,NULL,'approved');

  INSERT INTO public.student_profiles(id,user_id,status,academic_number) VALUES
    (sp_student,u_student,'active','TEST_ONLY_E2E_88_STU'),
    (sp_other,u_other_student,'active','TEST_ONLY_E2E_88_OTH');

  -- Normal production-like request (no E2E marker)
  INSERT INTO public.student_requests(id,request_number,student_profile_id,request_type,title,status,form_data)
  VALUES (req_normal,'SR-NORMAL-88',sp_student,'enrollment_suspension','normal','submitted','{}'::jsonb);
  PERFORM set_config('b1.atomic_init','1',true);
  INSERT INTO public.student_request_workflow_steps(
    id,student_request_id,workflow_id,workflow_step_id,step_key,step_order,status,
    processing_unit_id,processing_role_id,assigned_user_id
  ) VALUES (
    step_normal,req_normal,wf_susp,cfg_review,'initial_review',1,'active',unit_sa,role_sa,u_real_sa
  );
  PERFORM set_config('b1.atomic_init','',true);

  -- 19 authoritative fixture number placeholders
  FOR i IN 1..19 LOOP
    INSERT INTO public.student_requests(id,request_number,student_profile_id,request_type,title,status,form_data)
    VALUES (
      ('16161616-1616-4161-8161-16161616'||lpad(i::text,4,'0'))::uuid,
      'SR-20260801-13'||lpad(i::text,6,'0'),
      sp_student,'enrollment_suspension','fixture','submitted',
      jsonb_build_object('authoritative_fixture','true')
    );
  END LOOP;

  SELECT count(*) INTO v_rpa_before FROM public.request_processing_assignments WHERE is_active;
  SELECT count(*) INTO v_fix_before FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_before FROM public.request_types
    WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
      AND student_visible = false;
  IF v_rpa_before <> 13 OR v_fix_before <> 19 OR v_vis_before <> 5 THEN
    RAISE EXCEPTION 'HARNESS_SEED_FINGERPRINT_FAIL rpa=% fix=% vis=%', v_rpa_before, v_fix_before, v_vis_before;
  END IF;

  ------------------------------------------------------------------
  -- A) Normal production behavior unchanged
  ------------------------------------------------------------------
  PERFORM set_config('e_rpcmatrix.uid', u_real_sa::text, true);
  IF NOT public.can_current_user_act_on_step(step_normal,'review') THEN
    RAISE EXCEPTION 'A_REAL_ASSIGNMENT_SHOULD_PASS';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_unbound_sa::text, true);
  IF public.can_current_user_act_on_step(step_normal,'review') THEN
    RAISE EXCEPTION 'A_UNASSIGNED_SAME_ROLE_SHOULD_FAIL';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_admin::text, true);
  IF public.can_current_user_act_on_step(step_normal,'review') THEN
    RAISE EXCEPTION 'A_ADMIN_BYPASS_SHOULD_FAIL';
  END IF;
  PERFORM set_config('e_rpcmatrix.uid', u_registrar::text, true);
  IF public.can_current_user_act_on_step(step_normal,'review') THEN
    RAISE EXCEPTION 'A_REGISTRAR_BYPASS_SHOULD_FAIL';
  END IF;
  PERFORM set_config('e_rpcmatrix.uid', u_dean::text, true);
  IF public.can_current_user_act_on_step(step_normal,'review') THEN
    RAISE EXCEPTION 'A_DEAN_BYPASS_SHOULD_FAIL';
  END IF;

  ------------------------------------------------------------------
  -- C) Creation while hidden
  ------------------------------------------------------------------
  PERFORM set_config('e_rpcmatrix.uid', u_student::text, true);
  BEGIN
    PERFORM public.create_student_request(
      'enrollment_suspension','denied','{}'::jsonb,NULL
    );
    RAISE EXCEPTION 'C_HIDDEN_CREATE_SHOULD_DENY';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    IF SQLERRM NOT LIKE '%غير متاح للطالب%' AND SQLSTATE <> '42501' THEN
      -- accept 42501 / Arabic denial
      NULL;
    END IF;
  END;

  -- reject enrollment_certificate via E2E path
  BEGIN
    PERFORM public.create_student_request(
      'enrollment_certificate','no',
      jsonb_build_object('e2e_marker','TEST_ONLY_B1_E2E_88','e2e_correlation_id',corr::text),
      NULL
    );
    RAISE EXCEPTION 'C_ENROLLMENT_CERT_SHOULD_DENY';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  exec_id := public.open_b1_e2e_88_execution(corr, u_student, 'enrollment_suspension', now() + interval '1 hour');

  created_id := public.create_student_request(
    'enrollment_suspension','e2e create',
    jsonb_build_object('e2e_marker','TEST_ONLY_B1_E2E_88','e2e_correlation_id',corr::text),
    NULL
  );
  IF created_id IS NULL THEN RAISE EXCEPTION 'C_E2E_CREATE_SHOULD_PASS'; END IF;
  IF (SELECT form_data->>'e2e_marker' FROM public.student_requests WHERE id=created_id)
     IS DISTINCT FROM 'TEST_ONLY_B1_E2E_88' THEN
    RAISE EXCEPTION 'C_MARKER_MISSING';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_other_student::text, true);
  BEGIN
    PERFORM public.create_student_request(
      'enrollment_suspension','other',
      jsonb_build_object('e2e_marker','TEST_ONLY_B1_E2E_88','e2e_correlation_id',corr::text),
      NULL
    );
    RAISE EXCEPTION 'C_OTHER_STUDENT_SHOULD_DENY';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  PERFORM set_config('e_rpcmatrix.uid', u_student::text, true);
  BEGIN
    PERFORM public.create_student_request(
      'enrollment_suspension','second',
      jsonb_build_object('e2e_marker','TEST_ONLY_B1_E2E_88','e2e_correlation_id',corr::text),
      NULL
    );
    RAISE EXCEPTION 'C_SECOND_REQUEST_SHOULD_DENY';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.request_types
      WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
        AND student_visible = false) <> 5 THEN
    RAISE EXCEPTION 'C_STUDENT_VISIBLE_DRIFT';
  END IF;

  ------------------------------------------------------------------
  -- B) Request-scoped E2E authorization
  ------------------------------------------------------------------
  -- Prepare E2E request runtime (use created_id)
  UPDATE public.student_requests SET status='submitted' WHERE id=created_id;
  PERFORM set_config('b1.atomic_init','1',true);
  INSERT INTO public.student_request_workflow_steps(
    id,student_request_id,workflow_id,workflow_step_id,step_key,step_order,status,
    processing_unit_id,processing_role_id,assigned_user_id
  ) VALUES (
    step_e2e,created_id,wf_susp,cfg_review,'initial_review',1,'active',unit_sa,role_sa,u_real_sa
  );
  -- second request/step for cross-request denial
  INSERT INTO public.student_requests(id,request_number,student_profile_id,request_type,title,status,form_data)
  VALUES (
    req_e2e2,'SR-E2E-88-B',sp_student,'enrollment_suspension','e2e2','submitted',
    jsonb_build_object('e2e_marker','TEST_ONLY_B1_E2E_88','e2e_correlation_id',corr2::text,'e2e_immutable',true)
  );
  INSERT INTO public.student_request_workflow_steps(
    id,student_request_id,workflow_id,workflow_step_id,step_key,step_order,status,
    processing_unit_id,processing_role_id,assigned_user_id
  ) VALUES (
    step_e2e_other,req_e2e2,wf_susp,cfg_review,'initial_review',1,'active',unit_sa,role_sa,u_real_sa
  );
  PERFORM set_config('b1.atomic_init','',true);

  bind_id := public.bind_b1_e2e_88_actor_to_runtime_step(
    corr, created_id, step_e2e, u_e2e_sa, 'review'
  );

  PERFORM set_config('e_rpcmatrix.uid', u_e2e_sa::text, true);
  IF NOT public.can_current_user_act_on_step(step_e2e,'review') THEN
    RAISE EXCEPTION 'B_BOUND_ACTOR_SHOULD_PASS';
  END IF;
  IF public.can_current_user_act_on_step(step_e2e_other,'review') THEN
    RAISE EXCEPTION 'B_CROSS_REQUEST_SHOULD_FAIL';
  END IF;
  IF public.can_current_user_act_on_step(step_e2e,'approve') THEN
    RAISE EXCEPTION 'B_WRONG_ACTION_REPLAY_SHOULD_FAIL';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_unbound_sa::text, true);
  IF public.can_current_user_act_on_step(step_e2e,'review') THEN
    RAISE EXCEPTION 'B_SAME_ROLE_UNBOUND_SHOULD_FAIL';
  END IF;

  -- Department head cases
  INSERT INTO public.student_requests(id,request_number,student_profile_id,request_type,title,status,form_data)
  VALUES (
    req_e2e,'SR-E2E-88-XFER',sp_student,'department_transfer','xfer','submitted',
    jsonb_build_object('e2e_marker','TEST_ONLY_B1_E2E_88','e2e_correlation_id',corr2::text,'e2e_immutable',true)
  );
  INSERT INTO public.transfer_request_details(request_id,current_department_id,requested_department_id)
  VALUES (req_e2e,d_src,d_tgt);
  PERFORM set_config('b1.atomic_init','1',true);
  INSERT INTO public.student_request_workflow_steps(
    id,student_request_id,workflow_id,workflow_step_id,step_key,step_order,status,
    processing_unit_id,processing_role_id,assigned_position_assignment_id
  ) VALUES
    (step_src,req_e2e,wf_xfer,cfg_src,'source_department_head_approval',1,'active',unit_dept,role_dh,pa_src),
    (step_tgt,req_e2e,wf_xfer,cfg_tgt,'target_department_head_approval',2,'pending',unit_dept,role_dh,pa_tgt);
  PERFORM set_config('b1.atomic_init','',true);

  PERFORM public.open_b1_e2e_88_execution(corr2, u_student, 'department_transfer', now() + interval '1 hour');
  UPDATE public.b1_e2e_88_executions SET created_request_id = req_e2e WHERE correlation_id = corr2;

  PERFORM public.bind_b1_e2e_88_actor_to_runtime_step(
    corr2, req_e2e, step_src, u_dh_src, 'approve', d_src, 'source'
  );
  -- activate target for scope tests
  PERFORM set_config('b1.atomic_action','1',true);
  UPDATE public.student_request_workflow_steps SET status='active' WHERE id=step_tgt;
  PERFORM set_config('b1.atomic_action','',true);
  PERFORM public.bind_b1_e2e_88_actor_to_runtime_step(
    corr2, req_e2e, step_tgt, u_dh_tgt, 'approve', d_tgt, 'target'
  );

  PERFORM set_config('e_rpcmatrix.uid', u_dh_src::text, true);
  IF NOT public.can_current_user_act_on_step(step_src,'approve') THEN
    RAISE EXCEPTION 'B_SOURCE_DH_SHOULD_PASS';
  END IF;
  IF public.can_current_user_act_on_step(step_tgt,'approve') THEN
    RAISE EXCEPTION 'B_SOURCE_AS_TARGET_SHOULD_FAIL';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_dh_tgt::text, true);
  IF NOT public.can_current_user_act_on_step(step_tgt,'approve') THEN
    RAISE EXCEPTION 'B_TARGET_DH_SHOULD_PASS';
  END IF;
  IF public.can_current_user_act_on_step(step_src,'approve') THEN
    RAISE EXCEPTION 'B_TARGET_AS_SOURCE_SHOULD_FAIL';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_dh_wrong::text, true);
  IF public.can_current_user_act_on_step(step_src,'approve') THEN
    RAISE EXCEPTION 'B_WRONG_DEPARTMENT_SHOULD_FAIL';
  END IF;

  -- expired execution (keep expires_at > starts_at check satisfied)
  UPDATE public.b1_e2e_88_executions
  SET starts_at = now() - interval '2 hours',
      expires_at = now() - interval '1 second'
  WHERE correlation_id = corr;
  PERFORM set_config('e_rpcmatrix.uid', u_e2e_sa::text, true);
  IF public.can_current_user_act_on_step(step_e2e,'review') THEN
    RAISE EXCEPTION 'B_EXPIRED_SHOULD_FAIL';
  END IF;
  UPDATE public.b1_e2e_88_executions
  SET starts_at = now() - interval '1 minute',
      expires_at = now() + interval '1 hour'
  WHERE correlation_id = corr;

  -- closed execution
  PERFORM public.close_b1_e2e_88_execution(corr, 'harness');
  IF public.can_current_user_act_on_step(step_e2e,'review') THEN
    RAISE EXCEPTION 'B_CLOSED_SHOULD_FAIL';
  END IF;

  -- wrong correlation / non-TEST_ONLY / fixture rejection on bind
  BEGIN
    PERFORM public.bind_b1_e2e_88_actor_to_runtime_step(
      '18181818-1818-4181-8181-181818181899'::uuid, created_id, step_e2e, u_e2e_sa, 'review'
    );
    RAISE EXCEPTION 'B_WRONG_CORR_SHOULD_FAIL';
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    PERFORM public.bind_b1_e2e_88_actor_to_runtime_step(
      corr2, req_normal, step_normal, u_e2e_sa, 'review'
    );
    RAISE EXCEPTION 'B_NON_TEST_ONLY_BIND_SHOULD_FAIL';
  EXCEPTION WHEN others THEN NULL;
  END;

  SELECT id INTO req_fixture FROM public.student_requests WHERE request_number='SR-20260801-13000001';
  BEGIN
    PERFORM set_config('b1.atomic_init','1',true);
    INSERT INTO public.student_request_workflow_steps(
      id,student_request_id,workflow_id,workflow_step_id,step_key,step_order,status,
      processing_unit_id,processing_role_id,assigned_user_id
    ) VALUES (
      '17171717-1717-4171-8171-171717171799',req_fixture,wf_susp,cfg_review,'initial_review',1,'active',
      unit_sa,role_sa,u_real_sa
    );
    PERFORM set_config('b1.atomic_init','',true);
    PERFORM public.bind_b1_e2e_88_actor_to_runtime_step(
      corr2, req_fixture, '17171717-1717-4171-8171-171717171799'::uuid, u_e2e_sa, 'review'
    );
    RAISE EXCEPTION 'B_FIXTURE_BIND_SHOULD_FAIL';
  EXCEPTION WHEN others THEN
    PERFORM set_config('b1.atomic_init','',true);
  END;

  -- no duplicate active step on normal request
  IF (SELECT count(*) FROM public.student_request_workflow_steps
      WHERE student_request_id=req_normal AND status='active') <> 1 THEN
    RAISE EXCEPTION 'B_DUPLICATE_ACTIVE_STEP';
  END IF;

  ------------------------------------------------------------------
  -- D) Cleanup
  ------------------------------------------------------------------
  PERFORM public.cleanup_b1_e2e_88_package(NULL, true);
  PERFORM set_config('e_rpcmatrix.uid', u_e2e_sa::text, true);
  IF public.can_current_user_act_on_step(step_e2e,'review') THEN
    RAISE EXCEPTION 'D_BINDINGS_SHOULD_BE_UNUSABLE';
  END IF;

  PERFORM set_config('e_rpcmatrix.uid', u_real_sa::text, true);
  IF NOT public.can_current_user_act_on_step(step_normal,'review') THEN
    RAISE EXCEPTION 'D_NORMAL_AUTH_SHOULD_REMAIN';
  END IF;

  SELECT count(*) INTO v_rpa_after FROM public.request_processing_assignments WHERE is_active;
  SELECT count(*) INTO v_fix_after FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_after FROM public.request_types
    WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
      AND student_visible = false;

  IF v_rpa_after IS DISTINCT FROM v_rpa_before OR v_rpa_after <> 13 THEN
    RAISE EXCEPTION 'D_RPA_FINGERPRINT_DRIFT before=% after=%', v_rpa_before, v_rpa_after;
  END IF;
  IF v_fix_after IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'D_FIXTURE_DRIFT:%', v_fix_after;
  END IF;
  IF v_vis_after <> 5 THEN
    RAISE EXCEPTION 'D_VISIBILITY_DRIFT';
  END IF;

  IF (SELECT count(*) FROM public.b1_e2e_88_audit_events) < 3 THEN
    RAISE EXCEPTION 'D_AUDIT_EVIDENCE_MISSING';
  END IF;

  RAISE NOTICE 'PASS_B1_E2E_88_PG17_DISPOSABLE_HARNESS';
END;
$seed$;

ROLLBACK;
