-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 rehearsal — direct-RPC matrix.
--
-- Every authorization assertion below goes through the REAL deployed RPCs
-- (can_current_user_act_on_step, act_on_b1_student_request_step_atomic,
-- record_external_university_payment_confirmation,
-- initialize_b1_request_workflow_strict). Nothing is asserted on UI state.
\set QUIET on
SET client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.h_check(p_cond boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE_FAIL: %', p_label; END IF;
END $$;

-- Calls one real RPC as p_uid. Returns 'OK' or the raised error text.
CREATE OR REPLACE FUNCTION public.h_try(p_uid uuid, p_kind text, p_step uuid, p_action text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('harness.uid', COALESCE(p_uid::text, ''), false);
  BEGIN
    IF p_kind = 'pay' THEN
      PERFORM public.record_external_university_payment_confirmation(p_step, NULL);
    ELSE
      PERFORM public.act_on_b1_student_request_step_atomic(p_step, p_action, 'ملاحظة اختبار', '{}'::jsonb);
    END IF;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.h_request_state(p_request uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT to_jsonb(r)::text FROM public.student_requests r WHERE r.id = p_request),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.step_order)::text
       FROM public.student_request_workflow_steps s WHERE s.student_request_id = p_request),
    (SELECT count(*)::text FROM public.student_request_workflow_events e WHERE e.student_request_id = p_request),
    (SELECT jsonb_agg(to_jsonb(d))::text FROM public.absence_excuse_details d WHERE d.request_id = p_request),
    (SELECT count(*)::text FROM public.student_excused_absences x WHERE x.absence_excuse_request_id = p_request)));
$$;

CREATE OR REPLACE FUNCTION public.h_new_absence_request(
  p_id uuid, p_student uuid, p_number text, p_date date)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.student_requests
    (id, student_profile_id, request_type, request_number, title, status, form_data, submitted_at)
  VALUES (p_id, p_student, 'excused_absence', p_number, 'غياب بعذر', 'submitted', '{}'::jsonb, now());
  INSERT INTO public.absence_excuse_details
    (request_id, course_section_id, absence_date, reason_type, absence_reason_detail)
  VALUES (p_id, '66666666-6666-6666-6666-000000000007', p_date, 'medical', 'عذر طبي موثق');
  RETURN public.initialize_b1_request_workflow_strict(p_id, 'excused_absence');
END $$;

