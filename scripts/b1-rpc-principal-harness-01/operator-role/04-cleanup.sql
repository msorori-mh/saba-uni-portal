-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01 (REMEDIATED LONGRUN-12)
-- 04-cleanup.sql — Revoke privileges, terminate sessions, and drop operator role cleanly
--
-- Safely cleans up b1_matrix_operator:
--   1. Inspects pg_stat_activity and terminates active sessions owned strictly by b1_matrix_operator
--   2. Revokes all routine, table, and schema privileges
--   3. Drops role b1_matrix_operator
--   4. Performs post-cleanup verification asserting OPERATOR_RESIDUE_TOTAL = 0
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_pid record;
  v_role_exists boolean;
  v_mem_count int;
  v_grant_count int;
  v_active_conn int;
  v_residue int := 0;
BEGIN
  -- 1. Inspect and terminate active sessions provably owned strictly by b1_matrix_operator
  FOR v_pid IN
    SELECT pid FROM pg_stat_activity
     WHERE usename = 'b1_matrix_operator' AND pid <> pg_backend_pid()
  LOOP
    RAISE NOTICE 'OPERATOR_CLEANUP: Terminating active operator test session pid=%', v_pid.pid;
    PERFORM pg_terminate_backend(v_pid.pid);
  END LOOP;

  -- Short pause to allow session backend exit
  PERFORM pg_sleep(0.1);

  -- 2. Revoke all privileges & drop role if present
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') INTO v_role_exists;

  IF v_role_exists THEN
    REVOKE EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) FROM b1_matrix_operator;
    REVOKE EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) FROM b1_matrix_operator;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM b1_matrix_operator;
    REVOKE ALL ON ALL TABLES IN SCHEMA supabase_migrations FROM b1_matrix_operator;
    REVOKE USAGE ON SCHEMA public FROM b1_matrix_operator;
    REVOKE USAGE ON SCHEMA supabase_migrations FROM b1_matrix_operator;
    DROP OWNED BY b1_matrix_operator;
    DROP ROLE b1_matrix_operator;
    RAISE NOTICE 'OPERATOR_CLEANUP: b1_matrix_operator role revoked and dropped.';
  ELSE
    RAISE NOTICE 'OPERATOR_CLEANUP: b1_matrix_operator role does not exist.';
  END IF;

  -- 3. Post-cleanup verification (OPERATOR_RESIDUE_TOTAL = 0)
  SELECT count(*) INTO v_active_conn
    FROM pg_roles WHERE rolname = 'b1_matrix_operator';
  IF v_active_conn > 0 THEN v_residue := v_residue + 1; END IF;

  SELECT count(*) INTO v_mem_count
    FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.roleid OR r.oid = m.member
   WHERE r.rolname = 'b1_matrix_operator';
  IF v_mem_count > 0 THEN v_residue := v_residue + v_mem_count; END IF;

  SELECT count(*) INTO v_active_conn
    FROM pg_stat_activity WHERE usename = 'b1_matrix_operator';
  IF v_active_conn > 0 THEN v_residue := v_residue + v_active_conn; END IF;

  IF v_residue <> 0 THEN
    RAISE EXCEPTION 'OPERATOR_CLEANUP_FAIL: Residual operator artifacts found! OPERATOR_RESIDUE_TOTAL=%', v_residue;
  END IF;

  RAISE NOTICE 'OPERATOR_CLEANUP_PASS: Zero residue verified. OPERATOR_RESIDUE_TOTAL = 0';
END $$;
