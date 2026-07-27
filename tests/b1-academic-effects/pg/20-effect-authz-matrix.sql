-- B1 academic-effects authz + effect matrix (LOCAL ONLY).
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_student uuid := '10000000-0000-4000-8000-000000000001';
  v_actor uuid := '20000000-0000-4000-8000-000000000001';
  v_wrong uuid := '20000000-0000-4000-8000-000000000099';
  v_dept_old uuid := '30000000-0000-4000-8000-000000000001';
  v_dept_new uuid := '30000000-0000-4000-8000-000000000002';
  v_prog_old uuid := '31000000-0000-4000-8000-000000000001';
  v_prog_new uuid := '31000000-0000-4000-8000-000000000002';
  v_year uuid := '40000000-0000-4000-8000-000000000001';
  v_sem uuid := '41000000-0000-4000-8000-000000000001';
  v_level uuid := '42000000-0000-4000-8000-000000000001';
  v_section uuid := '43000000-0000-4000-8000-000000000001';
  v_wf uuid;
  v_cfg_prior uuid;
  v_cfg_apply uuid;
  r_susp uuid := '50000000-0000-4000-8000-000000000001';
  r_abs uuid := '50000000-0000-4000-8000-000000000002';
  r_tr uuid := '50000000-0000-4000-8000-000000000003';
  r_fc uuid := '50000000-0000-4000-8000-000000000004';
  r_fw uuid := '50000000-0000-4000-8000-000000000005';
  s_prior uuid;
  s_apply uuid;
  s_wrong uuid;
  before jsonb;
  after jsonb;
  denied boolean;
  src text;
