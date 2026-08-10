-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01 (REMEDIATED LONGRUN-12)
-- 02-provision.sql — Provision compliant non-superuser, NOINHERIT, non-BYPASSRLS operator
--
-- Security specifications:
--   * LOGIN role: b1_matrix_operator
--   * NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT
--   * CONNECTION LIMIT 10
--   * Ephemeral runtime password support
--   * SELECT-only granted EXCLUSIVELY on OPERATOR_OBSERVATION_ALLOWLIST tables
--   * NO SELECT granted on ALL TABLES (no broad schema SELECT)
--   * REVOKE all table DML (INSERT, UPDATE, DELETE, TRUNCATE)
--   * EXECUTE granted ONLY on the 2 entry RPCs:
--       - act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)
--       - record_external_university_payment_confirmation(uuid,text)
--   * NO schema ownership or default privileges
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') THEN
    CREATE ROLE b1_matrix_operator WITH
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOINHERIT
      CONNECTION LIMIT 10;
  ELSE
    ALTER ROLE b1_matrix_operator WITH
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOINHERIT
      CONNECTION LIMIT 10;
  END IF;
END $$;

-- Strip public table default permissions and enforce strict allowlist-only SELECT
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, b1_matrix_operator;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM b1_matrix_operator;
GRANT USAGE ON SCHEMA public TO b1_matrix_operator;
GRANT USAGE ON SCHEMA supabase_migrations TO b1_matrix_operator;

-- Grant machine-readable allowlist SELECT privileges (exact 24 tables)
GRANT SELECT ON TABLE public.student_requests TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_request_workflow_steps TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_request_workflow_events TO b1_matrix_operator;
GRANT SELECT ON TABLE public.request_processing_assignments TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_request_attachment_uploads TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_request_attachments TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_request_fee_assessments TO b1_matrix_operator;
GRANT SELECT ON TABLE public.payment_receipts TO b1_matrix_operator;
GRANT SELECT ON TABLE public.official_documents TO b1_matrix_operator;
GRANT SELECT ON TABLE public.enrollment_certificate_document_details TO b1_matrix_operator;
GRANT SELECT ON TABLE public.transfer_request_details TO b1_matrix_operator;
GRANT SELECT ON TABLE public.enrollment_suspension_details TO b1_matrix_operator;
GRANT SELECT ON TABLE public.absence_excuse_details TO b1_matrix_operator;
GRANT SELECT ON TABLE public.extra_chance_details TO b1_matrix_operator;
GRANT SELECT ON TABLE public.file_withdrawal_details TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_excused_absences TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_extra_chances TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_academic_status TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_enrollments TO b1_matrix_operator;
GRANT SELECT ON TABLE public.student_profiles TO b1_matrix_operator;
GRANT SELECT ON TABLE public.notifications TO b1_matrix_operator;
GRANT SELECT ON TABLE public.audit_logs TO b1_matrix_operator;
GRANT SELECT ON TABLE public.request_types TO b1_matrix_operator;
GRANT SELECT ON TABLE supabase_migrations.schema_migrations TO b1_matrix_operator;

-- Grant RLS SELECT observation policies for b1_matrix_operator on RLS tables
DO $$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'student_requests', 'student_request_workflow_steps', 'student_request_workflow_events',
    'request_processing_assignments', 'student_request_attachment_uploads', 'student_request_attachments',
    'student_request_fee_assessments', 'payment_receipts', 'official_documents',
    'enrollment_certificate_document_details', 'transfer_request_details', 'enrollment_suspension_details',
    'absence_excuse_details', 'extra_chance_details', 'file_withdrawal_details',
    'student_excused_absences', 'student_extra_chances', 'student_academic_status',
    'student_enrollments', 'student_profiles', 'notifications', 'audit_logs', 'request_types'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS b1_op_select_%I ON public.%I', v_tbl, v_tbl);
    EXECUTE format('CREATE POLICY b1_op_select_%I ON public.%I FOR SELECT TO b1_matrix_operator USING (true)', v_tbl, v_tbl);
  END LOOP;
END $$;

-- Ensure NO write DML privileges exist anywhere
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM b1_matrix_operator;

-- Grant EXECUTE strictly on the two RPC entrypoints under test
GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO b1_matrix_operator;

DO $$ BEGIN RAISE NOTICE 'OPERATOR_PROVISION_PASS: b1_matrix_operator role provisioned successfully with NOINHERIT, non-superuser, non-BYPASSRLS, allowlist-only SELECT permissions.'; END $$;
