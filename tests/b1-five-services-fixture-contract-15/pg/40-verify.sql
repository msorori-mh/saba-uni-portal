-- Post-apply verification of the Fixture-13 package on the disposable DB.
\set ON_ERROR_STOP on

DO $v$
DECLARE
  k_marker CONSTANT text := 'TEST_ONLY_B1_FIXTURE_13';
  v_n integer;
  r   record;
BEGIN
  SELECT count(*) INTO v_n FROM public.student_requests WHERE internal_notes = k_marker;
  IF v_n <> 19 THEN RAISE EXCEPTION 'VERIFY_FAIL: % fixture requests', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
   WHERE q.internal_notes = k_marker;
  IF v_n <> 104 THEN RAISE EXCEPTION 'VERIFY_FAIL: % runtime steps', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
   WHERE q.internal_notes = k_marker AND s.status = 'active';
  IF v_n <> 19 THEN RAISE EXCEPTION 'VERIFY_FAIL: % active steps', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.transfer_request_details d
    JOIN public.student_requests q ON q.id = d.request_id
   WHERE q.internal_notes = k_marker
     AND d.current_department_id = 'ce485c67-5f7c-498d-b120-4b1130a86ae8'
     AND d.requested_department_id = '11111111-1111-4111-8111-111111111111';
  IF v_n <> 5 THEN RAISE EXCEPTION 'VERIFY_FAIL: % IT->CS transfer detail rows', v_n; END IF;

  -- G1: production contract holds for EVERY fixture step, not just active ones
  FOR r IN SELECT s.id FROM public.student_request_workflow_steps s
             JOIN public.student_requests q ON q.id = s.student_request_id
            WHERE q.internal_notes = k_marker
  LOOP
    PERFORM public.assert_b1_runtime_step_assignee_effective(r.id);
  END LOOP;

  -- G3: source head = IT head, target head = CS head, CIS never assigned
  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
    JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
   WHERE q.internal_notes = k_marker
     AND s.step_key = 'source_department_head_approval'
     AND pa.user_id = 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e';
  IF v_n <> 5 THEN RAISE EXCEPTION 'VERIFY_FAIL: % source-head steps bound to the IT head', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
    JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
   WHERE q.internal_notes = k_marker
     AND s.step_key = 'target_department_head_approval'
     AND pa.user_id = '97acbe02-c59c-409c-8d51-7d4ef72e6db7';
  IF v_n <> 5 THEN RAISE EXCEPTION 'VERIFY_FAIL: % target-head steps bound to the CS head', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
    JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
   WHERE q.internal_notes = k_marker AND pa.user_id = 'f602b62c-194b-4591-8e9c-956e5cbb347d';
  IF v_n <> 0 THEN RAISE EXCEPTION 'VERIFY_FAIL: CIS head bound to % fixture steps', v_n; END IF;

  -- G1: assigned_user_id must stay NULL (all principals are profile/position kinds)
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
   WHERE q.internal_notes = k_marker AND s.assigned_user_id IS NOT NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'VERIFY_FAIL: % steps carry assigned_user_id', v_n; END IF;

  -- G4: deterministic ids
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps s
    JOIN public.student_requests q ON q.id = s.student_request_id
   WHERE q.internal_notes = k_marker
     AND s.id NOT BETWEEN 'f1300001-0000-4000-8000-000000000000'
                      AND 'f1300001-0000-4000-8000-999999999999';
  IF v_n <> 0 THEN RAISE EXCEPTION 'VERIFY_FAIL: % steps outside deterministic id space', v_n; END IF;

  RAISE NOTICE 'VERIFY_OK: fixture package satisfies the runtime-assignee identity contract';
END $v$;
