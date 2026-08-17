-- TEST_ONLY disposable harness supplement for Department Transfer 10A1.
-- It uses only synthetic rows created by the integrated B1 harness.
-- Direct RPC calls are made below; no production endpoint is referenced.

DO $$
DECLARE
  u_student uuid := '11111111-1111-4111-8111-111111111101';
  u_other uuid := '11111111-1111-4111-8111-111111111102';
  u_sa_spec uuid := '22222222-2222-4222-8222-222222222201';
  u_admin uuid := '22222222-2222-4222-8222-22222222220e';
  u_dean uuid := '22222222-2222-4222-8222-22222222220f';
  u_registrar uuid := '22222222-2222-4222-8222-222222222203';
  req uuid;
  first_step uuid;
  payment_step uuid;
  step_count integer;
  expected_keys text[] := ARRAY[
    'student_affairs_intake',
    'source_department_head_approval',
    'target_department_head_approval',
    'dean_approval',
    'payment_confirmation',
    'registrar_apply'
  ];
  actual_keys text[];
  audit_acl_ok boolean;
  log_audit_ok boolean;
BEGIN
  SELECT NOT has_table_privilege('anon','public.audit_logs','INSERT')
     AND NOT has_table_privilege('anon','public.audit_logs','UPDATE')
     AND NOT has_table_privilege('anon','public.audit_logs','DELETE')
     AND NOT has_table_privilege('authenticated','public.audit_logs','INSERT')
     AND NOT has_table_privilege('authenticated','public.audit_logs','UPDATE')
     AND NOT has_table_privilege('authenticated','public.audit_logs','DELETE')
    INTO audit_acl_ok;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid=to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')
      AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg WHERE cfg='search_path=public')
  ) INTO log_audit_ok;
  PERFORM b1_e2e.note(
    'department_transfer/direct_rpc/audit_append_only', 'catalog',
    audit_acl_ok AND log_audit_ok,
    format('audit_acl_ok=%s log_audit_security_definer_pinned=%s', audit_acl_ok, log_audit_ok)
  );

  SELECT r.id INTO req
  FROM public.student_requests r
  WHERE r.request_type IN ('department_transfer','transfer')
    AND r.student_profile_id='33333333-3333-4333-8333-333333333301'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF req IS NULL THEN
    RAISE EXCEPTION 'DEPARTMENT_TRANSFER_TEST_FIXTURE_MISSING';
  END IF;

  SELECT count(*), array_agg(s.step_key ORDER BY s.step_order)
    INTO step_count, actual_keys
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=req;

  PERFORM b1_e2e.note(
    'department_transfer/direct_rpc/workflow_shape', 'catalog',
    step_count=6 AND actual_keys=expected_keys,
    format('count=%s keys=%s', step_count, actual_keys)
  );

  SELECT s.id INTO first_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=req
  ORDER BY s.step_order
  LIMIT 1;

  SELECT s.id INTO payment_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=req AND s.step_key='payment_confirmation';

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/other_student_read', 'read', u_other,
    format('select public.get_b1_request_details_for_student(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/student_staff_read', 'read', u_student,
    format('select public.get_b1_assigned_request_details_for_actor(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/admin_bypass', 'action', u_admin,
    format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', first_step, 'approve'),
    '%B1_%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/dean_bypass', 'action', u_dean,
    format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', first_step, 'approve'),
    '%B1_%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/registrar_bypass', 'action', u_registrar,
    format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', first_step, 'apply_decision'),
    '%B1_%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/replay', 'action', u_sa_spec,
    format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', first_step, 'review'),
    '%B1_%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/malformed_payload', 'action', u_sa_spec,
    format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L,%L,%L::jsonb)', first_step, 'review', 'bad', '{"forged":true}'),
    '%B1_%', req);

  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/payment_replay_wrong_actor', 'action', u_other,
    format('select public.record_external_university_payment_confirmation(%L::uuid,%L)', payment_step, 'forged payment'),
    '%B1_%', req);
END $$;