-- The full matrix for ONE active step:
--   * every other principal (incl. anonymous, the owning student, admin with
--     no assignment, same-role-not-assigned, the head of another department,
--     previous/next step actors) is denied on BOTH RPCs and on every action;
--   * the exact assignee is denied every action except the configured one,
--     the wrong RPC, and every other step of the same request;
--   * all of the above changes nothing;
--   * then the exact assignee succeeds once and cannot replay.
CREATE OR REPLACE FUNCTION public.h_matrix_step(
  p_request uuid, p_step_key text, p_expected uuid, p_action text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_step uuid := public.h_step(p_request, p_step_key);
  v_before text := public.h_request_state(p_request);
  v_actor uuid;
  v_other record;
  v_try text;
  v_res text;
  v_denials integer := 0;
  v_kind text := CASE WHEN p_action = 'confirm_payment' THEN 'pay' ELSE 'act' END;
  v_actions constant text[] := ARRAY['review','approve','clear','apply_decision','archive',
    'reject','return','sign','skip','confirm_payment','issue_document','complete','comment'];
  v_actors constant uuid[] := ARRAY[
    NULL,
    '11111111-1111-1111-1111-000000000001','11111111-1111-1111-1111-000000000002',
    '11111111-1111-1111-1111-000000000003','11111111-1111-1111-1111-000000000004',
    '11111111-1111-1111-1111-000000000005','11111111-1111-1111-1111-000000000006',
    '11111111-1111-1111-1111-000000000007','11111111-1111-1111-1111-000000000008',
    '11111111-1111-1111-1111-000000000009','11111111-1111-1111-1111-000000000010',
    '11111111-1111-1111-1111-000000000011','11111111-1111-1111-1111-000000000012',
    '11111111-1111-1111-1111-000000000013','11111111-1111-1111-1111-000000000014',
    '11111111-1111-1111-1111-000000000015','11111111-1111-1111-1111-000000000016',
    '11111111-1111-1111-1111-000000000017']::uuid[];
BEGIN
  PERFORM public.h_check(v_step IS NOT NULL, p_step_key || ': runtime step exists');
  PERFORM public.h_check((SELECT status = 'active' FROM public.student_request_workflow_steps WHERE id = v_step),
    p_step_key || ': is the single active step');
  PERFORM public.h_check((SELECT count(*) = 1 FROM public.student_request_workflow_steps
    WHERE student_request_id = p_request AND status = 'active'), p_step_key || ': exactly one active step');

  -- ---- DENY: every principal that is not the exact direct assignee --------
  FOREACH v_actor IN ARRAY v_actors LOOP
    CONTINUE WHEN v_actor IS NOT DISTINCT FROM p_expected;
    PERFORM set_config('harness.uid', COALESCE(v_actor::text, ''), false);
    PERFORM public.h_check(NOT public.can_current_user_act_on_step(v_step, p_action),
      format('%s: gate denies %s', p_step_key, COALESCE(v_actor::text, 'anon')));
    v_denials := v_denials + 1;
    FOREACH v_try IN ARRAY v_actions LOOP
      v_res := public.h_try(v_actor, 'act', v_step, v_try);
      PERFORM public.h_check(v_res <> 'OK',
        format('%s: act(%s) denied for %s', p_step_key, v_try, COALESCE(v_actor::text, 'anon')));
      v_denials := v_denials + 1;
    END LOOP;
    v_res := public.h_try(v_actor, 'pay', v_step, NULL);
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: payment RPC denied for %s', p_step_key, COALESCE(v_actor::text, 'anon')));
    v_denials := v_denials + 1;
  END LOOP;

  -- ---- DENY: the exact assignee, but an illegal action / the wrong RPC ----
  FOREACH v_try IN ARRAY v_actions LOOP
    CONTINUE WHEN v_try = p_action AND v_kind = 'act';
    v_res := public.h_try(p_expected, 'act', v_step, v_try);
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: assignee denied illegal action %s', p_step_key, v_try));
    v_denials := v_denials + 1;
  END LOOP;
  IF v_kind = 'act' THEN
    v_res := public.h_try(p_expected, 'pay', v_step, NULL);
    PERFORM public.h_check(v_res <> 'OK', p_step_key || ': assignee denied the payment RPC on a non-payment step');
  ELSE
    v_res := public.h_try(p_expected, 'act', v_step, 'confirm_payment');
    PERFORM public.h_check(v_res LIKE '%B1_SPECIALIZED_ACTION_RPC_REQUIRED%',
      p_step_key || ': generic executor refuses confirm_payment (' || v_res || ')');
  END IF;
  v_denials := v_denials + 1;

  -- ---- DENY: the exact assignee on every OTHER step of the same request ---
  FOR v_other IN
    SELECT s.id, s.step_key, c.action_type
    FROM public.student_request_workflow_steps s
    JOIN public.request_type_workflow_steps c ON c.id = s.workflow_step_id
    WHERE s.student_request_id = p_request AND s.id <> v_step
  LOOP
    PERFORM set_config('harness.uid', p_expected::text, false);
    PERFORM public.h_check(NOT public.can_current_user_act_on_step(v_other.id, v_other.action_type),
      format('%s: assignee gated out of non-active step %s', p_step_key, v_other.step_key));
    v_res := public.h_try(p_expected, 'act', v_other.id, v_other.action_type);
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: assignee cannot act on non-active step %s', p_step_key, v_other.step_key));
    v_res := public.h_try(p_expected, 'pay', v_other.id, NULL);
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: assignee cannot confirm payment on non-active step %s', p_step_key, v_other.step_key));
    v_denials := v_denials + 3;
  END LOOP;

  PERFORM public.h_check(public.h_request_state(p_request) = v_before,
    p_step_key || ': all denials left the request byte-identical (zero mutation)');

  -- ---- ALLOW: exactly the direct assignee, exactly the configured action --
  PERFORM set_config('harness.uid', p_expected::text, false);
  PERFORM public.h_check(public.can_current_user_act_on_step(v_step, p_action),
    p_step_key || ': gate allows the exact direct assignee');
  v_res := public.h_try(p_expected, v_kind, v_step, p_action);
  PERFORM public.h_check(v_res = 'OK', p_step_key || ': exact assignee succeeds (' || v_res || ')');
  PERFORM public.h_check((SELECT status = 'completed' AND completed_by = p_expected
    FROM public.student_request_workflow_steps WHERE id = v_step),
    p_step_key || ': completed by the exact assignee');

  -- ---- DENY: replay of the completed step --------------------------------
  v_res := public.h_try(p_expected, v_kind, v_step, p_action);
  PERFORM public.h_check(v_res <> 'OK', p_step_key || ': completed step cannot be replayed');
  v_denials := v_denials + 1;

  PERFORM set_config('harness.uid', '', false);
  RAISE NOTICE 'ok: %/% — allowed only % (%); % denials proven via direct RPC',
    p_step_key, p_action, p_expected, v_kind, v_denials;
  RETURN v_denials;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Definition, publish state, pins, preserved function attributes
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_new uuid; v_old uuid;
BEGIN
  SELECT w.id INTO v_new FROM public.request_type_workflows w
  WHERE w.code = 'excused_absence_external_payment_workflow';
  SELECT w.id INTO v_old FROM public.request_type_workflows w
  WHERE w.code = 'excused_absence_free_workflow' AND w.version = 2;

  PERFORM public.h_assert((SELECT status = 'active' AND is_active AND version = 3
      AND published_at IS NOT NULL AND superseded_at IS NULL
    FROM public.request_type_workflows WHERE id = v_new),
    'new cycle is the active version 3 (published, not superseded)');
  PERFORM public.h_assert((SELECT status = 'retired' AND NOT is_active AND superseded_at IS NOT NULL
    FROM public.request_type_workflows WHERE id = v_old),
    'free cycle v2 is retired and stamped superseded');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = 'excused_absence' AND w.is_active), 'exactly one active workflow for the service');

  PERFORM public.h_assert((SELECT array_agg(s.step_key || '/' || u.code || '/' || r.code || '/' || s.action_type || '/' || s.action_code
        ORDER BY s.step_order)
      FROM public.request_type_workflow_steps s
      JOIN public.request_processing_units u ON u.id = s.processing_unit_id
      JOIN public.request_processing_roles r ON r.id = s.processing_role_id
      WHERE s.workflow_id = v_new) = ARRAY[
    'dean_review/dean/dean/review/REVIEW',
    'registrar_fee_referral/registrar/registrar_general/review/REVIEW',
    'payment_confirmation/finance/revenue_finance_officer/confirm_payment/PAYMENT_CONFIRMATION',
    'department_head_signature/department/department_head/approve/APPROVE',
    'dean_signature/dean/dean/approve/APPROVE',
    'student_affairs_manager_signature/student_affairs/student_affairs_manager/approve/APPROVE',
    'record_apply/registrar/registrar_general/apply_decision/REGISTER_EXCUSED_ABSENCE',
    'archive/archive/archive_officer/archive/ARCHIVE'],
    'eight steps: exact order, unit, role, action type and catalog action');

  PERFORM public.h_assert((SELECT bool_and(s.processing_unit_id IS NOT NULL AND s.processing_role_id IS NOT NULL
        AND s.assignment_strategy = 'specific_user'
        AND s.config ->> 'authorization' = 'exactly_one_direct_assignee'
        AND NOT s.requires_payment AND NOT s.produces_document AND NOT s.can_skip)
      FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_new),
    'every step has unit + role, direct-assignee authorization, no ledger/document/skip flag');
  PERFORM public.h_assert((SELECT count(*) = 0 FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = v_new AND s.action_type IN ('sign','issue_document','assess_fee','request_payment')),
    'no sign / issue_document / fee-assessment step exists');
  PERFORM public.h_assert((SELECT s.config ->> 'payment_policy' = 'EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION'
        AND s.status_on_enter = 'awaiting_payment_confirmation' AND s.status_on_complete = 'payment_confirmed'
      FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = v_new AND s.step_key = 'payment_confirmation'),
    'payment_confirmation carries the external-confirmation policy');
  PERFORM public.h_assert((SELECT s.config ->> 'department_scope' = 'student_department'
      FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = v_new AND s.step_key = 'department_head_signature'),
    'department_head_signature is tagged with the student_department scope');

  PERFORM public.h_assert((SELECT count(*) = 9 AND bool_and(t.is_default AND t.condition_schema = '{}'::jsonb)
      FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_new),
    'nine unconditional default transitions (no fee branch, payment is mandatory)');
  PERFORM public.h_assert((SELECT count(*) = 8 FROM public.b1_workflow_runtime_contract_snapshot c
      WHERE c.workflow_id = v_new AND c.workflow_version = 3), 'runtime contract pinned for all eight steps');
  PERFORM public.h_assert((SELECT count(*) = 3 FROM public.b1_workflow_runtime_contract_snapshot c
      WHERE c.workflow_id = v_old), 'free-cycle runtime contract pins untouched');
  PERFORM public.h_assert((public.validate_request_workflow_publish(v_new) ->> 'valid')::boolean,
    'publish validator accepts the new cycle');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.request_type_workflow_change_log l
      WHERE l.workflow_id = v_new AND l.change_kind = 'workflow_published' AND l.version = 3),
    'exactly one change-log row after two applies');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.request_workflow_publish_validations v
      WHERE v.workflow_id = v_new AND v.is_valid), 'exactly one publish-validation row after two applies');
  PERFORM public.h_assert((SELECT student_visible AND is_active FROM public.request_types WHERE code = 'excused_absence'),
    'request_types.student_visible / is_active unchanged');

  PERFORM public.h_assert(NOT has_function_privilege('authenticated',
      'public.b1_excused_absence_student_department(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.b1_excused_absence_student_department(uuid)', 'EXECUTE'),
    'scope helper is not executable by anon / authenticated');
  PERFORM public.h_assert(NOT EXISTS (
      SELECT 1 FROM public.h_eawf01_pre_apply_function_attrs b
      JOIN pg_proc p ON p.oid::regprocedure::text = b.signature
      WHERE p.proowner <> b.proowner OR p.prosecdef <> b.prosecdef OR p.provolatile <> b.provolatile
         OR p.proconfig::text IS DISTINCT FROM b.proconfig OR p.proacl::text IS DISTINCT FROM b.proacl),
    'owner / SECURITY DEFINER / volatility / search_path / ACL of every patched function preserved');
  PERFORM public.h_assert(
    position('EAWF01' in pg_get_functiondef('public.apply_b1_excused_absence_effect(uuid)'::regprocedure)) = 0
    AND position('EAWF01' in pg_get_functiondef('public.can_current_user_act_on_step(uuid,text)'::regprocedure)) = 0,
    'effect function and authorization gate were NOT modified');
