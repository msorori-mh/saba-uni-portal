-- B1-PAID-SERVICES-ZERO-FEE-CHECK-01 — the two paid services exactly as the
-- applied chain publishes them (version 2). Direct RPC only, throwaway cluster.
--
-- Request ids:  …d1 / …f1  no fee assessment (the only state production can reach)
--               …d2 / …f2  fee assessment > 0 planted by the harness superuser
\set QUIET on
SET client_min_messages = notice;

DO $$
DECLARE
  v_service text; v_req uuid; v_student uuid; v_apply uuid; v_pay uuid; v_denials integer; v_result text;
  v_before text; v_dean_key text;
BEGIN
  FOREACH v_service IN ARRAY ARRAY['department_transfer','final_chance'] LOOP
    v_dean_key := CASE v_service WHEN 'department_transfer' THEN 'dean_approval' ELSE 'dean_decision' END;

    -- definition as deployed ---------------------------------------------------
    PERFORM public.hp_check((
      SELECT w.version = 2 AND w.code = v_service || '_external_payment_workflow'
      FROM public.request_type_workflows w JOIN public.request_types rt ON rt.id = w.request_type_id
      WHERE rt.code = v_service AND w.status = 'active' AND w.is_active), v_service || ': active workflow is version 2');
    PERFORM public.hp_check((
      SELECT count(*) FILTER (WHERE ts.step_key = 'payment_confirmation' AND NOT t.is_default
                                AND t.condition_schema ->> 'code' = 'FEE_GREATER_THAN_ZERO') = 1
         AND count(*) FILTER (WHERE ts.step_key = 'registrar_apply' AND t.is_default
                                AND t.condition_schema = '{}'::jsonb) = 1
      FROM public.request_type_workflow_transitions t
      JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
      JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      JOIN public.request_type_workflows w ON w.id = t.workflow_id AND w.is_active
      JOIN public.request_types rt ON rt.id = w.request_type_id AND rt.code = v_service
      WHERE fs.step_key = v_dean_key),
      v_service || ': dean step has the fee branch (paid = conditional, no-fee = DEFAULT)');
    PERFORM public.hp_check((
      SELECT bool_and(NOT s.can_skip) AND count(*) FILTER (WHERE s.action_type = 'assess_fee') = 0
      FROM public.request_type_workflow_steps s
      JOIN public.request_type_workflows w ON w.id = s.workflow_id AND w.is_active
      JOIN public.request_types rt ON rt.id = w.request_type_id AND rt.code = v_service),
      v_service || ': no step is skippable and there is NO fee-assessment step');

    -- A. no fee assessment — what every real request looks like ----------------
    v_req := ('99999999-9999-9999-9999-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'd1' ELSE 'f1' END)::uuid;
    v_student := ('77777777-7777-7777-7777-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'c1' ELSE 'c2' END)::uuid;
    PERFORM public.hp_new_request(v_req, v_student, v_service, 'SR-TESTONLY-' || v_service || '-NOFEE');
    v_denials := public.hp_walk_to_dean(v_req, v_service);
    v_apply := public.hp_step(v_req, 'registrar_apply');
    v_pay := public.hp_step(v_req, 'payment_confirmation');
    RAISE NOTICE 'observed: % (no fee assessment) after the dean step: %', v_service, public.hp_steps(v_req);
    PERFORM public.hp_check(
      (SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay) = 'skipped'
      AND (SELECT status FROM public.student_request_workflow_steps WHERE id = v_apply) = 'active',
      v_service || ': payment_confirmation is SKIPPED and registrar_apply is active');

    v_before := public.hp_state(v_req);
    v_result := public.hp_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, '');
    RAISE NOTICE 'observed: % finance confirms the skipped payment -> %', v_service, v_result;
    PERFORM public.hp_check(v_result = 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP',
      v_service || ': finance cannot confirm the skipped payment');
    PERFORM public.hp_check(NOT public.hp_gate('11111111-1111-1111-1111-000000000004', v_apply, 'apply_decision'),
      v_service || ': can_current_user_act_on_step is FALSE for the exact registrar assignee');
    v_result := public.hp_try('11111111-1111-1111-1111-000000000004', 'act', v_apply, 'apply_decision');
    RAISE NOTICE 'observed: % exact registrar assignee applies the decision -> %', v_service, v_result;
    PERFORM public.hp_check(v_result = 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED',
      v_service || ': DEFECT — the exact registrar assignee is refused at registrar_apply');
    PERFORM public.hp_check(
      (SELECT (metadata ->> 'direct_assignment_id') IS NOT NULL AND assigned_staff_profile_id = '33333333-3333-3333-3333-000000000004'
       FROM public.student_request_workflow_steps WHERE id = v_apply),
      v_service || ': …although the step IS assigned to that registrar (not an assignment problem)');
    PERFORM public.hp_check(public.hp_state(v_req) = v_before
      AND (SELECT status FROM public.student_requests WHERE id = v_req) = 'in_review',
      v_service || ': the request is stuck in_review — nobody can move it (zero mutation)');
    v_denials := v_denials + public.hp_deny_sample(v_req, 'registrar_apply', 'apply_decision');
    RAISE NOTICE 'ok: % no-fee request — % sampled denials, all with zero mutation', v_service, v_denials;

    -- B. a fee assessment > 0 exists (cannot be created through any RPC for
    --    these workflows; planted here only to exercise the paid branch) -------
    v_req := ('99999999-9999-9999-9999-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'd2' ELSE 'f2' END)::uuid;
    v_student := ('77777777-7777-7777-7777-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'c3' ELSE 'c4' END)::uuid;
    PERFORM public.hp_new_request(v_req, v_student, v_service, 'SR-TESTONLY-' || v_service || '-FEE');
    INSERT INTO public.student_request_fee_assessments (request_id, amount, assessed_at, payment_status)
    VALUES (v_req, 1, now(), 'pending');
    v_denials := public.hp_walk_to_dean(v_req, v_service);
    v_apply := public.hp_step(v_req, 'registrar_apply');
    v_pay := public.hp_step(v_req, 'payment_confirmation');
    RAISE NOTICE 'observed: % (fee assessment > 0) after the dean step: %', v_service, public.hp_steps(v_req);
    PERFORM public.hp_check((SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay) = 'active',
      v_service || ': with a fee assessment the payment step is activated');
    v_denials := v_denials + public.hp_deny_sample(v_req, 'payment_confirmation', 'confirm_payment');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000004', 'act', v_apply, 'apply_decision') <> 'OK',
      v_service || ': registrar cannot apply before the payment is confirmed');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000003', 'act', v_pay, 'confirm_payment')
        = 'B1_SPECIALIZED_ACTION_RPC_REQUIRED',
      v_service || ': finance must use the payment RPC, not the generic executor');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000004', 'pay', v_pay, '') <> 'OK',
      v_service || ': registrar cannot confirm the payment');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, '') = 'OK',
      v_service || ': the revenue officer confirms the external payment');
    v_denials := v_denials + public.hp_deny_sample(v_req, 'registrar_apply', 'apply_decision');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000004', 'act', v_apply, 'apply_decision') = 'OK',
      v_service || ': the registrar applies the decision');
    PERFORM public.hp_check((SELECT status FROM public.student_requests WHERE id = v_req) = 'completed'
      AND CASE v_service
            WHEN 'department_transfer' THEN
              (SELECT d.effect_applied_at IS NOT NULL FROM public.transfer_request_details d WHERE d.request_id = v_req)
              AND (SELECT sp.department_id = '22222222-2222-2222-2222-000000000002' FROM public.student_profiles sp WHERE sp.id = v_student)
            ELSE
              (SELECT d.chance_applied_at IS NOT NULL FROM public.extra_chance_details d WHERE d.request_id = v_req)
              AND (SELECT count(*) = 1 FROM public.student_extra_chances x WHERE x.request_id = v_req) END,
      v_service || ': paid branch completes end to end and the academic effect is applied once');
    RAISE NOTICE 'ok: % paid-branch request — % sampled denials, all with zero mutation', v_service, v_denials;
  END LOOP;
END $$;

-- Snapshot of the two stuck requests, used after the fix draft to prove that
-- it does not touch requests already pinned to version 2.
CREATE TABLE IF NOT EXISTS public.hp_stuck_request_state AS
SELECT r.id AS request_id, public.hp_state(r.id) AS state
FROM public.student_requests r
WHERE r.id IN ('99999999-9999-9999-9999-0000000000d1','99999999-9999-9999-9999-0000000000f1');

SELECT 'B1_PAID_SERVICES_ZERO_FEE_CHECK_01_V2_CASES_DONE' AS result;
