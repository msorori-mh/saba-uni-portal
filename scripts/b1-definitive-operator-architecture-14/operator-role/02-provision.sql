-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- operator-role/02-provision.sql
--
-- Create the least-privilege operator role from an ABSENT state.
--
-- Privilege surface:
--   * LOGIN only for harness connection
--   * NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT
--   * No role memberships
--   * No table ownership
--   * No broad table SELECT
--   * EXECUTE only on the two B1 entry RPCs
--
-- No USING(true) policies. No global REVOKE. No ALTER-to-compliance.
-- ============================================================================
\set ON_ERROR_STOP on

-- Fail-closed: create only from absent state. The preflight already proved absence.
CREATE ROLE b1_matrix_operator WITH
  LOGIN
  NOSUPERUSER
  NOBYPASSRLS
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOINHERIT
  CONNECTION LIMIT 10
  PASSWORD 'local-operator-not-a-secret';

-- Minimal schema usage needed to invoke the RPCs.
GRANT USAGE ON SCHEMA public TO b1_matrix_operator;

-- EXECUTE only on the two entry RPCs.
GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator;

DO $$ BEGIN
  RAISE NOTICE 'OPERATOR_PROVISION_PASS: b1_matrix_operator created with least privilege';
END $$;
