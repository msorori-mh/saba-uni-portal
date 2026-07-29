-- PORTAL-B1-FIVE-SERVICES-RPC-AUTHORIZATION-MATRIX-PRODUCTION-READONLY-PREFLIGHT-01
-- NEGATIVE ROLLBACK-ONLY AUTHORIZATION HARNESS — PREPARED, NOT EXECUTED.
--
-- Contract:
--   * One explicit transaction, unconditional ROLLBACK at the end.
--   * SET LOCAL ROLE authenticated + request.jwt.claims per actor.
--   * Direct RPC invocation (never the UI).
--   * Every case must DENY and must mutate zero business rows.
--   * Reads/writes are confined to the five TEST_ONLY requests.
--
-- Cases are driven by MATRIX.json:
--   negative_cases (240) + illegal_action_cases (24)
--   + supplemental_department_scope_cases (3) = 267 DENY assertions.
--
-- Execution of this file requires a SEPARATE write-adjacent approval, because
-- it opens a transaction against production even though it never commits.

BEGIN;

SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 0. Fixture pinning: the harness refuses to run on anything but the five
--    TEST_ONLY requests, and refuses if a protected record is in scope.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE b1_scope(request_number text primary key, request_id uuid) ON COMMIT DROP;
INSERT INTO b1_scope(request_number, request_id)
SELECT r.request_number, r.id FROM public.student_requests r
WHERE r.request_number IN (
  'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
  'SR-20260727-88D885F0','SR-20260727-695EC35B');

DO $$
BEGIN
  IF (SELECT count(*) FROM b1_scope) <> 5 THEN
    RAISE EXCEPTION 'B1_NEG_HARNESS_SCOPE_INVALID: expected exactly 5 TEST_ONLY requests';
  END IF;
  IF EXISTS (SELECT 1 FROM b1_scope WHERE request_number IN (
      'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8')) THEN
    RAISE EXCEPTION 'B1_NEG_HARNESS_PROTECTED_RECORD_IN_SCOPE';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Zero-mutation baseline snapshot (business surfaces only).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE b1_before AS
SELECT 'student_requests' AS rel, md5(string_agg(t::text, '|' ORDER BY t::text)) AS h
  FROM (SELECT r.* FROM public.student_requests r JOIN b1_scope s ON s.request_id = r.id) t
UNION ALL SELECT 'workflow_steps', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT w.* FROM public.student_request_workflow_steps w JOIN b1_scope s ON s.request_id = w.student_request_id) t
UNION ALL SELECT 'workflow_events', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT e.* FROM public.student_request_workflow_events e JOIN b1_scope s ON s.request_id = e.student_request_id) t
UNION ALL SELECT 'fee_assessments', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
UNION ALL SELECT 'attachment_uploads', md5(string_agg(t::text,'|' ORDER BY t::text))
  FROM (SELECT a.* FROM public.student_request_attachment_uploads a JOIN b1_scope s ON s.request_id = a.request_id) t
UNION ALL SELECT 'audit_logs_count', md5(count(*)::text) FROM public.audit_logs
UNION ALL SELECT 'notifications_count', md5(count(*)::text) FROM public.notifications
UNION ALL SELECT 'official_documents_count', md5(count(*)::text) FROM public.official_documents;

CREATE TEMP TABLE b1_results(
  case_name text, request_number text, step_key text, actor_user_id uuid,
  action text, expected text, observed text, sqlstate text, message text, verdict text);

-- ---------------------------------------------------------------------------
-- 2. Case driver: assume the identity, call the RPC directly, require DENY.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.b1_neg_case(
  p_case text, p_request_number text, p_step_key text,
  p_actor uuid, p_action text
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_step uuid;
  v_state text; v_msg text; v_verdict text := 'FAIL'; v_observed text := 'ALLOW';
BEGIN
  SELECT w.id INTO v_step
  FROM public.student_request_workflow_steps w
  JOIN b1_scope s ON s.request_id = w.student_request_id
  WHERE s.request_number = p_request_number AND w.step_key = p_step_key;

  -- Identity assumption. NULL actor == anonymous (no sub claim).
  PERFORM set_config('role','authenticated', true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_actor IS NULL THEN '{"role":"anon"}'
         ELSE json_build_object('sub', p_actor, 'role','authenticated')::text END, true);

  BEGIN
    IF p_action = 'confirm_payment' THEN
      PERFORM public.record_external_university_payment_confirmation(v_step, 'B1_NEG_HARNESS');
    ELSE
      PERFORM public.act_on_b1_student_request_step_atomic(v_step, p_action, 'B1_NEG_HARNESS', '{}'::jsonb);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_observed := 'DENY';
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  PERFORM set_config('role','none', true);
  RESET ROLE;

  IF v_observed = 'DENY' THEN v_verdict := 'PASS'; END IF;

  INSERT INTO b1_results VALUES (p_case, p_request_number, p_step_key, p_actor,
    p_action, 'DENY', v_observed, v_state, v_msg, v_verdict);
END $fn$;

-- ---------------------------------------------------------------------------
-- 3. Case list. Generated verbatim from MATRIX.json by
--    scripts/render-negative-cases.ts (267 pg_temp.b1_neg_case(...) calls).
--    << GENERATED_NEGATIVE_CASES >>
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Verdict + zero-mutation proof.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_fail int; v_total int; v_drift text;
BEGIN
  SELECT count(*) FILTER (WHERE verdict='FAIL'), count(*) INTO v_fail, v_total FROM b1_results;

  SELECT string_agg(a.rel, ',') INTO v_drift
  FROM b1_before a
  JOIN (
    SELECT 'student_requests' AS rel, md5(string_agg(t::text,'|' ORDER BY t::text)) AS h
      FROM (SELECT r.* FROM public.student_requests r JOIN b1_scope s ON s.request_id=r.id) t
    UNION ALL SELECT 'workflow_steps', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT w.* FROM public.student_request_workflow_steps w JOIN b1_scope s ON s.request_id=w.student_request_id) t
    UNION ALL SELECT 'workflow_events', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT e.* FROM public.student_request_workflow_events e JOIN b1_scope s ON s.request_id=e.student_request_id) t
    UNION ALL SELECT 'fee_assessments', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT f.* FROM public.student_request_fee_assessments f) t
    UNION ALL SELECT 'attachment_uploads', md5(string_agg(t::text,'|' ORDER BY t::text))
      FROM (SELECT a.* FROM public.student_request_attachment_uploads a JOIN b1_scope s ON s.request_id=a.request_id) t
    UNION ALL SELECT 'audit_logs_count', md5(count(*)::text) FROM public.audit_logs
    UNION ALL SELECT 'notifications_count', md5(count(*)::text) FROM public.notifications
    UNION ALL SELECT 'official_documents_count', md5(count(*)::text) FROM public.official_documents
  ) b ON b.rel = a.rel AND b.h IS DISTINCT FROM a.h;

  RAISE NOTICE 'B1_NEG_MATRIX total=% fail=% drift=%', v_total, v_fail, coalesce(v_drift,'NONE');
  IF v_fail > 0 THEN RAISE EXCEPTION 'B1_NEG_MATRIX_FAIL: % unauthorized ALLOW', v_fail; END IF;
  IF v_drift IS NOT NULL THEN RAISE EXCEPTION 'B1_NEG_MATRIX_MUTATION_DETECTED: %', v_drift; END IF;
END $$;

TABLE b1_results;

-- UNCONDITIONAL: this harness never commits.
ROLLBACK;
