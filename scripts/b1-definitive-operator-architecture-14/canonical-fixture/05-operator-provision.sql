-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- canonical-fixture/05-operator-provision.sql
--
-- Provision least-privilege grants for b1_matrix_operator role.
-- ============================================================================
\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA public TO b1_matrix_operator;

GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_harness_run_negative_case(uuid,text,text,text,text,text) TO b1_matrix_operator;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname LIKE 'b1_observer_%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO b1_matrix_operator', r.sig);
  END LOOP;
END $$;