END $$;

-- ---------------------------------------------------------------------------
-- 2. New request, student of the computer-science department:
--    full lifecycle with the complete allow/deny matrix on every step
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000001';
  v_res jsonb; v_total integer := 0;
  v_dean constant uuid := '11111111-1111-1111-1111-000000000011';
  v_registrar constant uuid := '11111111-1111-1111-1111-000000000004';
  v_finance constant uuid := '11111111-1111-1111-1111-000000000003';
  v_head_cs constant uuid := '11111111-1111-1111-1111-000000000006';
  v_sa_manager constant uuid := '11111111-1111-1111-1111-000000000002';
  v_archive constant uuid := '11111111-1111-1111-1111-000000000005';
BEGIN
  v_res := public.h_new_absence_request(v_req, '77777777-7777-7777-7777-000000000001',
    'SR-TESTONLY-EAWF01-CS', DATE '2026-10-01');
  PERFORM public.h_assert((v_res ->> 'initialized')::boolean, 'new request initializes on the new cycle');
  PERFORM public.h_assert((SELECT r.workflow_version = 3 AND w.code = 'excused_absence_external_payment_workflow'
      FROM public.student_requests r JOIN public.request_type_workflows w ON w.id = r.workflow_id
      WHERE r.id = v_req), 'new request is pinned to version 3 of the new cycle');
  PERFORM public.h_assert((SELECT count(*) = 8 AND count(*) FILTER (WHERE num_nonnulls(
        s.assigned_user_id, s.assigned_staff_profile_id, s.assigned_faculty_profile_id,
        s.assigned_position_assignment_id) = 1) = 8
      FROM public.student_request_workflow_steps s WHERE s.student_request_id = v_req),
    'eight runtime steps, each with exactly one direct assignee');
  PERFORM public.h_assert((SELECT s.assigned_position_assignment_id = '55555555-5555-5555-5555-000000000001'
        AND s.assigned_user_id IS NULL AND s.assigned_staff_profile_id IS NULL AND s.assigned_faculty_profile_id IS NULL
      FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = v_req AND s.step_key = 'department_head_signature'),
    'department_head_signature is bound to the head of the STUDENT''S department (CS)');

  v_total := v_total + public.h_matrix_step(v_req, 'dean_review', v_dean, 'review');
  v_total := v_total + public.h_matrix_step(v_req, 'registrar_fee_referral', v_registrar, 'review');
  PERFORM public.h_assert((SELECT status = 'active' FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND step_key = 'payment_confirmation')
    AND (SELECT count(*) = 5 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'pending'),
    'after the registrar referral the request waits on payment; no signature step is reachable');
  v_total := v_total + public.h_matrix_step(v_req, 'payment_confirmation', v_finance, 'confirm_payment');
  v_total := v_total + public.h_matrix_step(v_req, 'department_head_signature', v_head_cs, 'approve');
  v_total := v_total + public.h_matrix_step(v_req, 'dean_signature', v_dean, 'approve');
  v_total := v_total + public.h_matrix_step(v_req, 'student_affairs_manager_signature', v_sa_manager, 'approve');

  PERFORM public.h_assert((SELECT count(*) = 0 FROM public.student_excused_absences
      WHERE absence_excuse_request_id = v_req)
    AND (SELECT record_applied_at IS NULL FROM public.absence_excuse_details WHERE request_id = v_req),
    'no excuse is recorded before the registrar step');
  v_total := v_total + public.h_matrix_step(v_req, 'record_apply', v_registrar, 'apply_decision');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.student_excused_absences
      WHERE absence_excuse_request_id = v_req AND absence_date = DATE '2026-10-01')
    AND (SELECT record_applied_at IS NOT NULL FROM public.absence_excuse_details WHERE request_id = v_req)
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_events
      WHERE student_request_id = v_req AND event_type = 'academic_effect_applied'),
    'the excuse is recorded exactly once, at the registrar step, before archiving');
  PERFORM public.h_assert((SELECT status = 'in_review' AND completed_at IS NULL
      FROM public.student_requests WHERE id = v_req),
    'request stays open until it is archived');

  v_total := v_total + public.h_matrix_step(v_req, 'archive', v_archive, 'archive');
  PERFORM public.h_assert((SELECT status = 'completed' AND completed_at IS NOT NULL
      FROM public.student_requests WHERE id = v_req), 'archive closes the request');
  PERFORM public.h_assert((SELECT count(*) = 8 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'completed')
    AND (SELECT count(*) = 1 FROM public.student_excused_absences WHERE absence_excuse_request_id = v_req)
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_events
      WHERE student_request_id = v_req AND event_type = 'academic_effect_applied'),
    'all eight steps completed; the academic effect was not applied twice');
  RAISE NOTICE 'ok: CS-student lifecycle — % denials proven across 8 steps', v_total;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Student of the information-systems department: the signature belongs to
