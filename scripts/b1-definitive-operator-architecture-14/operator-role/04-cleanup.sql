-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- operator-role/04-cleanup.sql
--
-- Explicit, bounded cleanup. No DROP OWNED.
--
-- Steps:
--   1. Verify no unexpected sessions remain for the operator.
--   2. Revoke EXECUTE on the two entry RPCs.
--   3. Revoke USAGE on schema public.
--   4. Drop the role.
--   5. Verify OPERATOR_RESIDUE_TOTAL = 0.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_sessions int;
  v_role_exists boolean;
  v_residue int := 0;
BEGIN
  SELECT count(*) INTO v_sessions
    FROM pg_stat_activity
   WHERE usename = 'b1_matrix_operator';
  IF v_sessions > 0 THEN
    RAISE EXCEPTION 'HOLD_OPEN_OPERATOR_SESSIONS: % sessions remain for b1_matrix_operator', v_sessions;
  END IF;

  -- The ephemeral harness helper is owned by the provisioning role. Drop it
  -- before the operator role so the role drop is not blocked by a dependency.
  DROP FUNCTION IF EXISTS public.b1_harness_run_negative_case(uuid,text,text,text,text,text);

  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') INTO v_role_exists;
  IF v_role_exists THEN
    REVOKE EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) FROM b1_matrix_operator;
    REVOKE EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) FROM b1_matrix_operator;
    REVOKE USAGE ON SCHEMA public FROM b1_matrix_operator;
    DROP ROLE b1_matrix_operator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') THEN
    v_residue := v_residue + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid OR r.oid = m.member WHERE r.rolname = 'b1_matrix_operator') THEN
    v_residue := v_residue + 1;
  END IF;

  IF v_residue <> 0 THEN
    RAISE EXCEPTION 'OPERATOR_CLEANUP_FAIL: OPERATOR_RESIDUE_TOTAL = %', v_residue;
  END IF;

  RAISE NOTICE 'OPERATOR_CLEANUP_PASS: OPERATOR_RESIDUE_TOTAL = 0';
END $$;
