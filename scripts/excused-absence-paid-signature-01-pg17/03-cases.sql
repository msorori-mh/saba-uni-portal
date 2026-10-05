-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 rehearsal — direct-RPC matrix.
--
-- Every authorization assertion below goes through the REAL deployed RPCs
-- (can_current_user_act_on_step, act_on_b1_student_request_step_atomic,
-- record_external_university_payment_confirmation,
-- record_excused_absence_fee_decision, initialize_b1_request_workflow_strict).
-- Nothing is asserted on UI state.
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
--   act  -> act_on_b1_student_request_step_atomic(step, p_action, p_comment)
--   pay  -> record_external_university_payment_confirmation(step)
--   fee  -> record_excused_absence_fee_decision(step, decision[, reason])
--           p_action = 'FEE_REQUIRED' | 'FEE_NOT_REQUIRED:FREE_SERVICE' | …
CREATE OR REPLACE FUNCTION public.h_try(
  p_uid uuid, p_kind text, p_step uuid, p_action text, p_comment text DEFAULT 'ملاحظة اختبار كافية')
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('harness.uid', COALESCE(p_uid::text, ''), false);
  BEGIN
    IF p_kind = 'pay' THEN
      PERFORM public.record_external_university_payment_confirmation(p_step, NULL);
    ELSIF p_kind = 'fee' THEN
      PERFORM public.record_excused_absence_fee_decision(
        p_step, split_part(p_action, ':', 1), NULLIF(split_part(p_action, ':', 2), ''), NULL);
    ELSE
      PERFORM public.act_on_b1_student_request_step_atomic(p_step, p_action, p_comment, '{}'::jsonb);
    END IF;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END $$;

-- Everything a denied call must leave byte-identical for one request.
CREATE OR REPLACE FUNCTION public.h_request_state(p_request uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT to_jsonb(r)::text FROM public.student_requests r WHERE r.id = p_request),
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.step_order)::text
       FROM public.student_request_workflow_steps s WHERE s.student_request_id = p_request),
    (SELECT count(*)::text FROM public.student_request_workflow_events e WHERE e.student_request_id = p_request),
    (SELECT jsonb_agg(to_jsonb(d))::text FROM public.absence_excuse_details d WHERE d.request_id = p_request),
    (SELECT count(*)::text FROM public.student_excused_absences x WHERE x.absence_excuse_request_id = p_request),
    (SELECT jsonb_agg(to_jsonb(f))::text FROM public.excused_absence_fee_decisions f WHERE f.request_id = p_request),
    (SELECT count(*)::text FROM public.notifications n),
    (SELECT count(*)::text FROM public.student_request_fee_assessments)));
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

CREATE OR REPLACE FUNCTION public.h_notifications(p_request uuid)
RETURNS SETOF public.notifications LANGUAGE sql STABLE AS $$
  SELECT * FROM public.notifications n
  WHERE n.reference_type = 'student_request' AND n.reference_id = p_request
  ORDER BY n.created_at, n.id;
$$;

