-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01
-- 04-cleanup.sql — Revoke privileges and drop operator role cleanly
--
-- Restores database privileges to pre-operator state and leaves zero residue.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') THEN
    REVOKE EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) FROM b1_matrix_operator;
    REVOKE EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) FROM b1_matrix_operator;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM b1_matrix_operator;
    REVOKE USAGE ON SCHEMA public FROM b1_matrix_operator;
    DROP ROLE b1_matrix_operator;
    RAISE NOTICE 'OPERATOR_CLEANUP_PASS: b1_matrix_operator role revoked and dropped cleanly with zero residue.';
  ELSE
    RAISE NOTICE 'OPERATOR_CLEANUP: b1_matrix_operator role does not exist.';
  END IF;
END $$;
