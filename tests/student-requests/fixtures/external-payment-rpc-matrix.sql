DO $$
DECLARE
  actor uuid := '00000000-0000-0000-0000-000000000001';
  other_actor uuid := '00000000-0000-0000-0000-000000000002';
  request_id uuid := '10000000-0000-0000-0000-000000000001';
  workflow_id uuid := '20000000-0000-0000-0000-000000000001';
  payment_config uuid := '30000000-0000-0000-0000-000000000001';
  next_config uuid := '30000000-0000-0000-0000-000000000002';
  payment_step uuid := '40000000-0000-0000-0000-000000000001';
  next_step uuid := '40000000-0000-0000-0000-000000000002';
  finance_unit uuid := '50000000-0000-0000-0000-000000000001';
  finance_role uuid := '60000000-0000-0000-0000-000000000001';
  result jsonb;
BEGIN
  INSERT INTO request_processing_units VALUES (finance_unit, 'finance');
  INSERT INTO request_processing_roles VALUES (finance_role, 'revenue_finance_officer');
  INSERT INTO request_type_workflow_steps VALUES
    (payment_config, 'confirm_payment'), (next_config, 'review');
  INSERT INTO request_type_workflow_transitions
    (id, workflow_id, from_step_id, to_step_id, action_result, is_default)
  VALUES ('70000000-0000-0000-0000-000000000001', workflow_id,
          payment_config, next_config, 'payment_confirmed', true);
  INSERT INTO student_requests VALUES (request_id, 'department_transfer');
  INSERT INTO student_request_workflow_steps
    (id, student_request_id, workflow_id, workflow_step_id, processing_unit_id,
     processing_role_id, step_key, status, assigned_user_id)
  VALUES
    (payment_step, request_id, workflow_id, payment_config, finance_unit,
     finance_role, 'payment_confirmation', 'active', actor),
    (next_step, request_id, workflow_id, next_config, NULL,
     NULL, 'next_review', 'pending', other_actor);

  PERFORM set_config('request.jwt.claim.sub', other_actor::text, true);
  BEGIN
    PERFORM record_external_university_payment_confirmation(payment_step, 'payment_confirmed', NULL);
    RAISE EXCEPTION 'negative authorization unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  result := record_external_university_payment_confirmation(payment_step, 'payment_not_confirmed', 'not found externally');
  IF result->>'transition_applied' <> 'false' OR
     (SELECT status FROM student_request_workflow_steps WHERE id = payment_step) <> 'active' THEN
    RAISE EXCEPTION 'negative status advanced workflow';
  END IF;

  result := record_external_university_payment_confirmation(payment_step, 'payment_confirmed', 'received externally');
  IF result->>'transition_applied' <> 'true' OR
     (SELECT status FROM student_request_workflow_steps WHERE id = payment_step) <> 'completed' OR
     (SELECT completed_by FROM student_request_workflow_steps WHERE id = payment_step) <> actor OR
     (SELECT status FROM student_request_workflow_steps WHERE id = next_step) <> 'active' OR
     (SELECT count(*) FROM student_request_workflow_events
       WHERE student_request_id = request_id AND event_type IN ('payment_not_confirmed','payment_confirmed')) <> 2 THEN
    RAISE EXCEPTION 'positive confirmation invariant failed';
  END IF;
END $$;
