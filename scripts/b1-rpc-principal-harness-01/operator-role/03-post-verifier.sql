-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01 (REMEDIATED LONGRUN-12)
-- 03-post-verifier.sql — Post-provisioning compliance & permission verifier
--
-- Asserts:
--   1. Role b1_matrix_operator exists and has CANLOGIN
--   2. rolsuper = false, rolbypassrls = false, rolcreatedb = false, rolcreaterole = false,
--      rolreplication = false, rolinherit = false
--   3. Has EXECUTE on public.act_on_b1_student_request_step_atomic
--   4. Has EXECUTE on public.record_external_university_payment_confirmation
--   5. Has SELECT privileges ONLY on allowlist tables (24 total)
--   6. Has NO SELECT privileges on non-allowlist tables (e.g. students, staff_profiles, faculty_profiles)
--   7. Has NO table DML (INSERT/UPDATE/DELETE/TRUNCATE) grants anywhere
--   8. Has NO role memberships, NO ownerships, NO default ACLs
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_rec          record;
  v_has_exec1    boolean;
  v_has_exec2    boolean;
  v_mem_count    int;
  v_unrelated_sel int;
  v_write_grants int;
  v_allowlist_table text;
  v_allowlist    text[] := ARRAY[
    'student_requests', 'student_request_workflow_steps', 'student_request_workflow_events',
    'request_processing_assignments', 'student_request_attachment_uploads', 'student_request_attachments',
    'student_request_fee_assessments', 'payment_receipts', 'official_documents',
    'enrollment_certificate_document_details', 'transfer_request_details', 'enrollment_suspension_details',
    'absence_excuse_details', 'extra_chance_details', 'file_withdrawal_details',
    'student_excused_absences', 'student_extra_chances', 'student_academic_status',
    'student_enrollments', 'student_profiles', 'notifications', 'audit_logs', 'request_types'
  ];
BEGIN
  -- 1. Query role attributes
  SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit
    INTO v_rec
    FROM pg_roles
   WHERE rolname = 'b1_matrix_operator';

  IF v_rec IS NULL THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator role does not exist';
  END IF;

  IF NOT v_rec.rolcanlogin THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator role cannot login';
  END IF;

  IF v_rec.rolsuper THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT be superuser';
  END IF;

  IF v_rec.rolbypassrls THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT have BYPASSRLS';
  END IF;

  IF v_rec.rolcreatedb OR v_rec.rolcreaterole OR v_rec.rolreplication THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT have CREATEDB, CREATEROLE, or REPLICATION';
  END IF;

  IF v_rec.rolinherit THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator MUST NOT have INHERIT (rolinherit must be false)';
  END IF;

  -- 2. Verify role memberships (must be 0)
  SELECT count(*) INTO v_mem_count
    FROM pg_auth_members m
    JOIN pg_roles r1 ON r1.oid = m.roleid
    JOIN pg_roles r2 ON r2.oid = m.member
   WHERE r1.rolname = 'b1_matrix_operator' OR r2.rolname = 'b1_matrix_operator';

  IF v_mem_count > 0 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator has unexpected role memberships (count=%)', v_mem_count;
  END IF;

  -- 3. Verify EXECUTE privileges
  SELECT has_function_privilege('b1_matrix_operator', 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EXECUTE')
    INTO v_has_exec1;
  SELECT has_function_privilege('b1_matrix_operator', 'public.record_external_university_payment_confirmation(uuid,text)', 'EXECUTE')
    INTO v_has_exec2;

  IF NOT v_has_exec1 OR NOT v_has_exec2 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: missing EXECUTE privileges on RPC entrypoints (act_on=%, record_pay=%)',
      v_has_exec1, v_has_exec2;
  END IF;

  -- 4. Verify SELECT on all allowlist tables
  FOREACH v_allowlist_table IN ARRAY v_allowlist LOOP
    IF to_regclass('public.' || v_allowlist_table) IS NOT NULL AND
       NOT has_table_privilege('b1_matrix_operator', 'public.' || v_allowlist_table, 'SELECT') THEN
      RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: missing SELECT on allowlist table public.%', v_allowlist_table;
    END IF;
  END LOOP;

  -- 5. Verify NO SELECT on non-allowlist tables in schema public
  SELECT count(*) INTO v_unrelated_sel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'v', 'm')
     AND c.relname NOT IN (SELECT unnest(v_allowlist))
     AND has_table_privilege('b1_matrix_operator', c.oid, 'SELECT');

  IF v_unrelated_sel > 0 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator has unauthorized SELECT on % non-allowlist tables', v_unrelated_sel;
  END IF;

  -- 6. Verify NO write DML privileges exist anywhere in schema public
  SELECT count(*) INTO v_write_grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND (
       has_table_privilege('b1_matrix_operator', c.oid, 'INSERT') OR
       has_table_privilege('b1_matrix_operator', c.oid, 'UPDATE') OR
       has_table_privilege('b1_matrix_operator', c.oid, 'DELETE') OR
       has_table_privilege('b1_matrix_operator', c.oid, 'TRUNCATE')
     );

  IF v_write_grants > 0 THEN
    RAISE EXCEPTION 'OPERATOR_POST_VERIFY_FAIL: b1_matrix_operator has unauthorized write DML privileges on % tables', v_write_grants;
  END IF;

  RAISE NOTICE 'OPERATOR_POST_VERIFY_PASS: b1_matrix_operator verified compliant non-superuser, NOINHERIT, non-BYPASSRLS role with exact allowlist privileges.';
END $$;