--    THAT department's head only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000002';
  v_res jsonb;
BEGIN
  v_res := public.h_new_absence_request(v_req, '77777777-7777-7777-7777-000000000002',
    'SR-TESTONLY-EAWF01-IS', DATE '2026-10-02');
  PERFORM public.h_assert((SELECT s.assigned_position_assignment_id = '55555555-5555-5555-5555-000000000002'
      FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = v_req AND s.step_key = 'department_head_signature'),
    'IS student: signature step bound to the IS department head');
  PERFORM public.h_matrix_step(v_req, 'dean_review', '11111111-1111-1111-1111-000000000011', 'review');
  PERFORM public.h_matrix_step(v_req, 'registrar_fee_referral', '11111111-1111-1111-1111-000000000004', 'review');
  PERFORM public.h_matrix_step(v_req, 'payment_confirmation', '11111111-1111-1111-1111-000000000003', 'confirm_payment');
  -- the matrix denies the CS head (…06) and allows only the IS head (…07)
  PERFORM public.h_matrix_step(v_req, 'department_head_signature', '11111111-1111-1111-1111-000000000007', 'approve');
END $$;

-- ---------------------------------------------------------------------------
-- 4. Fail-closed initialization: no department / department without a head
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.h_new_absence_request('99999999-9999-9999-9999-000000000003',
      '77777777-7777-7777-7777-000000000003', 'SR-TESTONLY-EAWF01-NODEPT', DATE '2026-10-03');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_SCOPE_MISSING%',
    'student without a department cannot start the cycle: ' || v_err);

  BEGIN
    PERFORM public.h_new_absence_request('99999999-9999-9999-9999-000000000006',
      '77777777-7777-7777-7777-000000000006', 'SR-TESTONLY-EAWF01-NOHEAD', DATE '2026-10-06');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:department_head_signature:0%',
    'department without a head fails closed (no fallback to another head): ' || v_err);

  PERFORM public.h_assert((SELECT count(*) = 0 FROM public.student_requests
      WHERE id IN ('99999999-9999-9999-9999-000000000003','99999999-9999-9999-9999-000000000006'))
    AND (SELECT count(*) = 0 FROM public.student_request_workflow_steps
      WHERE student_request_id IN ('99999999-9999-9999-9999-000000000003','99999999-9999-9999-9999-000000000006')),
    'failed initializations left no request and no runtime step behind');