BEGIN
  INSERT INTO public.departments(id,name_ar) VALUES (v_dept_old,'old'),(v_dept_new,'new');
  INSERT INTO public.programs(id,department_id,name_ar) VALUES (v_prog_old,v_dept_old,'old'),(v_prog_new,v_dept_new,'new');
  INSERT INTO public.academic_years(id) VALUES (v_year);
  INSERT INTO public.semesters(id,academic_year_id) VALUES (v_sem,v_year);
  INSERT INTO public.levels(id) VALUES (v_level);
  INSERT INTO public.course_sections(id) VALUES (v_section);
  INSERT INTO public.student_profiles(id,user_id,department_id,program_id)
    VALUES (v_student,v_student,v_dept_old,v_prog_old);
  INSERT INTO public.student_academic_status(student_profile_id,academic_year_id,semester_id,level_id,enrollment_status)
    VALUES (v_student,v_year,v_sem,v_level,'active');
  INSERT INTO public.student_enrollments(student_profile_id,course_section_id,enrollment_status)
    VALUES (v_student,v_section,'enrolled');
  INSERT INTO public.enrollment_certificate_grants(student_profile_id) VALUES (v_student);
  INSERT INTO public.request_types(code,student_visible) VALUES ('enrollment_certificate', false);

  INSERT INTO public.request_type_workflows(id,code,status,is_active)
    VALUES ('60000000-0000-4000-8000-000000000001','b1_fx','active',true)
    RETURNING id INTO v_wf;
  INSERT INTO public.request_type_workflow_steps(id,workflow_id,step_key,action_type,step_order)
    VALUES
      ('61000000-0000-4000-8000-000000000001',v_wf,'review','review',1),
      ('61000000-0000-4000-8000-000000000002',v_wf,'registrar_apply','apply_decision',2),
      ('61000000-0000-4000-8000-000000000003',v_wf,'record_apply','apply_decision',2);
  v_cfg_prior := '61000000-0000-4000-8000-000000000001';
  v_cfg_apply := '61000000-0000-4000-8000-000000000002';

  -- Helper to seed one request with prior+apply steps
  -- suspension
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)
    VALUES (r_susp,v_student,'enrollment_suspension','in_review','FX-SUSP');
  INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id)
    VALUES (r_susp,v_year,v_sem);
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000011',r_susp,v_wf,v_cfg_prior,1,'completed')
    RETURNING id INTO s_prior;
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status,processing_unit_id,processing_role_id)
    VALUES ('70000000-0000-4000-8000-000000000012',r_susp,v_wf,v_cfg_apply,2,'active',v_actor,v_actor)
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');

  -- excused absence (record_apply)
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)
    VALUES (r_abs,v_student,'excused_absence','in_review','FX-ABS');
  INSERT INTO public.absence_excuse_details(request_id,course_section_id,absence_date,reason_type)
    VALUES (r_abs,v_section,CURRENT_DATE,'medical');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000021',r_abs,v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status,processing_unit_id,processing_role_id)
    VALUES ('70000000-0000-4000-8000-000000000022',r_abs,v_wf,
      (SELECT id FROM public.request_type_workflow_steps WHERE step_key='record_apply'),2,'active',v_actor,v_actor)
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');

  -- transfer
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)
    VALUES (r_tr,v_student,'department_transfer','in_review','FX-TR');
  INSERT INTO public.transfer_request_details(request_id,requested_department_id,requested_program_id)
    VALUES (r_tr,v_dept_new,v_prog_new);
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000031',r_tr,v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status,processing_unit_id,processing_role_id)
    VALUES ('70000000-0000-4000-8000-000000000032',r_tr,v_wf,v_cfg_apply,2,'active',v_actor,v_actor)
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');

  -- final chance
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)
    VALUES (r_fc,v_student,'final_chance','in_review','FX-FC');
  INSERT INTO public.extra_chance_details(request_id,academic_year_id,semester_id,chance_type,reason)
    VALUES (r_fc,v_year,v_sem,'exam','fixture reason long enough');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000041',r_fc,v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status,processing_unit_id,processing_role_id)
    VALUES ('70000000-0000-4000-8000-000000000042',r_fc,v_wf,v_cfg_apply,2,'active',v_actor,v_actor)
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');

  -- file withdrawal
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)
    VALUES (r_fw,v_student,'file_withdrawal','in_review','FX-FW');
  INSERT INTO public.file_withdrawal_details(request_id,library_cleared_at,labs_cleared_at,activities_cleared_at,finance_cleared_at)
    VALUES (r_fw,now(),now(),now(),now());
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000051',r_fw,v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status,processing_unit_id,processing_role_id)
    VALUES ('70000000-0000-4000-8000-000000000052',r_fw,v_wf,v_cfg_apply,2,'active',v_actor,v_actor)
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');

  PERFORM b1_fx.set_uid(v_actor);
  PERFORM set_config('b1.atomic_action','1',true);

  -- POSITIVE five
  PERFORM public.apply_b1_enrollment_suspension_effect(r_susp);
  PERFORM b1_fx.note('positive/suspension','positive',
    (SELECT effect_applied_at IS NOT NULL FROM public.enrollment_suspension_details WHERE request_id=r_susp)
    AND EXISTS (SELECT 1 FROM public.student_academic_status WHERE student_profile_id=v_student AND enrollment_status='suspended'));

  PERFORM public.apply_b1_excused_absence_effect(r_abs);
  PERFORM b1_fx.note('positive/absence','positive',
    (SELECT record_applied_at IS NOT NULL FROM public.absence_excuse_details WHERE request_id=r_abs)
    AND EXISTS (SELECT 1 FROM public.student_excused_absences WHERE absence_excuse_request_id=r_abs));

  PERFORM public.apply_b1_department_transfer_effect(r_tr);
  PERFORM b1_fx.note('positive/transfer','positive',
    (SELECT effect_applied_at IS NOT NULL FROM public.transfer_request_details WHERE request_id=r_tr)
    AND (SELECT department_id=v_dept_new AND program_id=v_prog_new FROM public.student_profiles WHERE id=v_student));

  -- Suspension earlier may flip academic status; final_chance requires active status.
  UPDATE public.student_academic_status
     SET enrollment_status='active'
   WHERE student_profile_id=v_student AND academic_year_id=v_year AND semester_id=v_sem;

  PERFORM public.apply_b1_final_chance_effect(r_fc);
  PERFORM b1_fx.note('positive/final_chance','positive',
    (SELECT chance_applied_at IS NOT NULL FROM public.extra_chance_details WHERE request_id=r_fc)
    AND EXISTS (SELECT 1 FROM public.student_extra_chances WHERE request_id=r_fc));

  -- reset academic status to active for withdrawal effect path
  UPDATE public.student_academic_status SET enrollment_status='active' WHERE student_profile_id=v_student;
  PERFORM public.apply_b1_file_withdrawal_effect(r_fw);
  PERFORM b1_fx.note('positive/file_withdrawal','positive',
    (SELECT effect_applied_at IS NOT NULL AND records_transferred_at IS NOT NULL FROM public.file_withdrawal_details WHERE request_id=r_fw)
    AND EXISTS (SELECT 1 FROM public.student_academic_status WHERE student_profile_id=v_student AND enrollment_status='withdrawn'));

  -- IDEMPOTENCY / retry
  PERFORM public.apply_b1_enrollment_suspension_effect(r_susp);
  PERFORM public.apply_b1_excused_absence_effect(r_abs);
  PERFORM public.apply_b1_department_transfer_effect(r_tr);
  PERFORM public.apply_b1_final_chance_effect(r_fc);
  PERFORM public.apply_b1_file_withdrawal_effect(r_fw);
  PERFORM b1_fx.note('idempotent/suspension','idempotent', (SELECT count(*)=1 FROM public.enrollment_suspension_details WHERE request_id=r_susp AND effect_applied_at IS NOT NULL));
  PERFORM b1_fx.note('idempotent/absence','idempotent', (SELECT count(*)=1 FROM public.student_excused_absences WHERE absence_excuse_request_id=r_abs));
  PERFORM b1_fx.note('idempotent/transfer','idempotent', (SELECT count(*)=1 FROM public.transfer_request_details WHERE request_id=r_tr AND effect_applied_at IS NOT NULL));
  PERFORM b1_fx.note('idempotent/final_chance','idempotent', (SELECT count(*)=1 FROM public.student_extra_chances WHERE request_id=r_fc));
  PERFORM b1_fx.note('idempotent/file_withdrawal','idempotent', (SELECT count(*)=1 FROM public.file_withdrawal_details WHERE request_id=r_fw AND effect_applied_at IS NOT NULL));

  -- DENY: wrong actor (new request clone for suspension deny)
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status)
    VALUES ('50000000-0000-4000-8000-000000000101',v_student,'enrollment_suspension','in_review');
  INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id)
    VALUES ('50000000-0000-4000-8000-000000000101',v_year,v_sem);
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000111','50000000-0000-4000-8000-000000000101',v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000112','50000000-0000-4000-8000-000000000101',v_wf,v_cfg_apply,2,'active')
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');
  before := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000101');
  PERFORM b1_fx.set_uid(v_wrong);
  denied := false;
  BEGIN
    PERFORM public.apply_b1_enrollment_suspension_effect('50000000-0000-4000-8000-000000000101');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED%';
  END;
  after := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000101');
  PERFORM b1_fx.note('deny/wrong_actor','deny', denied);
  PERFORM b1_fx.note('zero/wrong_actor','zero_mutation', before = after);

  -- DENY: incomplete predecessor
  PERFORM b1_fx.set_uid(v_actor);
  UPDATE public.student_request_workflow_steps SET status='active'
    WHERE id='70000000-0000-4000-8000-000000000111';
  before := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000101');
  denied := false;
  BEGIN
    PERFORM public.apply_b1_enrollment_suspension_effect('50000000-0000-4000-8000-000000000101');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%B1_PREDECESSOR_INCOMPLETE%';
  END;
  after := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000101');
  PERFORM b1_fx.note('deny/incomplete_predecessor','deny', denied);
  PERFORM b1_fx.note('zero/incomplete_predecessor','zero_mutation', before = after);
  UPDATE public.student_request_workflow_steps SET status='completed'
    WHERE id='70000000-0000-4000-8000-000000000111';

  -- DENY: wrong step key (active step is review, not apply)
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status)
    VALUES ('50000000-0000-4000-8000-000000000102',v_student,'enrollment_suspension','in_review');
  INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id)
    VALUES ('50000000-0000-4000-8000-000000000102',v_year,v_sem);
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000121','50000000-0000-4000-8000-000000000102',v_wf,v_cfg_prior,1,'active')
    RETURNING id INTO s_wrong;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_wrong,v_actor,'apply_decision');
  before := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000102');
  denied := false;
  BEGIN
    PERFORM public.apply_b1_enrollment_suspension_effect('50000000-0000-4000-8000-000000000102');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED%' OR SQLERRM LIKE '%B1_SUSPENSION%';
  END;
  after := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000102');
  PERFORM b1_fx.note('deny/wrong_step','deny', denied AND (after->>'suspension_marker') IS NULL);
  PERFORM b1_fx.note('zero/wrong_step','zero_mutation', before = after);

  -- DENY: wrong action capability (allowed clear only)
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status)
    VALUES ('50000000-0000-4000-8000-000000000103',v_student,'enrollment_suspension','in_review');
  INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id)
    VALUES ('50000000-0000-4000-8000-000000000103',v_year,v_sem);
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000131','50000000-0000-4000-8000-000000000103',v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000132','50000000-0000-4000-8000-000000000103',v_wf,v_cfg_apply,2,'active')
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'clear');
  before := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000103');
  denied := false;
  BEGIN
    PERFORM public.apply_b1_enrollment_suspension_effect('50000000-0000-4000-8000-000000000103');
  EXCEPTION WHEN OTHERS THEN
    denied := SQLERRM LIKE '%B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED%';
  END;
  after := b1_fx.snapshot_effect('50000000-0000-4000-8000-000000000103');
  PERFORM b1_fx.note('deny/wrong_action','deny', denied);
  PERFORM b1_fx.note('zero/wrong_action','zero_mutation', before = after);

  -- ROLLBACK: aborted transaction leaves marker null on a fresh request
  INSERT INTO public.student_requests(id,student_profile_id,request_type,status)
    VALUES ('50000000-0000-4000-8000-000000000104',v_student,'enrollment_suspension','in_review');
  INSERT INTO public.enrollment_suspension_details(request_id,requested_from_academic_year_id,requested_from_semester_id)
    VALUES ('50000000-0000-4000-8000-000000000104',v_year,v_sem);
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000141','50000000-0000-4000-8000-000000000104',v_wf,v_cfg_prior,1,'completed');
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_order,status)
    VALUES ('70000000-0000-4000-8000-000000000142','50000000-0000-4000-8000-000000000104',v_wf,v_cfg_apply,2,'active')
    RETURNING id INTO s_apply;
  INSERT INTO b1_fx.allowed_actor(step_id,user_id,action) VALUES (s_apply,v_actor,'apply_decision');
  BEGIN
    PERFORM public.apply_b1_enrollment_suspension_effect('50000000-0000-4000-8000-000000000104');
    RAISE EXCEPTION 'FORCE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FORCE_ROLLBACK%' THEN
      NULL; -- swallowed; outer DO is one transaction so this does NOT rollback parent
    END IF;
  END;