-- The full matrix for ONE active step.
--   p_action : the configured action_type of the step
--   p_success: how the exact assignee completes it:
--                'act'                              generic executor
--                'pay'                              payment confirmation RPC
--                'fee:FEE_REQUIRED' / 'fee:FEE_NOT_REQUIRED:<reason>'
--   p_exits  : the exit actions (reject / return) this step allows
-- Proves:
--   * every other principal (anonymous, the owning student, other students,
--     admin with no assignment, same-role-not-assigned, the head of another
--     department, previous/next step actors) is denied on ALL three RPCs and
--     on every action, including reject / return with a valid reason;
--   * the exact assignee is denied every action that is neither the configured
--     one nor an allowed exit, the wrong RPCs, and every other step;
--   * allowed exits are refused without a real reason;
--   * the registrar step cannot be completed without a fee decision, and the
--     decision RPC refuses every invalid input;
--   * all of the above changes NOTHING;
--   * then the exact assignee succeeds once and cannot replay.
CREATE OR REPLACE FUNCTION public.h_matrix_step(
  p_request uuid, p_step_key text, p_expected uuid, p_action text,
  p_success text DEFAULT 'act', p_exits text[] DEFAULT '{}')
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_step uuid := public.h_step(p_request, p_step_key);
  v_before text := public.h_request_state(p_request);
  v_actor uuid;
  v_other record;
  v_try text;
  v_res text;
  v_denials integer := 0;
  v_kind text := split_part(p_success, ':', 1);
  v_fee_arg text := NULLIF(substr(p_success, 5), '');
  v_actions constant text[] := ARRAY['review','approve','clear','apply_decision','archive',
    'reject','return','sign','skip','confirm_payment','issue_document','complete','comment'];
  v_fee_args constant text[] := ARRAY['FEE_REQUIRED','FEE_NOT_REQUIRED:FREE_SERVICE','FEE_NOT_REQUIRED:EXEMPTION'];
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
    FOREACH v_try IN ARRAY v_fee_args LOOP
      v_res := public.h_try(v_actor, 'fee', v_step, v_try);
      PERFORM public.h_check(v_res <> 'OK',
        format('%s: fee decision (%s) denied for %s', p_step_key, v_try, COALESCE(v_actor::text, 'anon')));
    END LOOP;
    v_denials := v_denials + 4;
  END LOOP;

  -- ---- DENY: the exact assignee, but an illegal action / the wrong RPC ----
  FOREACH v_try IN ARRAY v_actions LOOP
    CONTINUE WHEN v_try = p_action AND v_kind IN ('act', 'none');
    CONTINUE WHEN v_try = ANY (p_exits);
    v_res := public.h_try(p_expected, 'act', v_step, v_try);
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: assignee denied illegal action %s', p_step_key, v_try));
    v_denials := v_denials + 1;
  END LOOP;

  -- allowed exits still need a real reason
  FOREACH v_try IN ARRAY p_exits LOOP
    v_res := public.h_try(p_expected, 'act', v_step, v_try, NULL);
    PERFORM public.h_check(v_res <> 'OK', format('%s: %s refused without a reason', p_step_key, v_try));
    v_res := public.h_try(p_expected, 'act', v_step, v_try, '   ');
    PERFORM public.h_check(v_res <> 'OK', format('%s: %s refused with a blank reason', p_step_key, v_try));
    v_res := public.h_try(p_expected, 'act', v_step, v_try, 'لا');
    PERFORM public.h_check(v_res LIKE '%B1_EXCUSED_ABSENCE_DECISION_REASON_REQUIRED%',
      format('%s: %s refused with a too-short reason (%s)', p_step_key, v_try, v_res));
    v_denials := v_denials + 3;
  END LOOP;

  IF v_kind <> 'pay' THEN
    v_res := public.h_try(p_expected, 'pay', v_step, NULL);
    PERFORM public.h_check(v_res <> 'OK', p_step_key || ': assignee denied the payment RPC on a non-payment step');
  ELSE
    v_res := public.h_try(p_expected, 'act', v_step, 'confirm_payment');
    PERFORM public.h_check(v_res LIKE '%B1_SPECIALIZED_ACTION_RPC_REQUIRED%',
      p_step_key || ': generic executor refuses confirm_payment (' || v_res || ')');
  END IF;
  v_denials := v_denials + 1;

  IF v_kind = 'fee' THEN
    -- The registrar step can never be completed without a recorded decision.
    v_res := public.h_try(p_expected, 'act', v_step, p_action);
    PERFORM public.h_check(v_res LIKE '%B1_EXCUSED_ABSENCE_FEE_DECISION_REQUIRED%',
      p_step_key || ': plain completion without a fee decision is blocked (' || v_res || ')');
    FOREACH v_try IN ARRAY ARRAY['', 'PAID', 'fee_required', 'FEE_REQUIRED:EXEMPTION', 'FEE_REQUIRED:FREE_SERVICE',
                                 'FEE_NOT_REQUIRED', 'FEE_NOT_REQUIRED:OTHER', 'FEE_NOT_REQUIRED:exemption'] LOOP
      v_res := public.h_try(p_expected, 'fee', v_step, v_try);
      PERFORM public.h_check(v_res LIKE '%B1_EXCUSED_ABSENCE_FEE_DECISION_INPUT_INVALID%',
        format('%s: invalid fee decision input "%s" refused (%s)', p_step_key, v_try, v_res));
      v_denials := v_denials + 1;
    END LOOP;
    PERFORM set_config('harness.uid', p_expected::text, false);
    BEGIN
      PERFORM public.record_excused_absence_fee_decision(v_step, 'FEE_REQUIRED', NULL, repeat('ن', 501));
      v_res := 'OK';
    EXCEPTION WHEN OTHERS THEN v_res := SQLERRM; END;
    PERFORM public.h_check(v_res LIKE '%INPUT_INVALID:note%', p_step_key || ': over-long note refused');
    v_denials := v_denials + 2;
  ELSE
    -- The fee decision RPC is refused on every step but the registrar's.
    FOREACH v_try IN ARRAY v_fee_args LOOP
      v_res := public.h_try(p_expected, 'fee', v_step, v_try);
      PERFORM public.h_check(v_res <> 'OK',
        format('%s: assignee denied the fee decision RPC on this step (%s)', p_step_key, v_try));
      v_denials := v_denials + 1;
    END LOOP;
  END IF;

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
    FOREACH v_try IN ARRAY ARRAY[v_other.action_type, 'reject', 'return'] LOOP
      v_res := public.h_try(p_expected, 'act', v_other.id, v_try);
      PERFORM public.h_check(v_res <> 'OK',
        format('%s: assignee cannot %s non-active step %s', p_step_key, v_try, v_other.step_key));
    END LOOP;
    v_res := public.h_try(p_expected, 'pay', v_other.id, NULL);
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: assignee cannot confirm payment on non-active step %s', p_step_key, v_other.step_key));
    v_res := public.h_try(p_expected, 'fee', v_other.id, 'FEE_NOT_REQUIRED:EXEMPTION');
    PERFORM public.h_check(v_res <> 'OK',
      format('%s: assignee cannot record a fee decision on non-active step %s', p_step_key, v_other.step_key));
    v_denials := v_denials + 6;
  END LOOP;

  PERFORM public.h_check(public.h_request_state(p_request) = v_before,
    p_step_key || ': all denials left the request, decisions and notifications byte-identical (zero mutation)');

  IF v_kind = 'none' THEN
    PERFORM set_config('harness.uid', '', false);
    RAISE NOTICE 'ok: %/% — denials only (% proven via direct RPC), step left active', p_step_key, p_action, v_denials;
    RETURN v_denials;
  END IF;

  -- ---- ALLOW: exactly the direct assignee, exactly the configured path ----
  PERFORM set_config('harness.uid', p_expected::text, false);
  PERFORM public.h_check(public.can_current_user_act_on_step(v_step, p_action),
    p_step_key || ': gate allows the exact direct assignee');
  v_res := public.h_try(p_expected, v_kind, v_step, COALESCE(v_fee_arg, p_action));
  PERFORM public.h_check(v_res = 'OK', p_step_key || ': exact assignee succeeds (' || v_res || ')');
  PERFORM public.h_check((SELECT status = 'completed' AND completed_by = p_expected
    FROM public.student_request_workflow_steps WHERE id = v_step),
    p_step_key || ': completed by the exact assignee');

  -- ---- DENY: replay of the completed step --------------------------------
  v_res := public.h_try(p_expected, v_kind, v_step, COALESCE(v_fee_arg, p_action));
  PERFORM public.h_check(v_res <> 'OK', p_step_key || ': completed step cannot be replayed');
  v_denials := v_denials + 1;

  PERFORM set_config('harness.uid', '', false);
  RAISE NOTICE 'ok: %/% — allowed only % (%); % denials proven via direct RPC',
    p_step_key, p_action, p_expected, p_success, v_denials;
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
          || '/reject=' || s.can_reject || '/return=' || s.can_return_to_student
        ORDER BY s.step_order)
      FROM public.request_type_workflow_steps s
      JOIN public.request_processing_units u ON u.id = s.processing_unit_id
      JOIN public.request_processing_roles r ON r.id = s.processing_role_id
      WHERE s.workflow_id = v_new) = ARRAY[
    'dean_review/dean/dean/review/REVIEW/reject=true/return=true',
    'registrar_fee_referral/registrar/registrar_general/review/REVIEW/reject=true/return=true',
    'payment_confirmation/finance/revenue_finance_officer/confirm_payment/PAYMENT_CONFIRMATION/reject=false/return=false',
    'department_head_signature/department/department_head/approve/APPROVE/reject=true/return=false',
    'dean_signature/dean/dean/approve/APPROVE/reject=true/return=false',
    'student_affairs_manager_signature/student_affairs/student_affairs_manager/approve/APPROVE/reject=true/return=false',
    'record_apply/registrar/registrar_general/apply_decision/REGISTER_EXCUSED_ABSENCE/reject=false/return=false',
    'archive/archive/archive_officer/archive/ARCHIVE/reject=false/return=false'],
    'eight steps: exact order, unit, role, action, catalog action, reject/return flags');

  PERFORM public.h_assert((SELECT bool_and(s.processing_unit_id IS NOT NULL AND s.processing_role_id IS NOT NULL
        AND s.assignment_strategy = 'specific_user'
        AND s.config ->> 'authorization' = 'exactly_one_direct_assignee'
        AND NOT s.requires_payment AND NOT s.produces_document
        AND s.can_skip = (s.step_key = 'payment_confirmation'))
      FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_new)
    AND (SELECT count(*) = 0 FROM public.request_type_workflow_transitions t
      WHERE t.workflow_id = v_new AND t.action_result = 'skip'),
    'every step has unit + role, direct-assignee authorization, no ledger/document flag; no manual skip edge');
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

  PERFORM public.h_assert((SELECT count(*) = 17
        AND count(*) FILTER (WHERE t.is_default AND t.condition_schema = '{}'::jsonb) = 16
        AND count(*) FILTER (WHERE NOT t.is_default AND t.priority = 100
              AND t.condition_schema ->> 'code' = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED') = 1
        AND count(*) FILTER (WHERE t.action_result = 'reject' AND t.to_step_id IS NULL) = 5
        AND count(*) FILTER (WHERE t.action_result = 'return' AND t.to_step_id IS NULL) = 2
      FROM public.request_type_workflow_transitions t WHERE t.workflow_id = v_new),
    '17 transitions: 9 linear, ONE conditional no-fee branch, 5 reject exits, 2 return exits');
  PERFORM public.h_assert((SELECT fs.step_key = 'registrar_fee_referral' AND ts.step_key = 'payment_confirmation'
      FROM public.request_type_workflow_transitions t
      JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
      JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = v_new AND fs.step_key = 'registrar_fee_referral'
        AND t.action_result = 'reviewed' AND t.is_default),
    'the DEFAULT route after the registrar is payment confirmation (fail closed)');
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
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.request_workflow_transition_condition_catalog
      WHERE code = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED' AND is_active),
    'routing condition registered once in the closed catalog');

  -- surface: only the two RPCs are callable; the table and helpers are not
  PERFORM public.h_assert(
    NOT has_function_privilege('authenticated', 'public.b1_excused_absence_student_department(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.b1_excused_absence_paid_cycle_step(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.b1_excused_absence_step_decision_allowed(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.b1_excused_absence_before_step_action(uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.record_excused_absence_fee_decision(uuid,text,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_excused_absence_fee_decision(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.record_excused_absence_fee_decision(uuid,text,text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_excused_absence_fee_decision(uuid)', 'EXECUTE'),
    'internal helpers are not executable by anon/authenticated; only the two RPCs are exposed');
  PERFORM public.h_assert(
    NOT has_table_privilege('authenticated', 'public.excused_absence_fee_decisions', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.excused_absence_fee_decisions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.excused_absence_fee_decisions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.excused_absence_fee_decisions', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.excused_absence_fee_decisions', 'SELECT')
    AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.excused_absence_fee_decisions'::regclass),
    'fee-decision table: RLS on, no direct privilege for anon/authenticated');
  PERFORM public.h_assert(NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'excused_absence_fee_decisions'
        AND c.column_name ~* 'amount|currency|price|balance|invoice|receipt|paid'),
    'fee-decision table stores no amount / currency / receipt column');

  PERFORM public.h_assert(NOT EXISTS (
      SELECT 1 FROM public.h_eawf01_pre_apply_function_attrs b
      JOIN pg_proc p ON p.oid::regprocedure::text = b.signature
      WHERE p.proowner <> b.proowner OR p.prosecdef <> b.prosecdef OR p.provolatile <> b.provolatile
         OR p.proconfig::text IS DISTINCT FROM b.proconfig OR p.proacl::text IS DISTINCT FROM b.proacl),
    'owner / SECURITY DEFINER / volatility / search_path / ACL of every patched function preserved');
  PERFORM public.h_assert(
    position('EAWF01' in pg_get_functiondef('public.apply_b1_excused_absence_effect(uuid)'::regprocedure)) = 0
    AND position('EAWF01' in pg_get_functiondef('public.can_current_user_act_on_step(uuid,text)'::regprocedure)) = 0
    AND position('EAWF01' in pg_get_functiondef('public.user_matches_workflow_runtime_step(uuid)'::regprocedure)) = 0,
    'effect function, authorization gate and assignee matcher were NOT modified');
