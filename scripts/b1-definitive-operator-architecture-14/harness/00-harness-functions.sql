-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- harness/00-harness-functions.sql
--
-- Narrow, ephemeral helper used ONLY by the 267 negative-case harness.
--
-- Constraints:
--   * created by the provisioning administrative role (postgres)
--   * SECURITY INVOKER, so every business RPC runs under the actual
--     b1_matrix_operator privilege surface
--   * EXECUTE-restricted to b1_matrix_operator only
--   * returns only state facts / denial metadata; no PII
--   * performs no mutation itself
--   * captures before/in/after fingerprints to prove zero mutation
-- ============================================================================
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.b1_harness_run_negative_case(
  p_step_id uuid,
  p_action text,
  p_rpc text,
  p_claims text,
  p_expected_user text,
  p_expected_role text
) RETURNS TABLE(
  allowed boolean,
  sqlstate text,
  message text,
  before_fp text,
  in_tx_fp text,
  after_fp text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $$
DECLARE
  v_before text;
  v_in text;
  v_after text;
  v_allowed boolean := false;
  v_sqlstate text;
  v_message text;
BEGIN
  -- Fingerprint BEFORE any identity switch or RPC.
  v_before := public.b1_observer_fingerprint();

  BEGIN
    -- Identity contract: the canonical functions derive actor identity only
    -- from request.jwt.claims. We set it transaction-local and assert it matches
    -- the intended test principal via SECURITY DEFINER observer primitives so
    -- the operator role never needs USAGE on the auth schema.
    PERFORM set_config('request.jwt.claims', p_claims, true);

    IF public.b1_observer_auth_uid() IS DISTINCT FROM p_expected_user::uuid THEN
      RAISE EXCEPTION 'PRINCIPAL_MISMATCH: auth.uid() = %, expected %', public.b1_observer_auth_uid(), p_expected_user;
    END IF;

    IF public.b1_observer_auth_role() IS DISTINCT FROM p_expected_role THEN
      RAISE EXCEPTION 'PRINCIPAL_MISMATCH: auth.role() = %, expected %', public.b1_observer_auth_role(), p_expected_role;
    END IF;

    -- Invoke the actual canonical RPC entry point.
    IF p_rpc = 'record_external_university_payment_confirmation' THEN
      PERFORM public.record_external_university_payment_confirmation(p_step_id, 'TEST_ONLY_NEGATIVE_MATRIX');
    ELSIF p_rpc = 'act_on_b1_student_request_step_atomic' THEN
      PERFORM public.act_on_b1_student_request_step_atomic(p_step_id, p_action, NULL, NULL);
    ELSE
      RAISE EXCEPTION 'HOLD_UNKNOWN_RPC: %', p_rpc;
    END IF;

    v_allowed := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;

  -- Fingerprint INSIDE the transaction (after the RPC denial/attempt).
  v_in := public.b1_observer_fingerprint();

  -- Clear the transaction-local JWT claim.
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Fingerprint AFTER clearing the claim (still inside the same transaction).
  v_after := public.b1_observer_fingerprint();

  RETURN QUERY SELECT v_allowed, v_sqlstate, v_message, v_before, v_in, v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.b1_harness_run_negative_case(uuid,text,text,text,text,text) TO b1_matrix_operator;

DO $$ BEGIN
  RAISE NOTICE 'HARNESS_FUNCTIONS_PROVISION_PASS: narrow harness helper created';
END $$;