END $$;

-- ---------------------------------------------------------------------------
-- 5. Department changes mid-flight: activation re-resolves the scope,
--    and resubmit-after-return re-validates it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000007';
  v_student constant uuid := '77777777-7777-7777-7777-000000000007';
  v_cs constant uuid := '22222222-2222-2222-2222-000000000001';
  v_is constant uuid := '22222222-2222-2222-2222-000000000002';
  v_pay uuid; v_sig uuid; v_res text; v_before text; v_json jsonb; v_err text;
BEGIN
  PERFORM public.h_new_absence_request(v_req, v_student, 'SR-TESTONLY-EAWF01-MOVED', DATE '2026-10-07');
  PERFORM public.h_check(public.h_try('11111111-1111-1111-1111-000000000011','act',
    public.h_step(v_req,'dean_review'),'review') = 'OK', 'moved: dean review');
  PERFORM public.h_check(public.h_try('11111111-1111-1111-1111-000000000004','act',
    public.h_step(v_req,'registrar_fee_referral'),'review') = 'OK', 'moved: registrar referral');
  v_pay := public.h_step(v_req, 'payment_confirmation');
  v_sig := public.h_step(v_req, 'department_head_signature');

  -- The student is moved to another department while payment is pending.
  UPDATE public.student_profiles SET department_id = v_is WHERE id = v_student;
  v_before := public.h_request_state(v_req);
  v_res := public.h_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, NULL);
  PERFORM public.h_assert(v_res LIKE 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:department_head_signature%',
    'stale department head is never activated after a department change: ' || v_res);
  PERFORM public.h_assert(public.h_request_state(v_req) = v_before,
    'the rejected activation rolled the payment confirmation back (zero mutation)');

  UPDATE public.student_profiles SET department_id = v_cs WHERE id = v_student;
  PERFORM public.h_assert(public.h_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, NULL) = 'OK',
    'with the original department restored, payment confirmation activates the signature step');

  -- Harness-only simulation of a "returned to student" state on the signature
  -- step (the deployed B1 executor exposes no return action; see the review doc).
  PERFORM set_config('b1.atomic_action', '1', true);
  UPDATE public.student_request_workflow_steps SET status = 'returned', decision = 'returned' WHERE id = v_sig;
  UPDATE public.student_requests SET status = 'returned_for_completion' WHERE id = v_req;

  UPDATE public.student_profiles SET department_id = v_is WHERE id = v_student;
  BEGIN
    v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_RUNTIME_RESUBMIT_CONTRACT_INVALID%',
    'resubmit is refused when the stored head is no longer the student''s department head: ' || v_err);

  UPDATE public.student_profiles SET department_id = v_cs WHERE id = v_student;
  v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
  PERFORM public.h_assert((v_json ->> 'resumed')::boolean
    AND (SELECT status = 'active' FROM public.student_request_workflow_steps WHERE id = v_sig),
    'resubmit resumes the same signature step under the student-department scope');
  PERFORM public.h_assert(public.h_try('11111111-1111-1111-1111-000000000007','act', v_sig, 'approve') <> 'OK'
    AND public.h_try('11111111-1111-1111-1111-000000000006','act', v_sig, 'approve') = 'OK',
    'after resume: other department head denied, the student''s department head allowed');
  PERFORM set_config('harness.uid', '', false);
