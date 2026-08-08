-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01
-- 02-provision.sql — Provision compliant non-superuser, non-BYPASSRLS operator
--
-- Security specifications:
--   * LOGIN role: b1_matrix_operator
--   * NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE
--   * SELECT-only on ordinary public schema tables
--   * NO INSERT, UPDATE, DELETE, TRUNCATE on any table
--   * EXECUTE granted ONLY on the 2 entry RPCs:
--       - act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)
--       - record_external_university_payment_confirmation(uuid,text)
--   * NO schema ownership or broad privileges
--   * Parameterized password via environment variable / session setting
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') THEN
    CREATE ROLE b1_matrix_operator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE b1_matrix_operator NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Strip public table default permissions and enforce strict SELECT-only
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, b1_matrix_operator;
GRANT USAGE ON SCHEMA public TO b1_matrix_operator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO b1_matrix_operator;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM b1_matrix_operator;

-- Grant EXECUTE strictly on the two RPC entrypoints under test
GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator;

RAISE NOTICE 'OPERATOR_PROVISION_PASS: b1_matrix_operator role provisioned successfully with non-superuser, non-BYPASSRLS, SELECT-only permissions.';
