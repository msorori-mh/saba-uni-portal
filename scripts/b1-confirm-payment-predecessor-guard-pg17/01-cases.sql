-- Behavioral PG17 cases for B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.
-- Applied after EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01 baseline + guard draft.
-- Script is transactional: BEGIN … ROLLBACK (zero durable mutation).

BEGIN;

CREATE TEMP TABLE pg_temp.case_results (
  case_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.record_case(p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pg_temp.case_results(case_name, passed, detail)
  VALUES (p_name, p_ok, p_detail)
  ON CONFLICT (case_name) DO UPDATE
    SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_message(p_sql text, p_needle text)
RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM LIKE ('%' || p_needle || '%');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_paid_request(
  p_request_type text,
  p_request_id uuid,
  p_workflow_id uuid,
  p_prior_status text,
  p_prior_completed boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_actor uuid := '00000000-0000-4000-8000-0000000000a1';
  v_other uuid := '00000000-0000-4000-8000-0000000000a2';
  v_finance_unit uuid := '00000000-0000-4000-8000-000000000001';
  v_finance_role uuid := '00000000-0000-4000-8000-000000000011';
  v_prior_cfg uuid := '00000000-0000-4000-8000-000000000021';
  v_pay_cfg uuid := '00000000-0000-4000-8000-000000000022';
  v_next_cfg uuid := '00000000-0000-4000-8000-000000000023';
  v_prior_step uuid := '00000000-0000-4000-8000-000000000031';
  v_pay_step uuid := '00000000-0000-4000-8000-000000000032';
  v_next_step uuid := '00000000-0000-4000-8000-000000000033';
  v_tr uuid := '00000000-0000-4000-8000-000000000041';
BEGIN
  DELETE FROM public.student_request_workflow_events;
  DELETE FROM public.student_request_workflow_steps;
  DELETE FROM public.student_requests;
  DELETE FROM public.request_type_workflow_transitions;
  DELETE FROM public.request_type_workflow_steps;
  DELETE FROM public.request_processing_roles;
  DELETE FROM public.request_processing_units;
  DELETE FROM public.audit_logs;
  DELETE FROM public.notifications;

  INSERT INTO public.request_processing_units VALUES (v_finance_unit, 'finance');
  INSERT INTO public.request_processing_roles VALUES (v_finance_role, 'revenue_finance_officer');
  INSERT INTO public.request_type_workflow_steps VALUES
    (v_prior_cfg, 'review'),
    (v_pay_cfg, 'confirm_payment'),
    (v_next_cfg, 'review');
  INSERT INTO public.request_type_workflow_transitions
    (id, workflow_id, from_step_id, to_step_id, action_result, is_default)
  VALUES (v_tr, p_workflow_id, v_pay_cfg, v_next_cfg, 'payment_confirmed', true);
  INSERT INTO public.student_requests(id, request_type, status)
  VALUES (p_request_id, p_request_type, 'under_review');

  INSERT INTO public.student_request_workflow_steps (
    id, student_request_id, workflow_id, workflow_step_id, processing_unit_id,
    processing_role_id, step_key, step_order, status, assigned_user_id,
    completed_by, completed_at
  ) VALUES (
    v_prior_step, p_request_id, p_workflow_id, v_prior_cfg, NULL, NULL,
    'prior_review', 10, p_prior_status, v_other,
    CASE WHEN p_prior_completed THEN v_other ELSE NULL END,
    CASE WHEN p_prior_completed THEN now() - interval '1 hour' ELSE NULL END
  ), (
    v_pay_step, p_request_id, p_workflow_id, v_pay_cfg, v_finance_unit, v_finance_role,
    'payment_confirmation', 20, 'active', v_actor, NULL, NULL
  ), (
    v_next_step, p_request_id, p_workflow_id, v_next_cfg, NULL, NULL,
    'next_review', 30, 'pending', v_other, NULL, NULL
  );

  RETURN v_pay_step;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.snapshot_state(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'steps', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'step_key', step_key, 'status', status,
        'completed_by', completed_by, 'completed_at', completed_at,
        'decision', decision, 'comment', comment
      ) ORDER BY step_order), '[]'::jsonb)
      FROM public.student_request_workflow_steps
      WHERE student_request_id = p_request_id
    ),
    'request', (
      SELECT jsonb_build_object('status', status, 'updated_at', updated_at)
      FROM public.student_requests WHERE id = p_request_id
    ),
    'events', (SELECT count(*)::int FROM public.student_request_workflow_events
               WHERE student_request_id = p_request_id),
    'audits', (SELECT count(*)::int FROM public.audit_logs),
    'notifications', (SELECT count(*)::int FROM public.notifications)
  );