END $$;

-- ---------------------------------------------------------------------------
-- 6. In-flight requests keep running on the retired free cycle, untouched
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '88888888-8888-8888-8888-000000000009';
  v_old uuid; v_total integer := 0;
BEGIN
  SELECT w.id INTO v_old FROM public.request_type_workflows w
  WHERE w.code = 'excused_absence_free_workflow' AND w.version = 2;

  PERFORM public.h_assert((SELECT array_agg(s.step_key ORDER BY s.step_order)
        = ARRAY['student_affairs_intake','manager_review','record_apply']
      AND bool_and(s.workflow_id = v_old)
      FROM public.student_request_workflow_steps s WHERE s.student_request_id = v_req),
    'in-flight request still carries its own three-step snapshot on the retired version');
  PERFORM public.h_assert(public.student_request_pinned_workflow_id(v_req) = v_old,
    'in-flight request resolves its pinned workflow to the retired version');

  -- The dean (first actor of the NEW cycle) is among the denied principals.
  v_total := v_total + public.h_matrix_step(v_req, 'student_affairs_intake', '11111111-1111-1111-1111-000000000001', 'review');
  v_total := v_total + public.h_matrix_step(v_req, 'manager_review', '11111111-1111-1111-1111-000000000002', 'approve');
  v_total := v_total + public.h_matrix_step(v_req, 'record_apply', '11111111-1111-1111-1111-000000000001', 'apply_decision');

  PERFORM public.h_assert((SELECT status = 'completed' FROM public.student_requests WHERE id = v_req)
    AND (SELECT count(*) = 3 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'completed')
    AND (SELECT count(*) = 1 FROM public.student_excused_absences
      WHERE absence_excuse_request_id = v_req AND absence_date = DATE '2026-09-01')
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_events
      WHERE student_request_id = v_req AND event_type = 'academic_effect_applied'),
    'in-flight request completes on the old three steps: no payment, no signatures, excuse recorded once');
  RAISE NOTICE 'ok: in-flight lifecycle — % denials proven across 3 steps', v_total;