END $$;

-- ---------------------------------------------------------------------------
-- 2. FEE_REQUIRED branch — CS student, full lifecycle, full matrix per step
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000001';
  v_res jsonb; v_total integer := 0; v_err text; v_n public.notifications%ROWTYPE;
  v_owner constant uuid := '11111111-1111-1111-1111-000000000010';
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

  v_total := v_total + public.h_matrix_step(v_req, 'dean_review', v_dean, 'review', 'act', ARRAY['reject','return']);
  v_total := v_total + public.h_matrix_step(v_req, 'registrar_fee_referral', v_registrar, 'review',
    'fee:FEE_REQUIRED', ARRAY['reject','return']);

  PERFORM public.h_assert((SELECT status = 'active' FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND step_key = 'payment_confirmation')
    AND (SELECT count(*) = 5 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'pending'),
    'FEE_REQUIRED: the request waits on payment confirmation; no signature step is reachable');
  PERFORM public.h_assert((SELECT d.decision = 'FEE_REQUIRED' AND d.exemption_reason IS NULL
        AND d.decided_by = v_registrar AND d.runtime_step_id = public.h_step(v_req, 'registrar_fee_referral')
      FROM public.excused_absence_fee_decisions d WHERE d.request_id = v_req),
    'fee decision stored once, attributed to the registrar');

  -- exactly one notification, only to the request's student
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.h_notifications(v_req)),
    'FEE_REQUIRED: exactly one notification for the request');
  SELECT * INTO v_n FROM public.h_notifications(v_req) LIMIT 1;
  PERFORM public.h_assert(v_n.user_id = v_owner AND v_n.notification_type = 'request'
    AND v_n.message LIKE '%النظام الجامعي الرئيسي%' AND v_n.message LIKE '%SR-TESTONLY-EAWF01-CS%'
    AND v_n.message LIKE '%لا يتم أي سداد داخل البوابة%'
    AND v_n.message NOT LIKE '%طالب اختبار%' AND v_n.message NOT LIKE '%TESTONLY-P1-APPEAL%',
    'FEE_REQUIRED notification: addressed to the student only, says where to pay, carries no personal data');
  PERFORM public.h_assert((SELECT count(*) = 0 FROM public.notifications n
      WHERE n.reference_id = v_req AND n.user_id <> v_owner), 'no staff member or other student was notified');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.student_request_workflow_events e
      WHERE e.student_request_id = v_req AND e.event_type = 'fee_decision_recorded' AND e.visible_to_student
        AND e.actor_user_id = v_registrar AND e.payload ->> 'decision' = 'FEE_REQUIRED'),
    'fee decision is in the audit trail, visible to the student');

  -- the decision is immutable
  PERFORM set_config('harness.uid', v_registrar::text, false);
  BEGIN
    UPDATE public.excused_absence_fee_decisions SET decision = 'FEE_NOT_REQUIRED', exemption_reason = 'EXEMPTION'
    WHERE request_id = v_req;
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE '%B1_EXCUSED_ABSENCE_FEE_DECISION_IS_IMMUTABLE%', 'decision cannot be updated: ' || v_err);
  BEGIN
    DELETE FROM public.excused_absence_fee_decisions WHERE request_id = v_req;
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE '%B1_EXCUSED_ABSENCE_FEE_DECISION_IS_IMMUTABLE%', 'decision cannot be deleted: ' || v_err);
  BEGIN
    INSERT INTO public.excused_absence_fee_decisions (request_id, runtime_step_id, decision, decided_by)
    VALUES ('99999999-9999-9999-9999-000000000002', public.h_step(v_req, 'dean_review'), 'FEE_REQUIRED', v_registrar);
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE '%B1_EXCUSED_ABSENCE_FEE_DECISION_RPC_REQUIRED%',
    'a decision cannot be inserted outside the RPC: ' || v_err);
  PERFORM public.h_assert(public.h_try(v_registrar, 'fee', public.h_step(v_req, 'registrar_fee_referral'),
      'FEE_NOT_REQUIRED:EXEMPTION') <> 'OK'
    AND (SELECT decision = 'FEE_REQUIRED' FROM public.excused_absence_fee_decisions WHERE request_id = v_req),
    'the registrar cannot change the decision after the step completed');

  v_total := v_total + public.h_matrix_step(v_req, 'payment_confirmation', v_finance, 'confirm_payment', 'pay');
  v_total := v_total + public.h_matrix_step(v_req, 'department_head_signature', v_head_cs, 'approve', 'act', ARRAY['reject']);
  v_total := v_total + public.h_matrix_step(v_req, 'dean_signature', v_dean, 'approve', 'act', ARRAY['reject']);
  v_total := v_total + public.h_matrix_step(v_req, 'student_affairs_manager_signature', v_sa_manager, 'approve', 'act', ARRAY['reject']);

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
  PERFORM public.h_assert((SELECT status = 'completed' AND completed_at IS NOT NULL AND rejection_reason IS NULL
      FROM public.student_requests WHERE id = v_req), 'archive closes the request');
  PERFORM public.h_assert((SELECT count(*) = 8 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'completed')
    AND (SELECT count(*) = 1 FROM public.student_excused_absences WHERE absence_excuse_request_id = v_req)
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_events
      WHERE student_request_id = v_req AND event_type = 'academic_effect_applied'),
    'all eight steps completed; the academic effect was not applied twice');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.h_notifications(v_req))
    AND (SELECT count(*) = 0 FROM public.student_request_fee_assessments),
    'still exactly one notification; no fee-assessment / ledger row was ever written');
  RAISE NOTICE 'ok: FEE_REQUIRED lifecycle — % denials proven across 8 steps', v_total;
