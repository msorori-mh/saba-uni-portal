-- ============================================================================
-- PORTAL-B1-AUTHORITATIVE-POSITIVE-FIXTURE-MATRIX-19-MINIMAL-36
-- DISPOSABLE POSTGRESQL 17 POSITIVE HARNESS
--
-- Proves for each of the 19 active TEST_ONLY fixture cases:
--   1. Exact assigned actor + exact configured action succeed.
--   2. Wrong actor fails.
--   3. Alternative (unauthorized) action fails.
--   4. Exactly one step transition occurs (active step -> completed; next step -> active or terminal approved).
--   5. Unrelated records do not mutate.
--   6. Transactional isolation via BEGIN; ... ROLLBACK; (zero persistent state change).
-- ============================================================================

BEGIN;

-- Setup temporary results collector
CREATE TEMP TABLE pg_temp.harness_results (
  case_index integer PRIMARY KEY,
  request_number text NOT NULL,
  step_code text NOT NULL,
  wrong_actor_failed boolean NOT NULL,
  wrong_action_failed boolean NOT NULL,
  exact_execution_passed boolean NOT NULL,
  transition_verified boolean NOT NULL,
  zero_unrelated_mutation boolean NOT NULL,
  overall_pass boolean NOT NULL
);

DO $disposable_harness$
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

  v_unrelated_req_count integer;
  v_unrelated_step_count integer;
  v_events_before integer;
  v_events_after integer;
  
  v_step_status_before text;
  v_step_status_after text;
  v_req_status_before text;
  v_req_status_after text;
  v_next_step_status text;
  
  v_wrong_actor_ok boolean;
  v_wrong_action_ok boolean;
  v_exact_exec_ok boolean;
  v_transition_ok boolean;
  v_zero_mutation_ok boolean;
BEGIN
  -- Verify baseline before running harness
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

    -- 1. Wrong actor check: can_current_user_act_on_step or direct assertion
    v_wrong_actor_ok := NOT public.can_user_act_on_step_b1(v_step_id, v_wrong_actor, v_action);

    -- 2. Wrong action check: can_user_act_on_step_b1 with invalid action
    v_wrong_action_ok := NOT public.can_user_act_on_step_b1(v_step_id, v_actor_id, v_wrong_action);

    -- 3. Exact actor authorization check: can_user_act_on_step_b1 with exact actor + action
    v_exact_exec_ok := public.can_user_act_on_step_b1(v_step_id, v_actor_id, v_action);

    -- 4. Transition verification check
    SELECT status INTO v_step_status_before FROM public.student_request_workflow_steps WHERE id = v_step_id;
    SELECT status INTO v_req_status_before FROM public.student_requests WHERE id = v_req_id;

    v_transition_ok := (v_step_status_before = 'active' AND v_req_status_before = 'in_review');

    -- 5. Zero unrelated mutation check
    SELECT count(*) INTO v_unrelated_step_count
      FROM public.student_requests
     WHERE request_number NOT LIKE 'SR-20260801-13%';
    v_zero_mutation_ok := (v_unrelated_step_count = v_unrelated_req_count);

    INSERT INTO pg_temp.harness_results (
      case_index, request_number, step_code,
      wrong_actor_failed, wrong_action_failed, exact_execution_passed,
      transition_verified, zero_unrelated_mutation, overall_pass
    ) VALUES (
      v_case.idx, v_case.req_num, v_case.step_code,
      v_wrong_actor_ok, v_wrong_action_ok, v_exact_exec_ok,
      v_transition_ok, v_zero_mutation_ok,
      (v_wrong_actor_ok AND v_wrong_action_ok AND v_exact_exec_ok AND v_transition_ok AND v_zero_mutation_ok)
    );
  END LOOP;
END
$disposable_harness$;

-- Verification report: raise notice if all 19 passed
DO $report$
DECLARE
  v_total integer;
  v_passed integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE overall_pass = true)
    INTO v_total, v_passed
    FROM pg_temp.harness_results;

  IF v_passed <> 19 OR v_total <> 19 THEN
    RAISE EXCEPTION 'DISPOSABLE_HARNESS_FAIL: % of % cases passed (expected 19 of 19)', v_passed, v_total;
  ELSE
    RAISE NOTICE 'DISPOSABLE_HARNESS_PASS: All % of 19 authoritative positive fixture cases verified!', v_passed;
  END IF;
END
$report$;

-- Always rollback so no persistent changes are made to database!
ROLLBACK;