$$;

DO $$
DECLARE
  v_actor uuid := '00000000-0000-4000-8000-0000000000a1';
  v_other uuid := '00000000-0000-4000-8000-0000000000a2';
  v_service text;
  v_status text;
  v_req uuid;
  v_wf uuid;
  v_pay uuid;
  v_before jsonb;
  v_after jsonb;
  v_case text;
  v_ok boolean;
BEGIN
  FOREACH v_service IN ARRAY ARRAY['final_chance','department_transfer'] LOOP
    FOREACH v_status IN ARRAY ARRAY['pending','active','returned','rejected'] LOOP
      v_req := CASE WHEN v_service = 'final_chance'
        THEN '10000000-0000-4000-8000-0000000000f1'::uuid
        ELSE '10000000-0000-4000-8000-0000000000d1'::uuid END;
      v_wf := CASE WHEN v_service = 'final_chance'
        THEN '20000000-0000-4000-8000-0000000000f1'::uuid
        ELSE '20000000-0000-4000-8000-0000000000d1'::uuid END;
      v_case := format('%s:incomplete_predecessor:%s', v_service, v_status);

      v_pay := pg_temp.seed_paid_request(v_service, v_req, v_wf, v_status, false);
      PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
      PERFORM set_config('test.finance_binding_ok', '1', true);
      v_before := pg_temp.snapshot_state(v_req);

      v_ok := pg_temp.expect_message(
        format(
          'SELECT public.record_external_university_payment_confirmation(%L::uuid, %L)',
          v_pay, 'should-deny'
        ),
        'B1_PREDECESSOR_INCOMPLETE'
      );
      v_after := pg_temp.snapshot_state(v_req);
      IF NOT v_ok OR v_before IS DISTINCT FROM v_after THEN
        PERFORM pg_temp.record_case(
          v_case, false,
          format('ok=%s zero_mutation=%s', v_ok, (v_before IS NOT DISTINCT FROM v_after))
        );
      ELSE
        PERFORM pg_temp.record_case(v_case, true, 'DENY + zero_mutation');
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_service IN ARRAY ARRAY['final_chance','department_transfer'] LOOP
    v_req := CASE WHEN v_service = 'final_chance'
      THEN '10000000-0000-4000-8000-0000000000f2'::uuid
      ELSE '10000000-0000-4000-8000-0000000000d2'::uuid END;
    v_wf := CASE WHEN v_service = 'final_chance'
      THEN '20000000-0000-4000-8000-0000000000f2'::uuid
      ELSE '20000000-0000-4000-8000-0000000000d2'::uuid END;
    v_case := format('%s:all_predecessors_completed:ALLOW', v_service);
    v_pay := pg_temp.seed_paid_request(v_service, v_req, v_wf, 'completed', true);
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    PERFORM set_config('test.finance_binding_ok', '1', true);
    BEGIN
      PERFORM public.record_external_university_payment_confirmation(v_pay, 'ok');
      IF (SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay) = 'completed'
         AND (SELECT status FROM public.student_request_workflow_steps
                WHERE student_request_id = v_req AND step_key = 'next_review') = 'active'
         AND (SELECT count(*) FROM public.student_request_workflow_events
                WHERE student_request_id = v_req AND event_type = 'payment_confirmed') = 1
      THEN
        PERFORM pg_temp.record_case(v_case, true, 'ALLOW');
      ELSE
        PERFORM pg_temp.record_case(v_case, false, 'success shape/runtime drift');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_temp.record_case(v_case, false, SQLERRM);
    END;
  END LOOP;

  FOREACH v_service IN ARRAY ARRAY['final_chance','department_transfer'] LOOP
    v_req := CASE WHEN v_service = 'final_chance'
      THEN '10000000-0000-4000-8000-0000000000f3'::uuid
      ELSE '10000000-0000-4000-8000-0000000000d3'::uuid END;
    v_wf := CASE WHEN v_service = 'final_chance'
      THEN '20000000-0000-4000-8000-0000000000f3'::uuid
      ELSE '20000000-0000-4000-8000-0000000000d3'::uuid END;
    v_case := format('%s:skipped_predecessor:ALLOW', v_service);
    v_pay := pg_temp.seed_paid_request(v_service, v_req, v_wf, 'skipped', false);
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    PERFORM set_config('test.finance_binding_ok', '1', true);
    BEGIN
      PERFORM public.record_external_university_payment_confirmation(v_pay, NULL);
      IF (SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay) = 'completed'
      THEN
        PERFORM pg_temp.record_case(v_case, true, 'ALLOW');
      ELSE
        PERFORM pg_temp.record_case(v_case, false, 'payment step not completed');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_temp.record_case(v_case, false, SQLERRM);
    END;
  END LOOP;

  -- Error-order: non-assignee must not receive predecessor exception.
  v_req := '10000000-0000-4000-8000-0000000000e1'::uuid;
  v_wf := '20000000-0000-4000-8000-0000000000e1'::uuid;
  v_pay := pg_temp.seed_paid_request('final_chance', v_req, v_wf, 'pending', false);
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  PERFORM set_config('test.finance_binding_ok', '1', true);
  v_before := pg_temp.snapshot_state(v_req);
  v_ok := pg_temp.expect_message(
    format('SELECT public.record_external_university_payment_confirmation(%L::uuid, NULL)', v_pay),
    'DIRECT_PAYMENT_ASSIGNEE_REQUIRED'
  );
  v_after := pg_temp.snapshot_state(v_req);
  PERFORM pg_temp.record_case(
    'final_chance:unauthorized_actor:assignee_denial_first',
    v_ok AND (v_before IS NOT DISTINCT FROM v_after),
    format('ok=%s zero_mutation=%s', v_ok, (v_before IS NOT DISTINCT FROM v_after))
  );

  -- Wrong finance binding keeps binding denial.
  v_pay := pg_temp.seed_paid_request('department_transfer', v_req, v_wf, 'pending', false);
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('test.finance_binding_ok', '0', true);
  v_before := pg_temp.snapshot_state(v_req);
  v_ok := pg_temp.expect_message(
    format('SELECT public.record_external_university_payment_confirmation(%L::uuid, NULL)', v_pay),
    'EXACT_FINANCE_PROCESSING_BINDING_REQUIRED'
  );
  v_after := pg_temp.snapshot_state(v_req);
  PERFORM pg_temp.record_case(
    'department_transfer:wrong_binding:binding_denial_first',
    v_ok AND (v_before IS NOT DISTINCT FROM v_after),
    format('ok=%s zero_mutation=%s', v_ok, (v_before IS NOT DISTINCT FROM v_after))
  );
  PERFORM set_config('test.finance_binding_ok', '1', true);

  -- Replay remains DENY with zero further mutation.
  v_req := '10000000-0000-4000-8000-000000000051'::uuid;
  v_wf := '20000000-0000-4000-8000-000000000051'::uuid;
  v_pay := pg_temp.seed_paid_request('final_chance', v_req, v_wf, 'completed', true);
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM public.record_external_university_payment_confirmation(v_pay, 'first');
  v_before := pg_temp.snapshot_state(v_req);
  v_ok := pg_temp.expect_message(
    format('SELECT public.record_external_university_payment_confirmation(%L::uuid, %L)', v_pay, 'replay'),
    'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP'
  );
  v_after := pg_temp.snapshot_state(v_req);
  PERFORM pg_temp.record_case(
    'final_chance:replay:DENY_zero_mutation',
    v_ok AND (v_before IS NOT DISTINCT FROM v_after),
    format('ok=%s zero_mutation=%s', v_ok, (v_before IS NOT DISTINCT FROM v_after))
  );
END $$;

DO $$
DECLARE
  v_failed integer;
  v_total integer;
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*)
  INTO v_failed, v_total
  FROM pg_temp.case_results;

  RAISE NOTICE 'confirm_payment_pred_guard_summary: {"total": %, "failed": %, "passed": %}',
    v_total, v_failed, (v_total - v_failed);

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_CASES_FAILED: %',
      (SELECT string_agg(case_name || '=' || coalesce(detail,''), ', ')
         FROM pg_temp.case_results WHERE NOT passed);
  END IF;
END $$;

ROLLBACK;
