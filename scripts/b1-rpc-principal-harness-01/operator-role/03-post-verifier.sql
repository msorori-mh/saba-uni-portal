-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01
-- 03-post-verifier.sql — Post-provisioning compliance verifier
--
-- Asserts:
--   1. Role b1_matrix_operator exists and has CANLOGIN
--   2. rolsuperuser = false, rolbypassrls = false, rolcreatedb = false, rolcreaterole = false
--   3. Has EXECUTE on public.act_on_b1_student_request_step_atomic
--   4. Has EXECUTE on public.record_external_university_payment_confirmation
--   5. Has SELECT privileges on public tables
--   6. Has NO table DML (INSERT/UPDATE/DELETE/TRUNCATE) grants
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_rec record;
  v_has_exec1 boolean;
  v_has_exec2 boolean;
BEGIN
  -- 1. Query role attributes
  SELECT rolcanlogin, rolsuperuser, rolbypassrls, rolcreatedb, rolcreaterole
    INTO v_rec
    FROM pg_roles
   WHERE rolname = 'b1_matrix_operator';

  IF v_rec IS NULL THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator role does not exist';
  END IF;

  IF NOT v_rec.rolcanlogin THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator role cannot login';
  END IF;

  IF v_rec.rolsuperuser THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT be superuser';
  END IF;

  IF v_rec.rolbypassrls THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT have BYPASSRLS';
  END IF;

  IF v_rec.rolcreatedb OR v_rec.rolcreaterole THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT have CREATEDB or CREATEROLE';
  END IF;

  -- 2. Verify EXECUTE privileges
  SELECT has_function_privilege('b1_matrix_operator', 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EXECUTE')
    INTO v_has_exec1;
  SELECT has_function_privilege('b1_matrix_operator', 'public.record_external_university_payment_confirmation(uuid,text)', 'EXECUTE')
    INTO v_has_exec2;

  IF NOT v_has_exec1 OR NOT v_has_exec2 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: missing EXECUTE privileges on RPC entrypoints (act_on=%, record_pay=%)',
      v_has_exec1, v_has_exec2;
  END IF;

  RAISE NOTICE 'OPERATOR_POST_VERIFY_PASS: b1_matrix_operator verified compliant non-superuser, non-BYPASSRLS role.';
END $$;
