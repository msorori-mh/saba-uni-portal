-- TEST_ONLY disposable harness supplement for Department Transfer 10A1.
-- It uses only synthetic rows created by the integrated B1 harness.
-- Direct RPC calls are made below; no production endpoint is referenced.

DO $$
DECLARE
  u_student uuid := '11111111-1111-4111-8111-111111111101';
  u_other uuid := '11111111-1111-4111-8111-111111111102';
  u_sa_spec uuid := '22222222-2222-4222-8222-222222222201';
  u_chair_cs uuid := '22222222-2222-4222-8222-22222222220b';
  u_chair_it uuid := '22222222-2222-4222-8222-22222222220c';
  u_admin uuid := '22222222-2222-4222-8222-22222222220e';
  u_dean uuid := '22222222-2222-4222-8222-22222222220f';
  u_registrar uuid := '22222222-2222-4222-8222-222222222203';
  req uuid;
  payment_req uuid;
  first_step uuid;
  payment_step uuid;
  att uuid;
  expected_version timestamptz;
  v jsonb;
  step public.student_request_workflow_steps%rowtype;
  actor uuid;
  action text;
  assigned_role text;
  processing_unit text;
  i integer;
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

  -- Build an independent request and stop at an active payment step. The
  -- existing lifecycle request is completed by this point, so it cannot prove
  -- wrong-actor authorization for the payment RPC.
  PERFORM b1_e2e.set_uid(u_student);
  v := public.create_b1_request_draft_for_student('department_transfer', 'e2e-direct-payment-active');
  payment_req := (v->>'requestId')::uuid;
  expected_version := (v->>'updatedAt')::timestamptz;
  v := public.create_student_request_attachment_upload_intent(
    payment_req, 'secondary_certificate', 'direct-payment.pdf', 'application/pdf', 4096, null);
  att := (v->>'attachment_id')::uuid;
  BEGIN
    INSERT INTO storage.objects(bucket_id, name, owner, metadata)
    VALUES (
      coalesce(v->>'storage_bucket', 'student-request-secure-attachments'),
      v->>'storage_object_path',
      u_student,
      jsonb_build_object('size', 4096, 'mimetype', 'application/pdf')
    );
    PERFORM public.complete_student_request_attachment_upload(att);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.student_request_attachment_uploads
       SET upload_status = 'attached'
     WHERE id = att;
  END;
  v := public.save_b1_request_draft_for_student(
    payment_req,
    jsonb_build_object(
      'target_department_id', '55555555-5555-4555-8555-555555555501',
      'target_program_id', '66666666-6666-4666-8666-666666666601',
      'transfer_reason', 'independent payment authorization probe',
      'secondary_certificate_file', jsonb_build_array(att)
    ),
    expected_version,
    null
  );
  v := public.submit_b1_student_request_atomic(
    payment_req, 'department_transfer', v->'formData', (v->>'updatedAt')::timestamptz, array[att]);

  FOR i IN 1..4 LOOP
    SELECT * INTO step FROM b1_e2e.active_step(payment_req);
    IF step.id IS NULL THEN
      RAISE EXCEPTION 'DEPARTMENT_TRANSFER_PAYMENT_FIXTURE_STOPPED_EARLY';
    END IF;
    SELECT
      COALESCE(
        step.assigned_user_id,
        (SELECT sp.user_id FROM public.staff_profiles sp WHERE sp.id = step.assigned_staff_profile_id),
        (SELECT fp.user_id FROM public.faculty_profiles fp WHERE fp.id = step.assigned_faculty_profile_id),
        (SELECT pa.user_id FROM public.position_assignments pa WHERE pa.id = step.assigned_position_assignment_id),
        CASE rpa.assignment_type
          WHEN 'user' THEN rpa.user_id
          WHEN 'staff_profile' THEN (SELECT sp.user_id FROM public.staff_profiles sp WHERE sp.id = rpa.staff_profile_id)
          WHEN 'faculty_profile' THEN (SELECT fp.user_id FROM public.faculty_profiles fp WHERE fp.id = rpa.faculty_profile_id)
          WHEN 'position_assignment' THEN (SELECT pa.user_id FROM public.position_assignments pa WHERE pa.id = rpa.position_assignment_id)
        END
      ),
       rpu.code,
       rpr.code
    INTO actor, processing_unit, assigned_role
    FROM public.request_processing_units rpu
    JOIN public.request_processing_roles rpr ON rpr.id = step.processing_role_id
    LEFT JOIN LATERAL (
      SELECT a.*
      FROM public.request_processing_assignments a
      WHERE a.unit_id = step.processing_unit_id
        AND a.role_id = step.processing_role_id
        AND a.is_active = true
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND (
          step.step_key NOT IN ('source_department_head_approval', 'target_department_head_approval')
          OR a.department_id = (
            SELECT CASE step.step_key
              WHEN 'source_department_head_approval' THEN d.current_department_id
              WHEN 'target_department_head_approval' THEN d.requested_department_id
            END
            FROM public.transfer_request_details d
            WHERE d.request_id = payment_req
          )
        )
      ORDER BY a.id
      LIMIT 1
    ) rpa ON true
    WHERE rpu.id = step.processing_unit_id;
    IF actor IS NULL OR processing_unit IS NULL OR assigned_role IS NULL THEN
      RAISE EXCEPTION 'DEPARTMENT_TRANSFER_PAYMENT_FIXTURE_ASSIGNMENT_REQUIRED step=% unit=% role=% actor=%',
        step.step_key, processing_unit, assigned_role, actor;
    END IF;
    PERFORM b1_e2e.note(
      format('department_transfer/direct_rpc/payment_fixture_assignment/%s', step.step_key),
      'catalog',
      true,
      format('assigned_user_id=%s assigned_role=%s processing_unit_id=%s step_key=%s actor=%s',
        step.assigned_user_id, assigned_role, step.processing_unit_id, step.step_key, actor)
    );
    action := CASE step.step_key
      WHEN 'student_affairs_intake' THEN 'review'
      WHEN 'source_department_head_approval' THEN 'approve'
      WHEN 'target_department_head_approval' THEN 'approve'
      WHEN 'dean_approval' THEN 'approve'
    END;
    IF actor IS NULL OR action IS NULL THEN
      RAISE EXCEPTION 'DEPARTMENT_TRANSFER_PAYMENT_FIXTURE_UNEXPECTED_STEP_%', step.step_key;
    END IF;
    PERFORM b1_e2e.set_uid(actor);
    IF NOT public.user_matches_workflow_runtime_step(step.id) THEN
      RAISE EXCEPTION 'DEPARTMENT_TRANSFER_PAYMENT_FIXTURE_ACTOR_NOT_ASSIGNED step=% actor=% unit=% role=%',
        step.step_key, actor, processing_unit, assigned_role;
    END IF;
    PERFORM public.act_on_b1_student_request_step_atomic(step.id, action, 'e2e active payment fixture');
  END LOOP;

  SELECT s.id INTO payment_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = payment_req
    AND s.step_key = 'payment_confirmation'
    AND s.status = 'active';
  IF payment_step IS NULL THEN
    RAISE EXCEPTION 'DEPARTMENT_TRANSFER_PAYMENT_FIXTURE_ACTIVE_STEP_REQUIRED';
  END IF;
  PERFORM b1_e2e.note(
    'department_transfer/direct_rpc/payment_fixture_active',
    'catalog',
    EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps s
      WHERE s.id = payment_step AND s.status = 'active' AND s.step_key = 'payment_confirmation'
    ),
    format('request=%s step=%s status=active wrong_actor=%s', payment_req, payment_step, u_other)
  );
  PERFORM b1_e2e.expect_deny(
    'department_transfer/direct_rpc/payment_replay_wrong_actor', 'action', u_other,
    format('select public.record_external_university_payment_confirmation(%L::uuid,%L)', payment_step, 'forged payment'),
    '%DIRECT_PAYMENT_ASSIGNEE_REQUIRED%', payment_req);
END $$;