END $$;

-- ---------------------------------------------------------------------------
-- 3. FEE_NOT_REQUIRED branch — IS student: payment is skipped, finance has
--    nothing to confirm, the signature belongs to the IS head only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000002';
  v_owner constant uuid := '11111111-1111-1111-1111-000000000012';
  v_finance constant uuid := '11111111-1111-1111-1111-000000000003';
  v_pay uuid; v_res text; v_total integer := 0; v_n public.notifications%ROWTYPE; v_before text;
BEGIN
  PERFORM public.h_new_absence_request(v_req, '77777777-7777-7777-7777-000000000002',
    'SR-TESTONLY-EAWF01-IS', DATE '2026-10-02');
  PERFORM public.h_assert((SELECT s.assigned_position_assignment_id = '55555555-5555-5555-5555-000000000002'
      FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = v_req AND s.step_key = 'department_head_signature'),
    'IS student: signature step bound to the IS department head');
  v_pay := public.h_step(v_req, 'payment_confirmation');

  v_total := v_total + public.h_matrix_step(v_req, 'dean_review', '11111111-1111-1111-1111-000000000011',
    'review', 'act', ARRAY['reject','return']);
  v_total := v_total + public.h_matrix_step(v_req, 'registrar_fee_referral', '11111111-1111-1111-1111-000000000004',
    'review', 'fee:FEE_NOT_REQUIRED:EXEMPTION', ARRAY['reject','return']);

  PERFORM public.h_assert((SELECT status = 'skipped' AND decision = 'skipped' AND completed_by IS NULL
      FROM public.student_request_workflow_steps WHERE id = v_pay)
    AND (SELECT status = 'active' FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND step_key = 'department_head_signature'),
    'FEE_NOT_REQUIRED: payment_confirmation is skipped and the request is at the department-head signature');
  PERFORM public.h_assert((SELECT d.decision = 'FEE_NOT_REQUIRED' AND d.exemption_reason = 'EXEMPTION'
      FROM public.excused_absence_fee_decisions d WHERE d.request_id = v_req),
    'no-fee decision stored with its mandatory reason');

  -- finance cannot confirm a payment that was not required — by any route
  v_before := public.h_request_state(v_req);
  v_res := public.h_try(v_finance, 'pay', v_pay, NULL);
  PERFORM public.h_assert(v_res LIKE '%INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP%',
    'finance cannot confirm a payment that was not required: ' || v_res);
  PERFORM public.h_assert(public.h_try(v_finance, 'act', v_pay, 'confirm_payment') <> 'OK'
    AND public.h_try(v_finance, 'act', v_pay, 'approve') <> 'OK'
    AND public.h_try(v_finance, 'pay', public.h_step(v_req, 'department_head_signature'), NULL) <> 'OK'
    AND public.h_request_state(v_req) = v_before,
    'finance has no action anywhere on a no-fee request (zero mutation)');

  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.h_notifications(v_req)),
    'FEE_NOT_REQUIRED: exactly one notification for the request');
  SELECT * INTO v_n FROM public.h_notifications(v_req) LIMIT 1;
  PERFORM public.h_assert(v_n.user_id = v_owner AND v_n.message LIKE '%لا يستلزم سداد رسوم%'
    AND v_n.message LIKE '%إعفاء%' AND v_n.message NOT LIKE '%النظام الجامعي الرئيسي%',
    'no-fee notification: addressed to the student only, states that no payment is needed and why');

  -- read side
  PERFORM set_config('harness.uid', v_owner::text, false);
  PERFORM public.h_assert(public.get_excused_absence_fee_decision(v_req) ->> 'decision' = 'FEE_NOT_REQUIRED'
    AND public.get_excused_absence_fee_decision(v_req) ->> 'exemptionReason' = 'EXEMPTION'
    AND NOT (public.get_excused_absence_fee_decision(v_req) ? 'decidedBy'),
    'the owning student reads the decision (no staff identity exposed)');
  PERFORM set_config('harness.uid', '11111111-1111-1111-1111-000000000010', false);
  PERFORM public.h_assert(public.get_excused_absence_fee_decision(v_req) IS NULL, 'another student reads nothing');
  PERFORM set_config('harness.uid', '11111111-1111-1111-1111-000000000014', false);
  PERFORM public.h_assert(public.get_excused_absence_fee_decision(v_req) IS NULL, 'an unassigned admin reads nothing');
  PERFORM set_config('harness.uid', '11111111-1111-1111-1111-000000000006', false);
  PERFORM public.h_assert(public.get_excused_absence_fee_decision(v_req) IS NULL,
    'the head of another department reads nothing');
  PERFORM set_config('harness.uid', '11111111-1111-1111-1111-000000000007', false);
  PERFORM public.h_assert(public.get_excused_absence_fee_decision(v_req) ->> 'decision' = 'FEE_NOT_REQUIRED',
    'a direct assignee of this request reads the decision');
  PERFORM set_config('harness.uid', '', false);
  PERFORM public.h_assert(public.get_excused_absence_fee_decision(v_req) IS NULL, 'anonymous reads nothing');

  -- the matrix denies the CS head (…06) and allows only the IS head (…07)
  v_total := v_total + public.h_matrix_step(v_req, 'department_head_signature', '11111111-1111-1111-1111-000000000007',
    'approve', 'act', ARRAY['reject']);
  v_total := v_total + public.h_matrix_step(v_req, 'dean_signature', '11111111-1111-1111-1111-000000000011',
    'approve', 'act', ARRAY['reject']);
  v_total := v_total + public.h_matrix_step(v_req, 'student_affairs_manager_signature', '11111111-1111-1111-1111-000000000002',
    'approve', 'act', ARRAY['reject']);
  v_total := v_total + public.h_matrix_step(v_req, 'record_apply', '11111111-1111-1111-1111-000000000004', 'apply_decision');
  v_total := v_total + public.h_matrix_step(v_req, 'archive', '11111111-1111-1111-1111-000000000005', 'archive');

  PERFORM public.h_assert((SELECT status = 'completed' FROM public.student_requests WHERE id = v_req)
    AND (SELECT count(*) = 7 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'completed')
    AND (SELECT status = 'skipped' FROM public.student_request_workflow_steps WHERE id = v_pay)
    AND (SELECT count(*) = 1 FROM public.student_excused_absences WHERE absence_excuse_request_id = v_req)
    AND (SELECT count(*) = 1 FROM public.h_notifications(v_req)),
    'no-fee request completes: 7 steps done, payment skipped, excuse recorded once, one notification');
  RAISE NOTICE 'ok: FEE_NOT_REQUIRED lifecycle — % denials proven across 7 steps', v_total;
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
  PERFORM public.h_assert(v_err LIKE 'B1_EXCUSED_ABSENCE_STUDENT_DEPARTMENT_REQUIRED: لا يمكن تقديم طلب غياب بعذر قبل تسجيل قسمك العلمي%',
    'student without a department gets a student-facing Arabic eligibility message: ' || v_err);

  BEGIN
    PERFORM public.h_new_absence_request('99999999-9999-9999-9999-000000000006',
      '77777777-7777-7777-7777-000000000006', 'SR-TESTONLY-EAWF01-NOHEAD', DATE '2026-10-06');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_EXCUSED_ABSENCE_DEPARTMENT_HEAD_ASSIGNMENT_REQUIRED: لا يوجد رئيس قسم واحد فعّال%',
    'department without a head fails closed with a staff-facing message (no fallback to another head): ' || v_err);

  PERFORM public.h_assert((SELECT count(*) = 0 FROM public.student_requests
      WHERE id IN ('99999999-9999-9999-9999-000000000003','99999999-9999-9999-9999-000000000006'))
    AND (SELECT count(*) = 0 FROM public.student_request_workflow_steps
      WHERE student_request_id IN ('99999999-9999-9999-9999-000000000003','99999999-9999-9999-9999-000000000006')),
    'failed initializations left no request and no runtime step behind');
