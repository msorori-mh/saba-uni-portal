-- PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65
-- 42 — Negative authorization harness for the ISOLATED cluster.
-- One transaction, unconditional ROLLBACK, zero-mutation proof.
-- Every case must DENY through direct RPC invocation.

BEGIN;

SET LOCAL statement_timeout = '120s';

DO $guard$
BEGIN
  IF current_database() <> 'isodb' THEN
    RAISE EXCEPTION 'ISO_ENV_GUARD: refusing to run against database %', current_database();
  END IF;
END $guard$;

CREATE TEMP TABLE iso_scope(request_number text primary key, request_id uuid) ON COMMIT DROP;
INSERT INTO iso_scope SELECT r.request_number, r.id FROM public.student_requests r
WHERE r.request_number LIKE 'ISO-TESTONLY-%';

DO $$
BEGIN
  IF (SELECT count(*) FROM iso_scope) <> 24 THEN
    RAISE EXCEPTION 'ISO_SCOPE_INVALID: expected 24 TEST_ONLY fixtures, found %',
      (SELECT count(*) FROM iso_scope);
  END IF;
END $$;

CREATE TEMP TABLE iso_before AS
SELECT 'student_requests' AS rel, md5(string_agg(t::text,'|' ORDER BY t::text)) AS h
  FROM (SELECT r.* FROM public.student_requests r) t
UNION ALL SELECT 'workflow_steps', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT w.* FROM public.student_request_workflow_steps w) t
UNION ALL SELECT 'workflow_events', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT e.* FROM public.student_request_workflow_events e) t
UNION ALL SELECT 'fee_assessments', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
UNION ALL SELECT 'audit_logs_count', md5(count(*)::text) FROM public.audit_logs
UNION ALL SELECT 'notifications_count', md5(count(*)::text) FROM public.notifications;

CREATE TEMP TABLE iso_results(
  case_name text, request_number text, step_key text, actor_user_id uuid,
  action text, expected text, observed text, sqlstate text, message text, verdict text);

CREATE OR REPLACE FUNCTION pg_temp.iso_neg_case(
  p_case text, p_request_number text, p_step_key text, p_actor uuid, p_action text
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_step uuid; v_state text; v_msg text; v_observed text := 'ALLOW'; v_verdict text := 'FAIL';
BEGIN
  SELECT w.id INTO v_step
  FROM public.student_request_workflow_steps w
  JOIN iso_scope s ON s.request_id = w.student_request_id
  WHERE s.request_number = p_request_number AND w.step_key = p_step_key;

  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_actor IS NULL THEN '{"role":"anon"}'
         ELSE json_build_object('sub', p_actor, 'role', 'authenticated')::text END, true);

  BEGIN
    IF p_action = 'confirm_payment' THEN
      PERFORM public.record_external_university_payment_confirmation(v_step, 'ISO_NEG_HARNESS');
    ELSE
      PERFORM public.act_on_b1_student_request_step_atomic(v_step, p_action, 'ISO_NEG_HARNESS', '{}'::jsonb);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_observed := 'DENY';
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
  IF v_observed = 'DENY' THEN v_verdict := 'PASS'; END IF;

  INSERT INTO iso_results VALUES (p_case, p_request_number, p_step_key, p_actor,
    p_action, 'DENY', v_observed, v_state, v_msg, v_verdict);
END $fn$;

\ir 41-negative-cases.sql

DO $$
DECLARE v_fail int; v_total int; v_drift text;
BEGIN
  SELECT count(*) FILTER (WHERE verdict='FAIL'), count(*) INTO v_fail, v_total FROM iso_results;

  SELECT string_agg(a.rel, ',') INTO v_drift
  FROM iso_before a
  JOIN (
    SELECT 'student_requests' AS rel, md5(string_agg(t::text,'|' ORDER BY t::text)) AS h
      FROM (SELECT r.* FROM public.student_requests r) t
    UNION ALL SELECT 'workflow_steps', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT w.* FROM public.student_request_workflow_steps w) t
    UNION ALL SELECT 'workflow_events', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT e.* FROM public.student_request_workflow_events e) t
    UNION ALL SELECT 'fee_assessments', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
    UNION ALL SELECT 'audit_logs_count', md5(count(*)::text) FROM public.audit_logs
    UNION ALL SELECT 'notifications_count', md5(count(*)::text) FROM public.notifications
  ) b ON b.rel = a.rel AND b.h IS DISTINCT FROM a.h;

  RAISE NOTICE 'ISO_NEG_MATRIX total=% fail=% drift=%', v_total, v_fail, coalesce(v_drift,'NONE');
  IF v_total <> 267 THEN RAISE EXCEPTION 'ISO_NEG_MATRIX_COUNT_MISMATCH:%', v_total; END IF;
  IF v_fail > 0 THEN RAISE EXCEPTION 'ISO_NEG_MATRIX_FAIL: % unauthorized ALLOW', v_fail; END IF;
  IF v_drift IS NOT NULL THEN RAISE EXCEPTION 'ISO_NEG_MATRIX_MUTATION_DETECTED: %', v_drift; END IF;
END $$;

SELECT case_name, count(*) AS cases, count(*) FILTER (WHERE verdict='PASS') AS pass,
       count(*) FILTER (WHERE verdict='FAIL') AS fail
FROM iso_results GROUP BY case_name ORDER BY case_name;

SELECT sqlstate, count(*) FROM iso_results GROUP BY sqlstate ORDER BY 2 DESC;

ROLLBACK;
