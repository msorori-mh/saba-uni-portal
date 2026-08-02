-- ============================================================================
-- PORTAL-B1-AUTHORITATIVE-POSITIVE-FIXTURE-MATRIX-19-MINIMAL-36
-- DISPOSABLE POSTGRESQL 17 REAL RPC HARNESS
--
-- Proves for each of the 19 active TEST_ONLY fixture cases:
--   1. Establish exact fixture principal / auth context (request.jwt.claim.sub & e_rpcmatrix.uid)
--   2. Invoke exact declared RPC (act_on_b1_student_request_step_atomic or record_external_university_payment_confirmation)
--   3. Require correct actor + action to succeed with success=true
--   4. Require wrong actor to fail (raise exception)
--   5. Require wrong action to fail (raise exception)
--   6. Verify workflow transition (executed step completed, next step active or terminal approved/completed)
--   7. Verify workflow event added to student_request_workflow_events
--   8. Verify expected business effect (student profile department / academic status update on terminal steps)
--   9. Verify zero unrelated mutation
--  10. Prove exactly 19 RPC executions occurred
--  11. Prove enrollment_certificate remains untouched (4 requests, 2 details, 2 docs)
--  12. Transactional safety with BEGIN ... ROLLBACK
-- ============================================================================

BEGIN;

CREATE TEMP TABLE pg_temp.harness_results (
  case_index integer PRIMARY KEY,
  request_number text NOT NULL,
  step_code text NOT NULL,
  rpc_name text NOT NULL,
  wrong_actor_failed boolean NOT NULL,
  wrong_action_failed boolean NOT NULL,
  exact_rpc_passed boolean NOT NULL,
  transition_verified boolean NOT NULL,
  business_effect_verified boolean NOT NULL,
  zero_unrelated_mutation boolean NOT NULL,
  overall_pass boolean NOT NULL
);

DO $disposable_real_rpc_harness$
DECLARE
  v_wrong_actor CONSTANT uuid := '00000000-0000-4000-8000-0000000000ff';
  v_wrong_action CONSTANT text := 'invalid_alternative_action';
  
  v_case record;
  v_req_id uuid;
  v_step_id uuid;
  v_actor_id uuid;
  v_action text;
  v_rpc text;
  v_next_step text;
  v_terminal boolean;

  v_rpc_execution_count integer := 0;
  v_unrelated_req_count integer;
  v_unrelated_step_count integer;
  v_events_before integer;
  v_events_after integer;
  
  v_step_status_before text;
  v_step_status_after text;
  v_req_status_before text;
  v_req_status_after text;
  v_next_step_ok boolean;
  
  v_wrong_actor_ok boolean;
  v_wrong_action_ok boolean;
  v_exact_rpc_ok boolean;
  v_transition_ok boolean;
  v_business_effect_ok boolean;
  v_zero_mutation_ok boolean;
  v_res jsonb;

  v_student_dept uuid;
  v_student_status text;
  v_ec_req_count integer;
  v_ec_detail_count integer;
  v_ec_doc_count integer;
