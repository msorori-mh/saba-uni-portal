\set ON_ERROR_STOP on
-- LOCAL DISPOSABLE POSTGRES ONLY. Never point psql at production.
-- Required test-only fixture contract:
--   b1_authz_fixture_actor(case_name text) -> uuid
--   b1_authz_fixture_step(service text, step_key text) -> uuid
-- The fixture installer must create isolated rows and is intentionally not a migration.

BEGIN;

DO $guard$
BEGIN
  IF current_setting('b1.authorization_harness', true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'B1_AUTHORIZATION_HARNESS_LOCAL_ONLY';
  END IF;
  IF to_regprocedure('public.can_current_user_act_on_step(uuid,text)') IS NULL
     OR to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NULL
     OR to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NULL
  THEN
    RAISE EXCEPTION 'B1_PR219_RPC_CONTRACT_NOT_INSTALLED';
  END IF;
END
$guard$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);

CREATE TEMP TABLE b1_authz_matrix (
  service text NOT NULL,
  step_key text NOT NULL,
  unit_code text NOT NULL,
  role_code text NOT NULL,
  action text NOT NULL
) ON COMMIT DROP;

INSERT INTO b1_authz_matrix VALUES
 ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
 ('enrollment_suspension','manager_approval','student_affairs','student_affairs_manager','approve'),
 ('enrollment_suspension','registrar_apply','registrar','registrar_general','apply_decision'),
 ('excused_absence','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('excused_absence','manager_review','student_affairs','student_affairs_manager','approve'),
 ('excused_absence','record_apply','student_affairs','student_affairs_specialist','apply_decision'),
 ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('department_transfer','source_department_head_approval','department','department_head','approve'),
 ('department_transfer','target_department_head_approval','department','department_head','approve'),
 ('department_transfer','dean_approval','dean','dean','approve'),
 ('department_transfer','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
 ('department_transfer','registrar_apply','registrar','registrar_general','apply_decision'),
 ('final_chance','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('final_chance','manager_review','student_affairs','student_affairs_manager','approve'),
 ('final_chance','dean_decision','dean','dean','approve'),
 ('final_chance','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
 ('final_chance','registrar_apply','registrar','registrar_general','apply_decision'),
 ('file_withdrawal','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('file_withdrawal','library_clearance','library','library_officer','clear'),
 ('file_withdrawal','labs_clearance','labs','labs_manager','clear'),
 ('file_withdrawal','activities_clearance','student_affairs','student_affairs_manager','clear'),
 ('file_withdrawal','finance_clearance','finance','revenue_finance_officer','clear'),
 ('file_withdrawal','registrar_apply','registrar','registrar_general','apply_decision'),
 ('file_withdrawal','archive','archive','archive_officer','archive');

CREATE TEMP TABLE b1_authz_negative_cases(case_name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO b1_authz_negative_cases VALUES
 ('anon'),('request_owner_student'),('other_student'),('user_without_profile'),
 ('unassigned_employee'),('same_role_other_unit'),('other_department_head'),
 ('previous_step_actor'),('next_step_actor'),('unassigned_admin'),
 ('registrar_outside_step'),('dean_outside_step'),('inactive_assignment'),
 ('expired_assignment'),('duplicate_assignment'),('wrong_position_assignment'),
 ('forged_step_id'),('other_service_request'),('illegal_action'),
 ('incomplete_predecessor'),('completed_step_replay'),('direct_rpc_bypass');

-- Canonical snapshot helper: rejection tests compare every mutable surface.
CREATE OR REPLACE FUNCTION pg_temp.b1_snapshot(p_request_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'student_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_requests x WHERE x.id=p_request_id),
  'runtime_steps',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_workflow_steps x WHERE x.student_request_id=p_request_id),
  'service_details',jsonb_build_object(
    'enrollment_suspension_details',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.enrollment_suspension_details x WHERE x.request_id=p_request_id),
    'absence_excuse_details',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.absence_excuse_details x WHERE x.request_id=p_request_id),
    'transfer_request_details',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.transfer_request_details x WHERE x.request_id=p_request_id),
    'extra_chance_details',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.extra_chance_details x WHERE x.request_id=p_request_id),
    'file_withdrawal_details',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.file_withdrawal_details x WHERE x.request_id=p_request_id)
  ),
  'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_workflow_events x WHERE x.student_request_id=p_request_id),
  'revenue_confirmation',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_workflow_events x WHERE x.student_request_id=p_request_id AND x.event_type='payment_confirmed'),
  'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.student_request_attachment_uploads x WHERE x.student_request_id=p_request_id),
  'audit_logs',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.audit_logs x WHERE x.entity_id=p_request_id),
  'notifications',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.notifications x WHERE x.data->>'student_request_id'=p_request_id::text)
 )
$$;

-- The executor is supplied by the isolated fixture layer after PR #219 merge.
-- It must invoke the real RPC directly, catch the expected denial, and return
-- the same request id. This loop enforces full before/after equality.
DO $matrix$
DECLARE m record; n record; v_step uuid; v_request uuid; v_before jsonb; v_after jsonb;
BEGIN
  IF to_regprocedure('pg_temp.b1_authz_execute_denial(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'B1_TEST_FIXTURE_EXECUTOR_REQUIRED';
  END IF;
  FOR m IN SELECT * FROM b1_authz_matrix LOOP
    v_step := pg_temp.b1_authz_fixture_step(m.service,m.step_key);
    SELECT student_request_id INTO v_request
    FROM public.student_request_workflow_steps WHERE id=v_step;
    IF NOT public.can_current_user_act_on_step(v_step,m.action) THEN
      RAISE EXCEPTION 'B1_POSITIVE_CASE_FAILED:%:%',m.service,m.step_key;
    END IF;
    FOR n IN SELECT * FROM b1_authz_negative_cases LOOP
      v_before := pg_temp.b1_snapshot(v_request);
      PERFORM pg_temp.b1_authz_execute_denial(n.case_name,m.service,m.step_key);
      v_after := pg_temp.b1_snapshot(v_request);
      IF v_after IS DISTINCT FROM v_before THEN
        RAISE EXCEPTION 'B1_ZERO_MUTATION_FAILED:%:%:%',m.service,m.step_key,n.case_name;
      END IF;
    END LOOP;
  END LOOP;
END
$matrix$;

-- Revenue: only the exact assignee may call the two-argument RPC. Actor and
-- timestamp are server-derived; no rejection path and no client financial data.
DO $revenue$
DECLARE p text;
BEGIN
  SELECT pg_get_functiondef('public.record_external_university_payment_confirmation(uuid,text)'::regprocedure)
  INTO p;
  IF p ~* '\m(amount|currency|invoice|gateway|payment_reference|balance)\M'
     OR p ~* 'payment_not_confirmed'
     OR p !~ 'auth\.uid\(\)'
     OR p !~* 'now\(\)' THEN
    RAISE EXCEPTION 'B1_SIMPLIFIED_REVENUE_CONTRACT_FAILED';
  END IF;
END
$revenue$;

-- Protected enrollment-certificate identities must never be fixture targets.
DO $protected$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.student_requests
    WHERE request_number IN (
      'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8',
      'USR-2026-000001','USR-2026-000002'
    )
    AND id IN (SELECT student_request_id FROM public.student_request_workflow_steps
               WHERE step_name_ar LIKE 'B1_AUTHZ_FIXTURE:%')
  ) THEN
    RAISE EXCEPTION 'B1_PROTECTED_ENROLLMENT_CERTIFICATE_FIXTURE_COLLISION';
  END IF;
END
$protected$;

ROLLBACK;