END $$;

-- ---------------------------------------------------------------------------
-- 5. RETURN to the student, resubmission, REJECT (FREE_SERVICE branch)
--    Each phase is its own transaction, as in production.
-- ---------------------------------------------------------------------------
DO $$  -- 5a. return at dean_review
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000008';
  v_owner constant uuid := '11111111-1111-1111-1111-000000000010';
  v_dean constant uuid := '11111111-1111-1111-1111-000000000011';
  v_step uuid; v_res text; v_n public.notifications%ROWTYPE; v_before text; v_actor uuid;
BEGIN
  PERFORM public.h_new_absence_request(v_req, '77777777-7777-7777-7777-000000000001',
    'SR-TESTONLY-EAWF01-RETURN', DATE '2026-10-08');
  v_step := public.h_step(v_req, 'dean_review');

  -- the complete denial matrix, including return/reject by everyone else and
  -- reason-less return/reject by the dean, leaves the step active
  PERFORM public.h_matrix_step(v_req, 'dean_review', v_dean, 'review', 'none', ARRAY['reject','return']);

  v_res := public.h_try(v_dean, 'act', v_step, 'return', 'المرفق غير واضح، أعد رفع التقرير الطبي');
  PERFORM public.h_assert(v_res = 'OK', 'dean returns the request to the student with a reason: ' || v_res);
  PERFORM public.h_assert((SELECT status = 'returned' AND decision = 'returned' AND completed_by = v_dean
        AND comment = 'المرفق غير واضح، أعد رفع التقرير الطبي'
      FROM public.student_request_workflow_steps WHERE id = v_step)
    AND (SELECT status = 'returned_for_completion' AND completed_at IS NULL
        AND rejection_reason = 'المرفق غير واضح، أعد رفع التقرير الطبي'
      FROM public.student_requests WHERE id = v_req)
    AND (SELECT count(*) = 0 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'active'),
    'return: step returned, request returned_for_completion, reason stored, no active step');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.student_request_workflow_events e
      WHERE e.student_request_id = v_req AND e.event_type = 'returned' AND e.actor_user_id = v_dean
        AND e.visible_to_student AND e.message_ar = 'المرفق غير واضح، أعد رفع التقرير الطبي'),
    'return is in the audit trail with actor and reason');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.h_notifications(v_req)),
    'return: exactly one notification');
  SELECT * INTO v_n FROM public.h_notifications(v_req) LIMIT 1;
  PERFORM public.h_assert(v_n.user_id = v_owner AND v_n.title = 'طلب غياب بعذر يحتاج استكمال'
    AND v_n.message LIKE '%المرفق غير واضح%' AND v_n.message LIKE '%SR-TESTONLY-EAWF01-RETURN%',
    'return notification: to the student only, with the reason');

  -- while returned, nobody can act on anything
  v_before := public.h_request_state(v_req);
  FOREACH v_actor IN ARRAY ARRAY[v_dean, '11111111-1111-1111-1111-000000000004'::uuid,
                                 '11111111-1111-1111-1111-000000000003'::uuid, v_owner] LOOP
    PERFORM public.h_check(public.h_try(v_actor, 'act', v_step, 'review') <> 'OK'
      AND public.h_try(v_actor, 'act', v_step, 'return') <> 'OK'
      AND public.h_try(v_actor, 'act', v_step, 'reject') <> 'OK'
      AND public.h_try(v_actor, 'fee', public.h_step(v_req, 'registrar_fee_referral'), 'FEE_REQUIRED') <> 'OK',
      'returned request is frozen for ' || v_actor);
  END LOOP;
  PERFORM public.h_assert(public.h_request_state(v_req) = v_before, 'a returned request is frozen for staff (zero mutation)');
  PERFORM set_config('harness.uid', '', false);