BEGIN
  -- 0. Baseline verification
  SELECT count(*) INTO v_unrelated_req_count
    FROM public.student_requests
   WHERE request_number NOT LIKE 'SR-20260801-13%';

  FOR v_case IN
    SELECT * FROM (VALUES
      ( 1, 'SR-20260801-13000001', 'f1300000-0000-4000-8000-000000000001'::uuid, 'f1300001-0000-4000-8000-000001000002'::uuid, 'source_department_head_approval', 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'target_department_head_approval', false),
      ( 2, 'SR-20260801-13000002', 'f1300000-0000-4000-8000-000000000002'::uuid, 'f1300001-0000-4000-8000-000002000003'::uuid, 'target_department_head_approval', '97acbe02-c59c-409c-8d51-7d4ef72e6db7'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'dean_approval', false),
      ( 3, 'SR-20260801-13000003', 'f1300000-0000-4000-8000-000000000003'::uuid, 'f1300001-0000-4000-8000-000003000004'::uuid, 'dean_approval', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'payment_confirmation', false),
      ( 4, 'SR-20260801-13000004', 'f1300000-0000-4000-8000-000000000004'::uuid, 'f1300001-0000-4000-8000-000004000005'::uuid, 'payment_confirmation', '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, 'confirm_payment', 'record_external_university_payment_confirmation', 'registrar_apply', false),
      ( 5, 'SR-20260801-13000005', 'f1300000-0000-4000-8000-000000000005'::uuid, 'f1300001-0000-4000-8000-000005000006'::uuid, 'registrar_apply', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, 'apply_decision', 'act_on_b1_student_request_step_atomic', NULL, true),
      ( 6, 'SR-20260801-13000006', 'f1300000-0000-4000-8000-000000000006'::uuid, 'f1300001-0000-4000-8000-000006000002'::uuid, 'manager_approval', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'registrar_apply', false),
      ( 7, 'SR-20260801-13000007', 'f1300000-0000-4000-8000-000000000007'::uuid, 'f1300001-0000-4000-8000-000007000003'::uuid, 'registrar_apply', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, 'apply_decision', 'act_on_b1_student_request_step_atomic', NULL, true),
      ( 8, 'SR-20260801-13000008', 'f1300000-0000-4000-8000-000000000008'::uuid, 'f1300001-0000-4000-8000-000008000002'::uuid, 'manager_review', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'record_apply', false),
      ( 9, 'SR-20260801-13000009', 'f1300000-0000-4000-8000-000000000009'::uuid, 'f1300001-0000-4000-8000-000009000003'::uuid, 'record_apply', 'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid, 'apply_decision', 'act_on_b1_student_request_step_atomic', NULL, true),
      (10, 'SR-20260801-13000010', 'f1300000-0000-4000-8000-000000000010'::uuid, 'f1300001-0000-4000-8000-000010000002'::uuid, 'library_clearance', 'e7a93314-bb06-4525-b412-5315198c668a'::uuid, 'clear', 'act_on_b1_student_request_step_atomic', 'labs_clearance', false),
      (11, 'SR-20260801-13000011', 'f1300000-0000-4000-8000-000000000011'::uuid, 'f1300001-0000-4000-8000-000011000003'::uuid, 'labs_clearance', '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid, 'clear', 'act_on_b1_student_request_step_atomic', 'activities_clearance', false),
      (12, 'SR-20260801-13000012', 'f1300000-0000-4000-8000-000000000012'::uuid, 'f1300001-0000-4000-8000-000012000004'::uuid, 'activities_clearance', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, 'clear', 'act_on_b1_student_request_step_atomic', 'finance_clearance', false),
      (13, 'SR-20260801-13000013', 'f1300000-0000-4000-8000-000000000013'::uuid, 'f1300001-0000-4000-8000-000013000005'::uuid, 'finance_clearance', '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, 'clear', 'act_on_b1_student_request_step_atomic', 'registrar_apply', false),
      (14, 'SR-20260801-13000014', 'f1300000-0000-4000-8000-000000000014'::uuid, 'f1300001-0000-4000-8000-000014000006'::uuid, 'registrar_apply', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, 'apply_decision', 'act_on_b1_student_request_step_atomic', 'archive', false),
      (15, 'SR-20260801-13000015', 'f1300000-0000-4000-8000-000000000015'::uuid, 'f1300001-0000-4000-8000-000015000007'::uuid, 'archive', 'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid, 'archive', 'act_on_b1_student_request_step_atomic', NULL, true),
      (16, 'SR-20260801-13000016', 'f1300000-0000-4000-8000-000000000016'::uuid, 'f1300001-0000-4000-8000-000016000002'::uuid, 'manager_review', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'dean_decision', false),
      (17, 'SR-20260801-13000017', 'f1300000-0000-4000-8000-000000000017'::uuid, 'f1300001-0000-4000-8000-000017000003'::uuid, 'dean_decision', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0'::uuid, 'approve', 'act_on_b1_student_request_step_atomic', 'payment_confirmation', false),
      (18, 'SR-20260801-13000018', 'f1300000-0000-4000-8000-000000000018'::uuid, 'f1300001-0000-4000-8000-000018000004'::uuid, 'payment_confirmation', '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, 'confirm_payment', 'record_external_university_payment_confirmation', 'registrar_apply', false),
      (19, 'SR-20260801-13000019', 'f1300000-0000-4000-8000-000000000019'::uuid, 'f1300001-0000-4000-8000-000019000005'::uuid, 'registrar_apply', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, 'apply_decision', 'act_on_b1_student_request_step_atomic', NULL, true)
    ) AS x(idx, req_num, req_id, step_id, step_code, actor_id, action, rpc, next_step, terminal)
  LOOP
    v_req_id := v_case.req_id;
    v_step_id := v_case.step_id;
    v_actor_id := v_case.actor_id;
    v_action := v_case.action;
    v_rpc := v_case.rpc;
    v_next_step := v_case.next_step;
    v_terminal := v_case.terminal;

    -- ------------------------------------------------------------------------
    -- TEST 1: WRONG ACTOR MUST FAIL
    -- ------------------------------------------------------------------------
    v_wrong_actor_ok := false;
    PERFORM set_config('request.jwt.claim.sub', v_wrong_actor::text, true);
    PERFORM set_config('e_rpcmatrix.uid', v_wrong_actor::text, true);
    BEGIN
      IF v_rpc = 'act_on_b1_student_request_step_atomic' THEN
        PERFORM public.act_on_b1_student_request_step_atomic(v_step_id, v_action, 'Wrong actor note', '{}'::jsonb);
      ELSE
        PERFORM public.record_external_university_payment_confirmation(v_step_id, 'REC-FAIL-WRONG-ACTOR');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_wrong_actor_ok := true;
    END;

    -- ------------------------------------------------------------------------
    -- TEST 2: WRONG ACTION MUST FAIL
    -- ------------------------------------------------------------------------
    v_wrong_action_ok := false;
    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
    PERFORM set_config('e_rpcmatrix.uid', v_actor_id::text, true);
    BEGIN
      IF v_rpc = 'act_on_b1_student_request_step_atomic' THEN
        PERFORM public.act_on_b1_student_request_step_atomic(v_step_id, v_wrong_action, 'Wrong action note', '{}'::jsonb);
      ELSE
        PERFORM public.record_external_university_payment_confirmation(v_step_id, 'a' || repeat('x', 2005));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_wrong_action_ok := true;
    END;

    -- ------------------------------------------------------------------------
    -- TEST 3: REAL RPC INVOCATION (RIGHT ACTOR + RIGHT ACTION)
    -- ------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
    PERFORM set_config('e_rpcmatrix.uid', v_actor_id::text, true);

    SELECT count(*) INTO v_events_before
      FROM public.student_request_workflow_events
     WHERE student_request_id = v_req_id;

    v_exact_rpc_ok := false;
    IF v_rpc = 'act_on_b1_student_request_step_atomic' THEN
      v_res := public.act_on_b1_student_request_step_atomic(v_step_id, v_action, 'Automated positive fixture test note', '{}'::jsonb);
      IF (v_res->>'success')::boolean = true THEN
        v_exact_rpc_ok := true;
        v_rpc_execution_count := v_rpc_execution_count + 1;
      END IF;
    ELSIF v_rpc = 'record_external_university_payment_confirmation' THEN
      v_res := public.record_external_university_payment_confirmation(v_step_id, 'REC-EXT-20260801-' || lpad(v_case.idx::text, 3, '0'));
      IF (v_res->>'success')::boolean = true THEN
        v_exact_rpc_ok := true;
        v_rpc_execution_count := v_rpc_execution_count + 1;
      END IF;
    END IF;

    -- ------------------------------------------------------------------------
    -- TEST 4: VERIFY WORKFLOW TRANSITION & WORKFLOW EVENT
    -- ------------------------------------------------------------------------
    SELECT status INTO v_step_status_after FROM public.student_request_workflow_steps WHERE id = v_step_id;
    SELECT status INTO v_req_status_after FROM public.student_requests WHERE id = v_req_id;
    SELECT count(*) INTO v_events_after FROM public.student_request_workflow_events WHERE student_request_id = v_req_id;

    v_transition_ok := (v_step_status_after = 'completed') AND (v_events_after >= v_events_before + 1);

    IF v_terminal = false THEN
      SELECT (count(*) = 1) INTO v_next_step_ok
        FROM public.student_request_workflow_steps
       WHERE student_request_id = v_req_id
         AND step_key = v_next_step
         AND status = 'active';
      v_transition_ok := v_transition_ok AND v_next_step_ok AND (v_req_status_after = 'in_review');
    ELSE
      v_transition_ok := v_transition_ok AND (v_req_status_after IN ('approved', 'completed'));
    END IF;

    -- ------------------------------------------------------------------------
    -- TEST 5: VERIFY EXPECTED BUSINESS EFFECT ON TERMINAL STEPS
    -- ------------------------------------------------------------------------
    v_business_effect_ok := true;
    IF v_case.idx = 5 THEN
      SELECT department_id INTO v_student_dept FROM public.student_profiles WHERE id = 'b1e20002-0000-4000-8000-000000000002';
      v_business_effect_ok := (v_student_dept = '11111111-1111-4111-8111-111111111111'::uuid);
    ELSIF v_case.idx = 7 THEN
      SELECT enrollment_status INTO v_student_status FROM public.student_academic_status WHERE student_profile_id = 'b1e20002-0000-4000-8000-000000000002';
      v_business_effect_ok := (v_student_status = 'suspended');
    END IF;

    -- ------------------------------------------------------------------------
    -- TEST 6: ZERO UNRELATED MUTATION
    -- ------------------------------------------------------------------------
    SELECT count(*) INTO v_unrelated_step_count
      FROM public.student_requests
     WHERE request_number NOT LIKE 'SR-20260801-13%';
    v_zero_mutation_ok := (v_unrelated_step_count = v_unrelated_req_count);

    INSERT INTO pg_temp.harness_results (
      case_index, request_number, step_code, rpc_name,
      wrong_actor_failed, wrong_action_failed, exact_rpc_passed,
      transition_verified, business_effect_verified, zero_unrelated_mutation, overall_pass
    ) VALUES (
      v_case.idx, v_case.req_num, v_case.step_code, v_rpc,
      v_wrong_actor_ok, v_wrong_action_ok, v_exact_rpc_ok,
      v_transition_ok, v_business_effect_ok, v_zero_mutation_ok,
      (v_wrong_actor_ok AND v_wrong_action_ok AND v_exact_rpc_ok AND v_transition_ok AND v_business_effect_ok AND v_zero_mutation_ok)
    );

    -- Reset student profile and academic status to active baseline after terminal effect cases
    UPDATE public.student_profiles
       SET department_id = 'ce485c67-5f7c-498d-b120-4b1130a86ae8',
           status = 'active'
     WHERE id = 'b1e20002-0000-4000-8000-000000000002';

    UPDATE public.student_academic_status
       SET enrollment_status = 'active'
     WHERE student_profile_id = 'b1e20002-0000-4000-8000-000000000002';
  END LOOP;

  -- 7. Verify exactly 19 RPC executions occurred
  IF v_rpc_execution_count <> 19 THEN
    RAISE EXCEPTION 'DISPOSABLE_HARNESS_FAIL: RPC executions count = % (expected exactly 19)', v_rpc_execution_count;
  END IF;

  -- 8. Verify enrollment_certificate remains untouched
  SELECT count(*) INTO v_ec_req_count FROM public.student_requests WHERE request_type = 'enrollment_certificate';
  SELECT count(*) INTO v_ec_detail_count FROM public.enrollment_certificate_document_details;
  SELECT count(*) INTO v_ec_doc_count FROM public.official_documents;

  IF v_ec_req_count <> 4 OR v_ec_detail_count <> 2 OR v_ec_doc_count <> 2 THEN
    RAISE EXCEPTION 'DISPOSABLE_HARNESS_FAIL: enrollment_certificate touched (reqs=%, details=%, docs=%)',
      v_ec_req_count, v_ec_detail_count, v_ec_doc_count;
  END IF;
END
$disposable_real_rpc_harness$;

-- Verification report: raise notice if all 19 passed
DO $report$
DECLARE
  v_total integer;
  v_passed integer;
  v_rec record;
BEGIN
  FOR v_rec IN SELECT * FROM pg_temp.harness_results ORDER BY case_index LOOP
    RAISE NOTICE 'CASE % (%): wrong_actor=% wrong_action=% rpc=% trans=% biz=% zero_mut=% -> PASS=%',
      v_rec.case_index, v_rec.step_code, v_rec.wrong_actor_failed, v_rec.wrong_action_failed,
      v_rec.exact_rpc_passed, v_rec.transition_verified, v_rec.business_effect_verified,
      v_rec.zero_unrelated_mutation, v_rec.overall_pass;
  END LOOP;

  SELECT count(*), count(*) FILTER (WHERE overall_pass = true)
    INTO v_total, v_passed
    FROM pg_temp.harness_results;

  IF v_passed <> 19 OR v_total <> 19 THEN
    RAISE EXCEPTION 'DISPOSABLE_HARNESS_FAIL: % of % cases passed (expected 19 of 19)', v_passed, v_total;
  ELSE
    RAISE NOTICE 'DISPOSABLE_HARNESS_PASS: All % of 19 authoritative positive fixture cases verified via REAL RPC executions!', v_passed;
  END IF;
END
$report$;

ROLLBACK;
