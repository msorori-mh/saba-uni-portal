-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — after the draft.
-- Direct RPC only (can_current_user_act_on_step, the atomic executor, the
-- external payment RPC, record_b1_fee_decision, get_b1_fee_decision), on a
-- throwaway cluster. Both services × both fee branches, with a deny matrix
-- that must leave every request byte-identical.
\set QUIET on
SET client_min_messages = notice;

-- Full matrix for the ACTIVE registrar fee-decision step, then the decision.
CREATE OR REPLACE FUNCTION public.hp_fee_step_matrix(p_request uuid, p_success text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  c_registrar constant uuid := '11111111-1111-1111-1111-000000000004';
  v_step uuid := public.hp_step(p_request, 'registrar_fee_decision');
  v_before text := public.hp_state(p_request);
  v_owner uuid;
  v_uid uuid;
  v_try text;
  v_res text;
  v_other record;
  v_n integer := 0;
BEGIN
  SELECT sp.user_id INTO v_owner FROM public.student_requests r
  JOIN public.student_profiles sp ON sp.id = r.student_profile_id WHERE r.id = p_request;
  PERFORM public.hp_check((SELECT status = 'active' FROM public.student_request_workflow_steps WHERE id = v_step)
    AND public.b1_fee_decision_step(v_step) IS NOT NULL, 'registrar_fee_decision is the active fee-decision step');

  -- every principal that is not the step's direct assignee: anonymous, the owning
  -- student, another student, an unassigned admin, and the assignee of every other step
  FOREACH v_uid IN ARRAY ARRAY[NULL::uuid, v_owner,
    '11111111-1111-1111-1111-0000000000c8', '11111111-1111-1111-1111-000000000014',
    '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000002',
    '11111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-000000000005',
    '11111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-000000000007',
    '11111111-1111-1111-1111-000000000009', '11111111-1111-1111-1111-000000000011',
    '11111111-1111-1111-1111-000000000015']
  LOOP
    FOREACH v_try IN ARRAY ARRAY['FEE_REQUIRED::5000', 'FEE_NOT_REQUIRED:FREE_SERVICE', 'FEE_NOT_REQUIRED:EXEMPTION'] LOOP
      v_res := public.hp_try(v_uid, 'fee', v_step, v_try);
      IF v_res = 'OK' THEN RAISE EXCEPTION 'CASE_FAIL: % recorded a fee decision', COALESCE(v_uid::text, 'anonymous'); END IF;
      IF v_res NOT LIKE '%B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED%' AND v_res NOT LIKE '%AUTHENTICATION_REQUIRED%' THEN
        RAISE EXCEPTION 'CASE_FAIL: unexpected refusal for %: %', COALESCE(v_uid::text, 'anonymous'), v_res;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    FOREACH v_try IN ARRAY ARRAY['review', 'approve', 'apply_decision', 'confirm_payment', 'reject', 'return', 'archive'] LOOP
      IF public.hp_try(v_uid, 'act', v_step, v_try) = 'OK' THEN
        RAISE EXCEPTION 'CASE_FAIL: % ran % on the fee step', COALESCE(v_uid::text, 'anonymous'), v_try;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    IF public.hp_try(v_uid, 'pay', v_step, '') = 'OK' OR public.hp_gate(v_uid, v_step, 'review') THEN
      RAISE EXCEPTION 'CASE_FAIL: % passed the gate on the fee step', COALESCE(v_uid::text, 'anonymous');
    END IF;
    v_n := v_n + 2;
  END LOOP;
  RAISE NOTICE 'ok: 13 other principals are refused the fee decision, the executor, the payment RPC and the gate';

  -- the exact assignee: cannot finish the step without a decision, cannot use any other action or RPC
  v_res := public.hp_try(c_registrar, 'act', v_step, 'review');
  PERFORM public.hp_check(v_res LIKE '%B1_FEE_DECISION_REQUIRED%',
    'the registrar cannot complete the step without a recorded decision (' || v_res || ')');
  FOREACH v_try IN ARRAY ARRAY['approve', 'apply_decision', 'confirm_payment', 'reject', 'return', 'archive', 'clear'] LOOP
    IF public.hp_try(c_registrar, 'act', v_step, v_try) = 'OK' THEN
      RAISE EXCEPTION 'CASE_FAIL: the registrar ran % on the fee step', v_try;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM public.hp_check(public.hp_try(c_registrar, 'act', v_step, 'reject') LIKE '%B1_ACTION_TYPE_MISMATCH%'
    AND public.hp_try(c_registrar, 'act', v_step, 'return') LIKE '%B1_ACTION_TYPE_MISMATCH%'
    AND public.hp_try(c_registrar, 'pay', v_step, '') <> 'OK',
    'reject / return stay unavailable on this service (as before); the payment RPC is refused');

  -- invalid input never leaves a row behind
  FOREACH v_try IN ARRAY ARRAY['', 'PAID', 'fee_required', 'FEE_REQUIRED:EXEMPTION:5000',
    'FEE_NOT_REQUIRED', 'FEE_NOT_REQUIRED:OTHER', 'FEE_NOT_REQUIRED:exemption'] LOOP
    v_res := public.hp_try(c_registrar, 'fee', v_step, v_try);
    IF v_res NOT LIKE '%B1_FEE_DECISION_INPUT_INVALID%' THEN
      RAISE EXCEPTION 'CASE_FAIL: invalid input "%" not refused: %', v_try, v_res;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  FOREACH v_try IN ARRAY ARRAY['FEE_REQUIRED', 'FEE_REQUIRED::0', 'FEE_REQUIRED::0.00', 'FEE_REQUIRED::-1',
    'FEE_REQUIRED::10000000', 'FEE_REQUIRED::9999999.991', 'FEE_REQUIRED::12.345', 'FEE_REQUIRED::NaN',
    'FEE_REQUIRED::Infinity', 'FEE_NOT_REQUIRED:EXEMPTION:5000', 'FEE_NOT_REQUIRED:FREE_SERVICE:0.01'] LOOP
    v_res := public.hp_try(c_registrar, 'fee', v_step, v_try);
    IF v_res NOT LIKE '%B1_FEE_DECISION_INPUT_INVALID:amount_due%' THEN
      RAISE EXCEPTION 'CASE_FAIL: amount input "%" not refused as amount_due: %', v_try, v_res;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'ok: amount missing / zero / negative / over bound / 3 decimals / NaN / given with no-fee are refused';

  -- the decision RPC works on the fee step only
  FOR v_other IN SELECT s.id, s.step_key FROM public.student_request_workflow_steps s
                 WHERE s.student_request_id = p_request AND s.id <> v_step LOOP
    IF public.hp_try(c_registrar, 'fee', v_other.id, 'FEE_NOT_REQUIRED:EXEMPTION') NOT LIKE '%B1_ACTIVE_STEP_REQUIRED%' THEN
      RAISE EXCEPTION 'CASE_FAIL: fee decision accepted on step %', v_other.step_key;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  PERFORM public.hp_check(public.hp_state(p_request) = v_before,
    'all ' || v_n || ' refusals left the request, its decision and its notifications byte-identical');

  v_res := public.hp_try(c_registrar, 'fee', v_step, p_success);
  PERFORM public.hp_check(v_res = 'OK', 'the registrar (single direct assignee) records ' || p_success || ': ' || v_res);
  PERFORM public.hp_check(public.hp_try(c_registrar, 'fee', v_step, 'FEE_NOT_REQUIRED:EXEMPTION') <> 'OK'
    AND public.hp_try(c_registrar, 'fee', v_step, 'FEE_REQUIRED::1') <> 'OK'
    AND public.hp_try(c_registrar, 'act', v_step, 'review') <> 'OK',
    'the decision cannot be recorded or the step completed a second time');
  RETURN v_n;
END $$;

DO $$
DECLARE
  c_registrar constant uuid := '11111111-1111-1111-1111-000000000004';
  c_finance constant uuid := '11111111-1111-1111-1111-000000000003';
  v_service text; v_label text; v_branch text; v_req uuid; v_student uuid; v_owner uuid;
  v_fee uuid; v_pay uuid; v_apply uuid; v_active uuid; v_n public.notifications%ROWTYPE;
  v_before text; v_err text; v_res text; v_reason text; v_stuck uuid; v_total integer;
BEGIN
  FOREACH v_service IN ARRAY ARRAY['department_transfer', 'final_chance'] LOOP
    v_label := CASE v_service WHEN 'department_transfer' THEN 'التحويل بين الأقسام' ELSE 'الفرصة الأخيرة' END;
    SELECT w.id INTO v_active FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = v_service AND w.status = 'active' AND w.is_active;

    -- requests already pinned to version 2 are not touched ----------------------
    v_stuck := ('99999999-9999-9999-9999-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'd1' ELSE 'f1' END)::uuid;
    PERFORM public.hp_check(
      public.hp_state(v_stuck) = (SELECT state FROM public.hp_stuck_request_state WHERE request_id = v_stuck)
      AND (SELECT bool_and(s.workflow_id <> v_active) FROM public.student_request_workflow_steps s
           WHERE s.student_request_id = v_stuck),
      v_service || ': the in-flight version-2 request is byte-identical and still on version 2');
    PERFORM public.hp_check(
      public.hp_try(c_registrar, 'fee', public.hp_step(v_stuck, 'registrar_apply'), 'FEE_NOT_REQUIRED:EXEMPTION')
        LIKE '%B1_ACTIVE_STEP_REQUIRED%'
      AND public.hp_try(c_registrar, 'act', public.hp_step(v_stuck, 'registrar_apply'), 'apply_decision')
        = 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED'
      AND public.hp_state(v_stuck) = (SELECT state FROM public.hp_stuck_request_state WHERE request_id = v_stuck),
      v_service || ': …it gets no fee decision and stays exactly as stuck as before (not repaired, not migrated)');

    FOREACH v_branch IN ARRAY ARRAY['FEE_REQUIRED', 'FEE_NOT_REQUIRED'] LOOP
      v_reason := CASE v_service WHEN 'department_transfer' THEN 'EXEMPTION' ELSE 'FREE_SERVICE' END;
      v_req := ('99999999-9999-9999-9999-0000000000' || CASE v_service WHEN 'department_transfer' THEN 'd' ELSE 'f' END
                || CASE v_branch WHEN 'FEE_REQUIRED' THEN '3' ELSE '4' END)::uuid;
      v_student := ('77777777-7777-7777-7777-0000000000' || CASE
        WHEN v_service = 'department_transfer' AND v_branch = 'FEE_REQUIRED' THEN 'c5'
        WHEN v_service = 'department_transfer' THEN 'c7'
        WHEN v_branch = 'FEE_REQUIRED' THEN 'c6' ELSE 'c8' END)::uuid;
      SELECT sp.user_id INTO v_owner FROM public.student_profiles sp WHERE sp.id = v_student;
      RAISE NOTICE '=== % / % ===', v_service, v_branch;

      PERFORM public.hp_new_request(v_req, v_student, v_service, 'SR-TESTONLY-' || v_service || '-' || v_branch);
      PERFORM public.hp_check(
        (SELECT bool_and(s.workflow_id = v_active) AND count(*) = CASE v_service WHEN 'department_transfer' THEN 7 ELSE 6 END
           AND count(*) FILTER (WHERE num_nonnulls(s.assigned_user_id, s.assigned_staff_profile_id,
                 s.assigned_faculty_profile_id, s.assigned_position_assignment_id) = 1) = count(*)
         FROM public.student_request_workflow_steps s WHERE s.student_request_id = v_req),
        'a new request is initialized on the new version, every step with exactly one direct assignee');
      v_total := public.hp_walk_to_dean(v_req, v_service);
      v_fee := public.hp_step(v_req, 'registrar_fee_decision');
      v_pay := public.hp_step(v_req, 'payment_confirmation');
      v_apply := public.hp_step(v_req, 'registrar_apply');
      PERFORM public.hp_check(
        (SELECT assigned_staff_profile_id = '33333333-3333-3333-3333-000000000004'
         FROM public.student_request_workflow_steps WHERE id = v_fee)
        AND (SELECT count(*) = 0 FROM public.notifications n WHERE n.reference_id = v_req),
        'after the dean the request waits on the registrar fee decision; no notification yet');

      v_total := v_total + public.hp_fee_step_matrix(v_req,
        CASE v_branch WHEN 'FEE_REQUIRED' THEN 'FEE_REQUIRED::12500.50' ELSE 'FEE_NOT_REQUIRED:' || v_reason END);

      -- one notification, only to the request's student ---------------------------
      PERFORM public.hp_check((SELECT count(*) = 1 FROM public.notifications n WHERE n.reference_id = v_req)
        AND (SELECT count(*) = 0 FROM public.notifications n WHERE n.reference_id = v_req AND n.user_id <> v_owner),
        'exactly one notification, addressed to the request''s student only');
      SELECT * INTO v_n FROM public.notifications n WHERE n.reference_id = v_req;
      PERFORM public.hp_check((SELECT count(*) = 1 FROM public.student_request_workflow_events e
          WHERE e.student_request_id = v_req AND e.event_type = 'fee_decision_recorded'
            AND e.actor_user_id = c_registrar AND e.visible_to_student AND e.payload ->> 'decision' = v_branch),
        'the decision is in the audit trail with its actor');

      IF v_branch = 'FEE_REQUIRED' THEN
        PERFORM public.hp_check(
          (SELECT d.decision = 'FEE_REQUIRED' AND d.amount_due = 12500.50 AND d.exemption_reason IS NULL
             AND d.decided_by = c_registrar AND d.service_code = v_service AND d.runtime_step_id = v_fee
           FROM public.b1_request_fee_decisions d WHERE d.request_id = v_req)
          AND (SELECT status FROM public.student_request_workflow_steps WHERE id = v_pay) = 'active'
          AND (SELECT status FROM public.student_request_workflow_steps WHERE id = v_apply) = 'pending',
          'FEE_REQUIRED stored with its amount; payment_confirmation active, registrar_apply pending');
        PERFORM public.hp_check(
          (length(v_n.message) - length(replace(v_n.message, '12500.50', ''))) / length('12500.50') = 1
          AND (length(v_n.message) - length(replace(v_n.message, 'ريال', ''))) / length('ريال') = 1
          AND v_n.message LIKE '%المبلغ المستحق: 12500.50 ريال.%' AND v_n.message LIKE '%النظام الجامعي الرئيسي%'
          AND v_n.message LIKE '%لا يتم أي سداد داخل البوابة%' AND v_n.message LIKE '%' || v_label || '%'
          AND v_n.title NOT LIKE '%12500%',
          'the notification states the amount exactly once with «ريال» and where to pay');
        PERFORM set_config('harness.uid', v_owner::text, false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) ->> 'amountDue' = '12500.50'
          AND jsonb_typeof(public.get_b1_fee_decision(v_req) -> 'amountDue') = 'string'
          AND NOT (public.get_b1_fee_decision(v_req) ? 'decidedBy'),
          'the owning student reads the decision and the amount as display text (no staff identity)');

        -- immutable
        PERFORM set_config('harness.uid', c_registrar::text, false);
        BEGIN UPDATE public.b1_request_fee_decisions SET amount_due = 1 WHERE request_id = v_req; v_err := 'NO_ERROR';
        EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
        PERFORM public.hp_check(v_err LIKE '%B1_FEE_DECISION_IS_IMMUTABLE%', 'the amount cannot be updated');
        BEGIN UPDATE public.b1_request_fee_decisions SET decision = 'FEE_NOT_REQUIRED', exemption_reason = 'EXEMPTION',
                amount_due = NULL WHERE request_id = v_req; v_err := 'NO_ERROR';
        EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
        PERFORM public.hp_check(v_err LIKE '%B1_FEE_DECISION_IS_IMMUTABLE%', 'the decision cannot be updated');
        BEGIN DELETE FROM public.b1_request_fee_decisions WHERE request_id = v_req; v_err := 'NO_ERROR';
        EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
        PERFORM public.hp_check(v_err LIKE '%B1_FEE_DECISION_IS_IMMUTABLE%', 'the decision cannot be deleted');
        BEGIN INSERT INTO public.b1_request_fee_decisions (request_id, runtime_step_id, service_code, decision, amount_due, decided_by)
              VALUES (v_stuck, public.hp_step(v_stuck, 'registrar_apply'), v_service, 'FEE_REQUIRED', 5, c_registrar);
              v_err := 'NO_ERROR';
        EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
        PERFORM public.hp_check(v_err LIKE '%B1_FEE_DECISION_RPC_REQUIRED%', 'a decision cannot be inserted outside the RPC');

        -- payment: finance only, through the payment RPC only
        v_total := v_total + public.hp_deny_sample(v_req, 'payment_confirmation', 'confirm_payment');
        PERFORM public.hp_check(public.hp_try(c_registrar, 'act', v_apply, 'apply_decision') <> 'OK'
          AND public.hp_try(c_registrar, 'pay', v_pay, '') <> 'OK'
          AND public.hp_try(c_finance, 'act', v_pay, 'confirm_payment') = 'B1_SPECIALIZED_ACTION_RPC_REQUIRED',
          'registrar cannot apply or confirm before payment; finance must use the payment RPC');
        PERFORM public.hp_check(public.hp_try(c_finance, 'pay', v_pay, '') = 'OK',
          'the revenue officer confirms the external payment');
      ELSE
        PERFORM public.hp_check(
          (SELECT d.decision = 'FEE_NOT_REQUIRED' AND d.amount_due IS NULL AND d.exemption_reason = v_reason
           FROM public.b1_request_fee_decisions d WHERE d.request_id = v_req)
          AND (SELECT status = 'skipped' AND completed_by IS NULL FROM public.student_request_workflow_steps WHERE id = v_pay)
          AND (SELECT status FROM public.student_request_workflow_steps WHERE id = v_apply) = 'active',
          'FEE_NOT_REQUIRED (' || v_reason || ') stored without an amount; payment_confirmation SKIPPED, registrar_apply active');
        PERFORM public.hp_check(v_n.message LIKE '%لا يستلزم سداد رسوم%' AND v_n.message LIKE '%' || v_label || '%'
          AND v_n.message LIKE '%' || CASE v_reason WHEN 'EXEMPTION' THEN 'إعفاء' ELSE 'خدمة مجانية' END || '%'
          AND v_n.message NOT LIKE '%ريال%' AND v_n.message NOT LIKE '%المبلغ%',
          'the notification says no payment is needed and why, and carries no amount');
        -- finance cannot confirm a payment that was not required — by any route
        v_before := public.hp_state(v_req);
        v_res := public.hp_try(c_finance, 'pay', v_pay, '');
        PERFORM public.hp_check(v_res = 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP'
          AND public.hp_try(c_finance, 'act', v_pay, 'confirm_payment') <> 'OK'
          AND public.hp_try(c_finance, 'pay', v_apply, '') <> 'OK'
          AND public.hp_try(c_finance, 'act', v_apply, 'apply_decision') <> 'OK'
          AND public.hp_state(v_req) = v_before,
          'finance cannot confirm a payment that was not required: ' || v_res || ' (zero mutation)');
        -- read side
        PERFORM set_config('harness.uid', v_owner::text, false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) ->> 'decision' = 'FEE_NOT_REQUIRED'
          AND public.get_b1_fee_decision(v_req) -> 'amountDue' = 'null'::jsonb, 'the owning student reads the decision');
        PERFORM set_config('harness.uid', '11111111-1111-1111-1111-0000000000c1', false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) IS NULL, 'another student reads nothing');
        PERFORM set_config('harness.uid', '11111111-1111-1111-1111-000000000014', false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) IS NULL, 'an unassigned admin reads nothing');
        PERFORM set_config('harness.uid', '11111111-1111-1111-1111-000000000005', false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) IS NULL, 'a staff member with no step on this request reads nothing');
        PERFORM set_config('harness.uid', c_finance::text, false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) ->> 'decision' = 'FEE_NOT_REQUIRED',
          'a direct assignee of a step of this request reads the decision');
        PERFORM set_config('harness.uid', '', false);
        PERFORM public.hp_check(public.get_b1_fee_decision(v_req) IS NULL, 'anonymous reads nothing');
      END IF;

      -- registrar applies the decision ----------------------------------------------
      v_total := v_total + public.hp_deny_sample(v_req, 'registrar_apply', 'apply_decision');
      PERFORM public.hp_check(public.hp_gate(c_registrar, v_apply, 'apply_decision')
        AND public.hp_try(c_registrar, 'act', v_apply, 'apply_decision') = 'OK',
        'registrar_apply: allowed for its exact assignee');
      PERFORM public.hp_check((SELECT status FROM public.student_requests WHERE id = v_req) = 'completed'
        AND (SELECT string_agg(s.status, ',' ORDER BY s.step_order) FROM public.student_request_workflow_steps s
             WHERE s.student_request_id = v_req AND s.step_order >= (SELECT step_order FROM public.student_request_workflow_steps WHERE id = v_fee))
            = CASE v_branch WHEN 'FEE_REQUIRED' THEN 'completed,completed,completed' ELSE 'completed,skipped,completed' END
        AND CASE v_service
              WHEN 'department_transfer' THEN
                (SELECT d.effect_applied_at IS NOT NULL FROM public.transfer_request_details d WHERE d.request_id = v_req)
                AND (SELECT sp.department_id = '22222222-2222-2222-2222-000000000002' FROM public.student_profiles sp WHERE sp.id = v_student)
              ELSE
                (SELECT d.chance_applied_at IS NOT NULL FROM public.extra_chance_details d WHERE d.request_id = v_req)
                AND (SELECT count(*) = 1 FROM public.student_extra_chances x WHERE x.request_id = v_req) END
        AND (SELECT count(*) = 1 FROM public.student_request_workflow_events e
             WHERE e.student_request_id = v_req AND e.event_type = 'academic_effect_applied'),
        'the request completes end to end and the academic effect is applied exactly once');
      PERFORM public.hp_check(public.hp_try(c_registrar, 'act', v_apply, 'apply_decision') <> 'OK'
        AND public.hp_try(c_registrar, 'fee', v_fee, 'FEE_REQUIRED::1') <> 'OK'
        AND (SELECT count(*) = 1 FROM public.notifications n WHERE n.reference_id = v_req)
        AND (SELECT count(*) = 1 FROM public.b1_request_fee_decisions d WHERE d.request_id = v_req),
        'a completed request cannot be replayed; still one decision and one notification');
      RAISE NOTICE 'ok: % / % — % refusals proven via direct RPC, all with zero mutation', v_service, v_branch, v_total;
    END LOOP;
  END LOOP;

  PERFORM public.hp_check((SELECT count(*) = 4 FROM public.b1_request_fee_decisions)
    AND (SELECT count(*) = 2 FROM public.student_request_fee_assessments)
    AND (SELECT count(*) = 0 FROM public.excused_absence_fee_decisions),
    'four decisions recorded; no fee-assessment / ledger row written; the excused-absence table untouched');
END $$;

SELECT 'B1_PAID_SERVICES_REGISTRAR_FEE_DECISION_01_CASES_PASS' AS result;
