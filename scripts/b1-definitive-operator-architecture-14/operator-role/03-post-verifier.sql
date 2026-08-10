-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- operator-role/03-post-verifier.sql
--
-- Verify the operator role has exactly the intended effective privileges.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_rec record;
  v_exec1 boolean;
  v_exec2 boolean;
  v_mem_count int;
  v_table_grants int;
  v_schema_create boolean;
BEGIN
  SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit
    INTO v_rec
    FROM pg_roles
   WHERE rolname = 'b1_matrix_operator';

  IF v_rec IS NULL THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator does not exist';
  END IF;

  IF NOT v_rec.rolcanlogin THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: cannot login';
  END IF;

  IF v_rec.rolsuper OR v_rec.rolbypassrls OR v_rec.rolcreatedb OR v_rec.rolcreaterole OR v_rec.rolreplication OR v_rec.rolinherit THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: forbidden attribute (super=%, bypassrls=%, createdb=%, createrole=%, replication=%, inherit=%)',
      v_rec.rolsuper, v_rec.rolbypassrls, v_rec.rolcreatedb, v_rec.rolcreaterole, v_rec.rolreplication, v_rec.rolinherit;
  END IF;

  SELECT count(*) INTO v_mem_count
    FROM pg_auth_members m
    JOIN pg_roles r1 ON r1.oid = m.roleid
    JOIN pg_roles r2 ON r2.oid = m.member
   WHERE r1.rolname = 'b1_matrix_operator' OR r2.rolname = 'b1_matrix_operator';
  IF v_mem_count > 0 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: unexpected memberships (%)', v_mem_count;
  END IF;

  SELECT has_function_privilege('b1_matrix_operator', 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EXECUTE'),
         has_function_privilege('b1_matrix_operator', 'public.record_external_university_payment_confirmation(uuid,text)', 'EXECUTE')
    INTO v_exec1, v_exec2;
  IF NOT v_exec1 OR NOT v_exec2 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: missing EXECUTE on entry RPCs (act_on=%, record_pay=%)', v_exec1, v_exec2;
  END IF;

  SELECT count(*) INTO v_table_grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r','v','m')
     AND c.relname NOT IN ('pg_stat_statements', 'pg_stat_statements_info')
     AND has_table_privilege('b1_matrix_operator', c.oid, 'SELECT');
  IF v_table_grants > 0 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: % broad table SELECT grants exist', v_table_grants;
  END IF;

  SELECT has_schema_privilege('b1_matrix_operator', 'public', 'CREATE') INTO v_schema_create;
  IF v_schema_create THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: operator has CREATE on schema public';
  END IF;

  RAISE NOTICE 'OPERATOR_POST_VERIFY_PASS: least-privilege operator verified';
END $$;
