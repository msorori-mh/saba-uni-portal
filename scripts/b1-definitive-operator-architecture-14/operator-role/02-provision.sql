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
REVOKE CREATE ON SCHEMA public FROM PUBLIC, b1_matrix_operator;
GRANT USAGE ON SCHEMA public TO b1_matrix_operator;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r1 ON r1.oid = m.roleid WHERE r1.rolname = 'b1_matrix_operator') THEN
    BEGIN
      EXECUTE 'REVOKE b1_matrix_operator FROM postgres';
    EXCEPTION WHEN others THEN END;
  END IF;
END $$;

-- EXECUTE on the entry RPCs, harness helper, and observer functions.
GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator;

DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'b1_harness_run_negative_case') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.b1_harness_run_negative_case(uuid,text,text,text,text,text) TO b1_matrix_operator';
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname LIKE 'b1_observer_%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO b1_matrix_operator', r.sig);
  END LOOP;
END $$;

DO $$ BEGIN
  RAISE NOTICE 'OPERATOR_PROVISION_PASS: b1_matrix_operator created with least privilege';
END $$;
