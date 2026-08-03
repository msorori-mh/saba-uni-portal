-- Post-repair package assertions (disposable) including exact seven-step contract.
DO $$
DECLARE
  k_marker text := 'TEST_ONLY_B1_FIXTURE_13';
  k_req uuid := 'f1300000-0000-4000-8000-000000000015';
  v_n int;
  v_status text;
  v_active int;
  v_completed int;
  v_events int;
  v_evidence int;
  v_exp record;
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_unit text;
  v_role text;
  v_principal uuid;
BEGIN
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE internal_notes = k_marker;
  IF v_n IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'VERIFY_REQUESTS_NOT_19:%', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
   WHERE r.internal_notes = k_marker AND s.status = 'active';
  IF v_n IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'VERIFY_ACTIVE_NOT_19:%', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_requests r
     WHERE r.internal_notes = k_marker
       AND (SELECT count(*) FROM public.student_request_workflow_steps s
             WHERE s.student_request_id = r.id AND s.status = 'active') <> 1
  ) THEN
    RAISE EXCEPTION 'VERIFY_NOT_ONE_ACTIVE_PER_REQUEST';
  END IF;

  SELECT status INTO v_status FROM public.student_requests WHERE id = k_req;
  IF v_status IS DISTINCT FROM 'in_review' THEN
    RAISE EXCEPTION 'VERIFY_F15_STATUS:%', v_status;
  END IF;

  SELECT
      count(*) FILTER (WHERE status='completed'),
      count(*) FILTER (WHERE status='active')
    INTO v_completed, v_active
    FROM public.student_request_workflow_steps
   WHERE student_request_id = k_req;
  IF v_completed IS DISTINCT FROM 6 OR v_active IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VERIFY_F15_DIST completed=% active=%', v_completed, v_active;
  END IF;

  FOR v_exp IN
    SELECT * FROM (VALUES
      (1, 'f1300001-0000-4000-8000-000015000001'::uuid, 'student_affairs_intake',
       'student_affairs', 'student_affairs_specialist', 'review',
       'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid, 'completed'::text),
      (2, 'f1300001-0000-4000-8000-000015000002'::uuid, 'library_clearance',
       'library', 'library_officer', 'clear',
       'e7a93314-bb06-4525-b412-5315198c668a'::uuid, 'completed'),
      (3, 'f1300001-0000-4000-8000-000015000003'::uuid, 'labs_clearance',
       'labs', 'labs_manager', 'clear',
       '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid, 'completed'),
      (4, 'f1300001-0000-4000-8000-000015000004'::uuid, 'activities_clearance',
       'student_affairs', 'student_affairs_manager', 'clear',
       'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, 'completed'),
      (5, 'f1300001-0000-4000-8000-000015000005'::uuid, 'finance_clearance',
       'finance', 'revenue_finance_officer', 'clear',
       '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, 'completed'),
      (6, 'f1300001-0000-4000-8000-000015000006'::uuid, 'registrar_apply',
       'registrar', 'registrar_general', 'apply_decision',
       '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, 'completed'),
      (7, 'f1300001-0000-4000-8000-000015000007'::uuid, 'archive',
       'archive', 'archive_officer', 'archive',
       'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid, 'active')
    ) AS e(step_order, step_id, step_key, unit_code, role_code, action_type, principal_user_id, expected_status)
  LOOP
    SELECT * INTO v_step FROM public.student_request_workflow_steps WHERE id = v_exp.step_id;
    SELECT u.code INTO v_unit FROM public.request_processing_units u WHERE u.id = v_step.processing_unit_id;
    SELECT rr.code INTO v_role FROM public.request_processing_roles rr WHERE rr.id = v_step.processing_role_id;
    SELECT sp.user_id INTO v_principal FROM public.staff_profiles sp WHERE sp.id = v_step.assigned_staff_profile_id;
    IF v_step.step_key IS DISTINCT FROM v_exp.step_key
       OR v_step.step_order IS DISTINCT FROM v_exp.step_order
       OR v_step.status IS DISTINCT FROM v_exp.expected_status
       OR v_unit IS DISTINCT FROM v_exp.unit_code
       OR v_role IS DISTINCT FROM v_exp.role_code
       OR coalesce(v_step.metadata->>'action_type','') IS DISTINCT FROM v_exp.action_type
       OR v_principal IS DISTINCT FROM v_exp.principal_user_id THEN
      RAISE EXCEPTION 'VERIFY_F15_STEP_CONTRACT order=% key=% status=%',
        v_exp.step_order, v_step.step_key, v_step.status;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_events FROM public.student_request_workflow_events
   WHERE student_request_id = k_req;
  IF v_events < 1 THEN
    RAISE EXCEPTION 'VERIFY_EVENT_LOST';
  END IF;

  SELECT count(*) INTO v_evidence FROM public.b1_fixture_15_reissue_44_evidence
   WHERE request_id = k_req;
  IF v_evidence < 1 THEN
    RAISE EXCEPTION 'VERIFY_EVIDENCE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_types
     WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
       AND student_visible IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'VERIFY_VISIBILITY_REGRESSED';
  END IF;

  IF (SELECT student_visible FROM public.request_types WHERE code='enrollment_certificate') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_EC_VISIBILITY_CHANGED';
  END IF;
END $$;

SELECT 'VERIFY_B1_44_OK' AS status;
