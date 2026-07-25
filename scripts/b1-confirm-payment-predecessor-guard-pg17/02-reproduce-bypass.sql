-- Proves the Codex-discovered bypass on the baseline (unguarded) RPC:
-- final_chance / payment_confirmation / incomplete_predecessor => ALLOW (bug).
-- Run after EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01 and BEFORE the guard draft.
-- Ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_actor uuid := '00000000-0000-4000-8000-0000000000a1';
  v_other uuid := '00000000-0000-4000-8000-0000000000a2';
  v_req uuid := '10000000-0000-4000-8000-0000000000b1';
  v_wf uuid := '20000000-0000-4000-8000-0000000000b1';
  v_finance_unit uuid := '00000000-0000-4000-8000-000000000001';
  v_finance_role uuid := '00000000-0000-4000-8000-000000000011';
  v_prior_cfg uuid := '00000000-0000-4000-8000-000000000021';
  v_pay_cfg uuid := '00000000-0000-4000-8000-000000000022';
  v_next_cfg uuid := '00000000-0000-4000-8000-000000000023';
  v_prior_step uuid := '00000000-0000-4000-8000-000000000031';
  v_pay_step uuid := '00000000-0000-4000-8000-000000000032';
  v_next_step uuid := '00000000-0000-4000-8000-000000000033';
  v_tr uuid := '00000000-0000-4000-8000-000000000041';
  v_result jsonb;
BEGIN
  DELETE FROM public.student_request_workflow_events;
  DELETE FROM public.student_request_workflow_steps;
  DELETE FROM public.student_requests;
  DELETE FROM public.request_type_workflow_transitions;
  DELETE FROM public.request_type_workflow_steps;
  DELETE FROM public.request_processing_roles;
  DELETE FROM public.request_processing_units;

  INSERT INTO public.request_processing_units VALUES (v_finance_unit, 'finance');
  INSERT INTO public.request_processing_roles VALUES (v_finance_role, 'revenue_finance_officer');
  INSERT INTO public.request_type_workflow_steps VALUES
    (v_prior_cfg, 'review'), (v_pay_cfg, 'confirm_payment'), (v_next_cfg, 'review');
  INSERT INTO public.request_type_workflow_transitions
    (id, workflow_id, from_step_id, to_step_id, action_result, is_default)
  VALUES (v_tr, v_wf, v_pay_cfg, v_next_cfg, 'payment_confirmed', true);
  INSERT INTO public.student_requests(id, request_type) VALUES (v_req, 'final_chance');
  INSERT INTO public.student_request_workflow_steps (
    id, student_request_id, workflow_id, workflow_step_id, processing_unit_id,
    processing_role_id, step_key, step_order, status, assigned_user_id
  ) VALUES
    (v_prior_step, v_req, v_wf, v_prior_cfg, NULL, NULL, 'prior_review', 10, 'pending', v_other),
    (v_pay_step, v_req, v_wf, v_pay_cfg, v_finance_unit, v_finance_role,
     'payment_confirmation', 20, 'active', v_actor),
    (v_next_step, v_req, v_wf, v_next_cfg, NULL, NULL, 'next_review', 30, 'pending', v_other);

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('test.finance_binding_ok', '1', true);

  BEGIN
    v_result := public.record_external_university_payment_confirmation(v_pay_step, 'bypass-proof');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'BYPASS_NOT_REPRODUCED: expected ALLOW on unguarded RPC, got %', SQLERRM;
  END;

  IF coalesce(v_result->>'success', '') <> 'true'
     OR (SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay_step) <> 'completed'
  THEN
    RAISE EXCEPTION 'BYPASS_NOT_REPRODUCED: unexpected result %', v_result;
  END IF;

  RAISE NOTICE 'BYPASS_REPRODUCED:final_chance:payment_confirmation:incomplete_predecessor:ALLOW';
END $$;

ROLLBACK;