END $$;

DO $$  -- 5b. resubmit -> dean again -> return at the registrar step
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000008';
  v_dean constant uuid := '11111111-1111-1111-1111-000000000011';
  v_registrar constant uuid := '11111111-1111-1111-1111-000000000004';
  v_json jsonb; v_res text;
BEGIN
  v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
  PERFORM public.h_assert((v_json ->> 'resumed')::boolean
    AND (v_json ->> 'active_step_id')::uuid = public.h_step(v_req, 'dean_review')
    AND (SELECT status = 'active' AND completed_by IS NULL AND comment IS NULL AND decision IS NULL
      FROM public.student_request_workflow_steps WHERE id = public.h_step(v_req, 'dean_review'))
    AND (SELECT count(*) = 7 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'pending'),
    'resubmission resumes at dean_review on the same version; the other seven steps are pending');
  PERFORM public.h_assert((SELECT count(DISTINCT s.workflow_id) = 1 AND bool_and(w.version = 3)
      FROM public.student_request_workflow_steps s JOIN public.request_type_workflows w ON w.id = s.workflow_id
      WHERE s.student_request_id = v_req), 'same workflow version after resubmission');

  PERFORM public.h_matrix_step(v_req, 'dean_review', v_dean, 'review', 'act', ARRAY['reject','return']);
  v_res := public.h_try(v_registrar, 'act', public.h_step(v_req, 'registrar_fee_referral'), 'return',
    'تاريخ الغياب لا يطابق المرفق');
  PERFORM public.h_assert(v_res = 'OK', 'registrar returns the request instead of deciding the fee: ' || v_res);
  PERFORM public.h_assert((SELECT status = 'returned_for_completion' FROM public.student_requests WHERE id = v_req)
    AND (SELECT count(*) = 0 FROM public.excused_absence_fee_decisions WHERE request_id = v_req)
    AND (SELECT count(*) = 2 FROM public.h_notifications(v_req)),
    'returned from the registrar step: no fee decision recorded, one more return notification');
  PERFORM set_config('harness.uid', '', false);
END $$;

DO $$  -- 5c. resubmit RESTARTS at dean_review; department scope is re-validated
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000008';
  v_student constant uuid := '77777777-7777-7777-7777-000000000001';
  v_json jsonb; v_err text;