END $$;

-- Documented limitation (engine behaviour, NOT introduced by this package):
-- a request of the retired cycle that is returned to the student cannot be
-- resubmitted once another version is active — it fails closed.
DO $$
DECLARE
  v_req constant uuid := '88888888-8888-8888-8888-00000000000a';
  v_err text; v_json jsonb;
BEGIN
  PERFORM set_config('b1.atomic_action', '1', true);
  UPDATE public.student_request_workflow_steps SET status = 'returned', decision = 'returned'
  WHERE student_request_id = v_req AND step_key = 'student_affairs_intake';
  UPDATE public.student_requests SET status = 'returned_for_completion' WHERE id = v_req;
  BEGIN
    v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_RUNTIME_RESUBMIT_CONTRACT_INVALID%',
    'KNOWN LIMITATION: returned request of the retired cycle fails closed on resubmit: ' || v_err);
  PERFORM public.h_assert((SELECT count(*) = 3 AND bool_and(w.code = 'excused_absence_free_workflow')
      FROM public.student_request_workflow_steps s
      JOIN public.request_type_workflows w ON w.id = s.workflow_id
      WHERE s.student_request_id = v_req),
    'the failed resubmit did not migrate the request onto the new cycle');
END $$;

SELECT 'EXCUSED_ABSENCE_PAID_SIGNATURE_WORKFLOW_01_CASES_PASS' AS result;
