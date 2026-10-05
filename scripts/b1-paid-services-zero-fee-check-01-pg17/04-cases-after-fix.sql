-- B1-PAID-SERVICES-ZERO-FEE-CHECK-01 — after
-- docs/migration-drafts/B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql.
-- Direct RPC only, throwaway cluster.
\set QUIET on
SET client_min_messages = notice;

DO $$
DECLARE
  v_service text; v_req uuid; v_student uuid; v_apply uuid; v_pay uuid; v_denials integer;
  v_stuck uuid; v_dean_key text; v_active uuid;
BEGIN
  FOREACH v_service IN ARRAY ARRAY['department_transfer','final_chance'] LOOP
    v_dean_key := CASE v_service WHEN 'department_transfer' THEN 'dean_approval' ELSE 'dean_decision' END;
    v_stuck := ('99999999-9999-9999-9999-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'd1' ELSE 'f1' END)::uuid;

    -- definition ---------------------------------------------------------------
    SELECT w.id INTO v_active FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = v_service AND w.status = 'active' AND w.is_active;
    PERFORM public.hp_check((
      SELECT count(*) FILTER (WHERE w.version = 3 AND w.status = 'active' AND w.is_active) = 1
         AND count(*) FILTER (WHERE w.version = 2 AND w.status = 'retired' AND NOT w.is_active
                                AND w.superseded_at IS NOT NULL) = 1
         AND count(*) FILTER (WHERE w.version = 1 AND w.status = 'retired') = 1
         AND count(*) = 3
      FROM public.request_type_workflows w JOIN public.request_types rt ON rt.id = w.request_type_id
      WHERE rt.code = v_service),
      v_service || ': version 3 active; versions 1 and 2 retired; nothing else');
    PERFORM public.hp_check((
      SELECT count(*) = 1 AND bool_and(ts.step_key = 'payment_confirmation' AND t.is_default
                                         AND t.condition_schema = '{}'::jsonb)
      FROM public.request_type_workflow_transitions t
      JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
      JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = v_active AND fs.step_key = v_dean_key),
      v_service || ': the dean step has ONE exit — unconditional, to payment_confirmation');
    PERFORM public.hp_check((
      SELECT count(*) = (SELECT count(*) FROM public.request_type_workflow_steps o
                         JOIN public.request_type_workflows ow ON ow.id = o.workflow_id AND ow.version = 2
                         JOIN public.request_types ort ON ort.id = ow.request_type_id AND ort.code = v_service)
         AND bool_and(EXISTS (
           SELECT 1 FROM public.request_type_workflow_steps o
           JOIN public.request_type_workflows ow ON ow.id = o.workflow_id AND ow.version = 2
           JOIN public.request_types ort ON ort.id = ow.request_type_id AND ort.code = v_service
           WHERE o.step_key = s.step_key AND o.step_order = s.step_order
             AND o.processing_unit_id = s.processing_unit_id AND o.processing_role_id = s.processing_role_id
             AND o.action_type = s.action_type AND o.action_code IS NOT DISTINCT FROM s.action_code
             AND o.assignment_strategy = s.assignment_strategy AND o.can_skip = s.can_skip
             AND o.can_reject = s.can_reject AND o.can_return_to_student = s.can_return_to_student
             AND o.config = s.config))
      FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_active),
      v_service || ': steps, units, roles, action codes and flags are identical to version 2');
    PERFORM public.hp_check((
      SELECT count(*) = (SELECT count(*) FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_active)
      FROM public.b1_workflow_runtime_contract_snapshot c WHERE c.workflow_id = v_active),
      v_service || ': runtime contract pinned for every step of version 3');

    -- requests already pinned to version 2 are NOT touched ----------------------
    PERFORM public.hp_check(
      public.hp_state(v_stuck) = (SELECT state FROM public.hp_stuck_request_state WHERE request_id = v_stuck),
      v_service || ': the request stuck on version 2 is byte-identical after the fix (not repaired, not migrated)');
    PERFORM public.hp_check(
      public.hp_try('11111111-1111-1111-1111-000000000004', 'act', public.hp_step(v_stuck, 'registrar_apply'), 'apply_decision')
        = 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED',
      v_service || ': …and is still refused at registrar_apply (needs an owner decision, see the review note)');

    -- a NEW request, no fee assessment -----------------------------------------
    v_req := ('99999999-9999-9999-9999-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'd3' ELSE 'f3' END)::uuid;
    v_student := ('77777777-7777-7777-7777-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'c5' ELSE 'c6' END)::uuid;
    PERFORM public.hp_new_request(v_req, v_student, v_service, 'SR-TESTONLY-' || v_service || '-AFTER-FIX');
    PERFORM public.hp_check(
      (SELECT bool_and(s.workflow_id = v_active) FROM public.student_request_workflow_steps s WHERE s.student_request_id = v_req),
      v_service || ': a new request is initialized on version 3');
    v_denials := public.hp_walk_to_dean(v_req, v_service);
    v_apply := public.hp_step(v_req, 'registrar_apply');
    v_pay := public.hp_step(v_req, 'payment_confirmation');
    RAISE NOTICE 'observed: % (no fee assessment, after the fix) after the dean step: %', v_service, public.hp_steps(v_req);
    PERFORM public.hp_check(
      (SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay) = 'active'
      AND (SELECT status FROM public.student_request_workflow_steps WHERE id = v_apply) = 'pending',
      v_service || ': payment_confirmation is ACTIVE (not skipped) without any fee assessment');
    v_denials := v_denials + public.hp_deny_sample(v_req, 'payment_confirmation', 'confirm_payment');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000004', 'act', v_apply, 'apply_decision') <> 'OK',
      v_service || ': registrar cannot apply before the payment is confirmed');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000003', 'act', v_pay, 'confirm_payment')
        = 'B1_SPECIALIZED_ACTION_RPC_REQUIRED',
      v_service || ': finance must use the payment RPC, not the generic executor');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, '') = 'OK',
      v_service || ': the revenue officer confirms the external payment');
    v_denials := v_denials + public.hp_deny_sample(v_req, 'registrar_apply', 'apply_decision');
    PERFORM public.hp_check(public.hp_gate('11111111-1111-1111-1111-000000000004', v_apply, 'apply_decision'),
      v_service || ': can_current_user_act_on_step is TRUE for the exact registrar assignee');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000004', 'act', v_apply, 'apply_decision') = 'OK',
      v_service || ': FIXED — the registrar applies the decision');
    PERFORM public.hp_check((SELECT status FROM public.student_requests WHERE id = v_req) = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                      WHERE s.student_request_id = v_req AND s.status <> 'completed')
      AND CASE v_service
            WHEN 'department_transfer' THEN
              (SELECT d.effect_applied_at IS NOT NULL FROM public.transfer_request_details d WHERE d.request_id = v_req)
              AND (SELECT sp.department_id = '22222222-2222-2222-2222-000000000002' FROM public.student_profiles sp WHERE sp.id = v_student)
            ELSE
              (SELECT d.chance_applied_at IS NOT NULL FROM public.extra_chance_details d WHERE d.request_id = v_req)
              AND (SELECT count(*) = 1 FROM public.student_extra_chances x WHERE x.request_id = v_req) END,
      v_service || ': the request completes end to end, every step completed, effect applied once');
    PERFORM public.hp_check(public.hp_try('11111111-1111-1111-1111-000000000004', 'act', v_apply, 'apply_decision') <> 'OK',
      v_service || ': a completed request cannot be replayed');
    RAISE NOTICE 'ok: % after the fix — % sampled denials, all with zero mutation', v_service, v_denials;
  END LOOP;

  PERFORM public.hp_check((SELECT count(*) = 2 FROM public.student_request_fee_assessments),
    'the fix wrote no fee-assessment row (only the two planted by the harness exist)');
END $$;

SELECT 'B1_PAID_SERVICES_ZERO_FEE_SKIP_FIX_01_CASES_PASS' AS result;