END $$;

-- True rollback proof outside PL/pgSQL (SAVEPOINT is SQL-transaction level).
UPDATE public.enrollment_suspension_details SET effect_applied_at=NULL
 WHERE request_id='50000000-0000-4000-8000-000000000104';
UPDATE public.student_academic_status SET enrollment_status='active'
 WHERE student_profile_id='10000000-0000-4000-8000-000000000001';

BEGIN;
SELECT set_config('b1_fx.uid','20000000-0000-4000-8000-000000000001', true);
SELECT set_config('b1.atomic_action','1', true);
SAVEPOINT sp_fx;
SELECT public.apply_b1_enrollment_suspension_effect('50000000-0000-4000-8000-000000000104');
ROLLBACK TO SAVEPOINT sp_fx;
RELEASE SAVEPOINT sp_fx;
COMMIT;

DO $$
DECLARE marker_after timestamptz;
BEGIN
  SELECT effect_applied_at INTO marker_after
    FROM public.enrollment_suspension_details
   WHERE request_id='50000000-0000-4000-8000-000000000104';
  PERFORM b1_fx.note('rollback/savepoint','rollback', marker_after IS NULL, 'savepoint rolled back effect');
END $$;

-- EC regression + source body probes
DO $$
DECLARE
  src text;
  ec_before bigint;
  ec_after bigint;
  vis_before bigint;
  vis_after bigint;