BEGIN
  UPDATE public.student_profiles SET department_id = '22222222-2222-2222-2222-000000000002' WHERE id = v_student;
  BEGIN
    v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_RUNTIME_RESUBMIT_CONTRACT_INVALID%',
    'resubmit is refused when the stored head is no longer the student''s department head: ' || v_err);
  UPDATE public.student_profiles SET department_id = '22222222-2222-2222-2222-000000000001' WHERE id = v_student;

  v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
  PERFORM public.h_assert((v_json ->> 'resumed')::boolean
    AND (v_json ->> 'active_step_id')::uuid = public.h_step(v_req, 'dean_review')
    AND (SELECT status = 'active' AND completed_by IS NULL AND completed_at IS NULL
      FROM public.student_request_workflow_steps WHERE id = public.h_step(v_req, 'dean_review'))
    AND (SELECT status = 'pending' AND completed_by IS NULL AND comment IS NULL
      FROM public.student_request_workflow_steps WHERE id = public.h_step(v_req, 'registrar_fee_referral'))
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'active')
    AND (SELECT count(*) = 7 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'pending'),
    'resubmission after a registrar return RESTARTS at dean_review (dean must review again)');
  PERFORM public.h_assert((SELECT count(*) = 2 FROM public.student_request_workflow_events e
      WHERE e.student_request_id = v_req AND e.event_type = 'returned')
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_events e
      WHERE e.student_request_id = v_req AND e.event_type = 'reviewed'),
    'the earlier cycle stays in the audit trail after the restart');
END $$;

DO $$  -- 5d. dean -> registrar FREE_SERVICE -> department head REJECTS
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000008';
  v_owner constant uuid := '11111111-1111-1111-1111-000000000010';
  v_head constant uuid := '11111111-1111-1111-1111-000000000006';
  v_sig uuid; v_res text; v_before text; v_err text; v_json jsonb; v_row record; v_n public.notifications%ROWTYPE;
BEGIN
  PERFORM public.h_matrix_step(v_req, 'dean_review', '11111111-1111-1111-1111-000000000011', 'review', 'act', ARRAY['reject','return']);
  PERFORM public.h_matrix_step(v_req, 'registrar_fee_referral', '11111111-1111-1111-1111-000000000004', 'review',
    'fee:FEE_NOT_REQUIRED:FREE_SERVICE', ARRAY['reject','return']);
  PERFORM public.h_assert((SELECT message LIKE '%خدمة مجانية%' FROM public.h_notifications(v_req)
      ORDER BY created_at DESC, id DESC LIMIT 1) IS NOT FALSE
    AND (SELECT count(*) = 1 FROM public.notifications n WHERE n.reference_id = v_req AND n.message LIKE '%خدمة مجانية%'),
    'FREE_SERVICE decision notified once with its reason');

  v_sig := public.h_step(v_req, 'department_head_signature');
  PERFORM public.h_matrix_step(v_req, 'department_head_signature', v_head, 'approve', 'none', ARRAY['reject']);
  PERFORM public.h_assert(public.h_try(v_head, 'act', v_sig, 'return', 'يحتاج استكمال') LIKE '%B1_ACTION_TYPE_MISMATCH%',
    'a signature step cannot return the request to the student');

  v_res := public.h_try(v_head, 'act', v_sig, 'reject', 'العذر غير مقبول وفق لائحة القسم');
  PERFORM public.h_assert(v_res = 'OK', 'the department head rejects with a reason: ' || v_res);
  PERFORM public.h_assert((SELECT status = 'rejected' AND completed_at IS NOT NULL
        AND rejection_reason = 'العذر غير مقبول وفق لائحة القسم'
      FROM public.student_requests WHERE id = v_req)
    AND (SELECT status = 'rejected' AND completed_by = v_head FROM public.student_request_workflow_steps WHERE id = v_sig)
    AND (SELECT count(*) = 0 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'active')
    AND (SELECT count(*) = 0 FROM public.student_excused_absences WHERE absence_excuse_request_id = v_req)
    AND (SELECT record_applied_at IS NULL FROM public.absence_excuse_details WHERE request_id = v_req),
    'reject: request rejected (terminal), reason stored, no active step, NO excuse recorded');
  PERFORM public.h_assert((SELECT count(*) = 1 FROM public.student_request_workflow_events e
      WHERE e.student_request_id = v_req AND e.event_type = 'rejected' AND e.actor_user_id = v_head
        AND e.message_ar = 'العذر غير مقبول وفق لائحة القسم'),
    'reject is in the audit trail with actor and reason');
  SELECT * INTO v_n FROM public.notifications n
  WHERE n.reference_id = v_req AND n.title LIKE 'تم رفض طلب%';
  PERFORM public.h_assert(v_n.user_id = v_owner AND v_n.title = 'تم رفض طلب غياب بعذر'
    AND v_n.message = 'سبب الرفض: العذر غير مقبول وفق لائحة القسم'
    AND (SELECT count(*) = 1 FROM public.notifications n WHERE n.reference_id = v_req AND n.title LIKE 'تم رفض طلب%')
    AND (SELECT count(*) = 4 FROM public.h_notifications(v_req))
    AND (SELECT count(*) = 0 FROM public.notifications n WHERE n.reference_id = v_req AND n.user_id <> v_owner),
    'reject: exactly one rejection notification, Arabic service name, reason, student only');

  -- immutable after the terminal reject
  v_before := public.h_request_state(v_req);
  FOR v_row IN
    SELECT s.id, c.action_type, a.uid
    FROM public.student_request_workflow_steps s
    JOIN public.request_type_workflow_steps c ON c.id = s.workflow_step_id
    CROSS JOIN (VALUES ('11111111-1111-1111-1111-000000000011'::uuid), ('11111111-1111-1111-1111-000000000004'::uuid),
                       ('11111111-1111-1111-1111-000000000006'::uuid), ('11111111-1111-1111-1111-000000000002'::uuid),
                       ('11111111-1111-1111-1111-000000000003'::uuid), ('11111111-1111-1111-1111-000000000005'::uuid),
                       ('11111111-1111-1111-1111-000000000014'::uuid), ('11111111-1111-1111-1111-000000000010'::uuid)) AS a(uid)
    WHERE s.student_request_id = v_req
  LOOP
    PERFORM public.h_check(public.h_try(v_row.uid, 'act', v_row.id, v_row.action_type) <> 'OK'
      AND public.h_try(v_row.uid, 'act', v_row.id, 'reject') <> 'OK'
      AND public.h_try(v_row.uid, 'act', v_row.id, 'return') <> 'OK'
      AND public.h_try(v_row.uid, 'pay', v_row.id, NULL) <> 'OK'
      AND public.h_try(v_row.uid, 'fee', v_row.id, 'FEE_REQUIRED') <> 'OK',
      'rejected request is immutable');
  END LOOP;
  BEGIN
    v_json := public.initialize_b1_request_workflow_strict(v_req, 'excused_absence');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM public.h_assert(v_err LIKE 'B1_RUNTIME_RESUBMIT_STATE_INVALID%'
    AND public.h_request_state(v_req) = v_before,
    'a rejected request is immutable: no action by anyone, no resubmission (' || v_err || ')');
  PERFORM set_config('harness.uid', '', false);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Department changes while payment is pending: activation re-resolves the