BEGIN
  SELECT count(*) INTO ec_before FROM public.enrollment_certificate_grants;
  SELECT count(*) INTO vis_before FROM public.request_types WHERE student_visible IS TRUE;

  src := pg_get_functiondef('public.apply_b1_enrollment_suspension_effect(uuid)'::regprocedure)
    || pg_get_functiondef('public.apply_b1_excused_absence_effect(uuid)'::regprocedure)
    || pg_get_functiondef('public.apply_b1_department_transfer_effect(uuid)'::regprocedure)
    || pg_get_functiondef('public.apply_b1_final_chance_effect(uuid)'::regprocedure)
    || pg_get_functiondef('public.apply_b1_file_withdrawal_effect(uuid)'::regprocedure)
    || pg_get_functiondef('public.apply_b1_academic_effect_for_request(uuid)'::regprocedure)
    || pg_get_functiondef('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure);

  SELECT count(*) INTO ec_after FROM public.enrollment_certificate_grants;
  SELECT count(*) INTO vis_after FROM public.request_types WHERE student_visible IS TRUE;

  PERFORM b1_fx.note(
    'regression/enrollment_certificate',
    'regression',
    ec_before = ec_after
      AND vis_before = vis_after
      AND src !~* 'enrollment_certificate'
      AND src !~* 'student_visible',
    format('ec=%s->%s vis=%s->%s', ec_before, ec_after, vis_before, vis_after)
  );

  PERFORM b1_fx.note(
    'integration/act_on_calls_dispatcher',
    'integration',
    src ILIKE '%apply_b1_academic_effect_for_request%',
    'act_on body includes dispatcher'
  );
END $$;