--    scope and refuses a stale head
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req constant uuid := '99999999-9999-9999-9999-000000000007';
  v_student constant uuid := '77777777-7777-7777-7777-000000000007';
  v_pay uuid; v_res text; v_before text;
BEGIN
  PERFORM public.h_new_absence_request(v_req, v_student, 'SR-TESTONLY-EAWF01-MOVED', DATE '2026-10-07');
  PERFORM public.h_check(public.h_try('11111111-1111-1111-1111-000000000011','act',
    public.h_step(v_req,'dean_review'),'review') = 'OK', 'moved: dean review');
  PERFORM public.h_check(public.h_try('11111111-1111-1111-1111-000000000004','fee',
    public.h_step(v_req,'registrar_fee_referral'),'FEE_REQUIRED') = 'OK', 'moved: registrar fee decision');
  v_pay := public.h_step(v_req, 'payment_confirmation');

  UPDATE public.student_profiles SET department_id = '22222222-2222-2222-2222-000000000002' WHERE id = v_student;
  v_before := public.h_request_state(v_req);
  v_res := public.h_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, NULL);
  PERFORM public.h_assert(v_res LIKE 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:department_head_signature%',
    'stale department head is never activated after a department change: ' || v_res);
  PERFORM public.h_assert(public.h_request_state(v_req) = v_before,
    'the rejected activation rolled the payment confirmation back (zero mutation)');

  UPDATE public.student_profiles SET department_id = '22222222-2222-2222-2222-000000000001' WHERE id = v_student;
  PERFORM public.h_assert(public.h_try('11111111-1111-1111-1111-000000000003', 'pay', v_pay, NULL) = 'OK',
    'with the original department restored, payment confirmation activates the signature step');
  PERFORM public.h_assert(
    public.h_try('11111111-1111-1111-1111-000000000007','act', public.h_step(v_req,'department_head_signature'), 'approve') <> 'OK'
    AND public.h_try('11111111-1111-1111-1111-000000000006','act', public.h_step(v_req,'department_head_signature'), 'approve') = 'OK',
    'other department head denied, the student''s department head allowed');
  PERFORM set_config('harness.uid', '', false);
END $$;

-- ---------------------------------------------------------------------------
-- 7. In-flight requests keep running on the retired free cycle, untouched —
--    no payment, no fee decision, and NO reject / return (old behaviour)
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
  PERFORM public.h_assert((SELECT bool_and(c.can_reject AND c.can_return_to_student)
      FROM public.request_type_workflow_steps c WHERE c.workflow_id = v_old),
    'the retired cycle still carries can_reject / can_return flags (as deployed)…');

  -- …yet p_exits = {} : reject / return stay refused for its exact assignees,
  -- exactly as before this package. The dean is among the denied principals.
  v_total := v_total + public.h_matrix_step(v_req, 'student_affairs_intake', '11111111-1111-1111-1111-000000000001', 'review');
  v_total := v_total + public.h_matrix_step(v_req, 'manager_review', '11111111-1111-1111-1111-000000000002', 'approve');
  v_total := v_total + public.h_matrix_step(v_req, 'record_apply', '11111111-1111-1111-1111-000000000001', 'apply_decision');

  PERFORM public.h_assert((SELECT status = 'completed' FROM public.student_requests WHERE id = v_req)
    AND (SELECT count(*) = 3 FROM public.student_request_workflow_steps
      WHERE student_request_id = v_req AND status = 'completed')
    AND (SELECT count(*) = 1 FROM public.student_excused_absences
      WHERE absence_excuse_request_id = v_req AND absence_date = DATE '2026-09-01')
    AND (SELECT count(*) = 1 FROM public.student_request_workflow_events
      WHERE student_request_id = v_req AND event_type = 'academic_effect_applied')
    AND (SELECT count(*) = 0 FROM public.excused_absence_fee_decisions WHERE request_id = v_req)
    AND (SELECT count(*) = 0 FROM public.h_notifications(v_req)),
    'in-flight request completes on the old three steps: no payment, no fee decision, no signatures, excuse recorded once');
  RAISE NOTICE 'ok: in-flight lifecycle — % denials proven across 3 steps', v_total;
END $$;

-- Documented limitation (engine behaviour, NOT introduced by this package):
-- a request of the retired cycle that is returned to the student cannot be
-- resubmitted once another version is active — it fails closed. The deployed
-- engine has no return path for that cycle, so the state is simulated here.
DO $$
DECLARE
  v_req constant uuid := '88888888-8888-8888-8888-00000000000a';
  v_err text; v_json jsonb;
BEGIN
  PERFORM set_config('b1.atomic_action', '1', true);
  ALTER TABLE public.student_requests DISABLE TRIGGER trg_protect_student_request;
  UPDATE public.student_request_workflow_steps SET status = 'returned', decision = 'returned'
  WHERE student_request_id = v_req AND step_key = 'student_affairs_intake';
  UPDATE public.student_requests SET status = 'returned_for_completion' WHERE id = v_req;
  ALTER TABLE public.student_requests ENABLE TRIGGER trg_protect_student_request;
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
