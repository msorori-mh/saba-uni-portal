-- Department Transfer 10A1 — production read-only preflight.
-- SELECT/catalog queries only. Do not run through a write-capable role.
-- This file is prepared only; it was NOT executed by 10A1.

BEGIN;
SET TRANSACTION READ ONLY;

SELECT 'service_type' AS check_name,
       rt.code, rt.is_active, rt.student_visible
FROM public.request_types rt
WHERE rt.code IN ('department_transfer','transfer')
ORDER BY rt.code;

SELECT 'detail_columns' AS check_name,
       c.column_name, c.data_type, c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema='public'
  AND c.table_name='transfer_request_details'
ORDER BY c.ordinal_position;

SELECT 'detail_constraints' AS check_name,
       con.conname, con.contype, pg_get_constraintdef(con.oid, true) AS definition,
       con.convalidated
FROM pg_constraint con
JOIN pg_class rel ON rel.oid=con.conrelid
JOIN pg_namespace n ON n.oid=rel.relnamespace
WHERE n.nspname='public' AND rel.relname='transfer_request_details'
ORDER BY con.conname;

SELECT 'detail_indexes' AS check_name,
       indexrelid::regclass AS index_name,
       pg_get_indexdef(indexrelid) AS definition
FROM pg_index
WHERE indrelid=to_regclass('public.transfer_request_details')
ORDER BY indexrelid::regclass::text;

SELECT 'detail_acl_rls' AS check_name,
       c.relrowsecurity, c.relforcerowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete
FROM pg_class c
WHERE c.oid=to_regclass('public.transfer_request_details');

SELECT 'detail_policies' AS check_name,
       schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='transfer_request_details'
ORDER BY policyname;

WITH expected(name, signature) AS (VALUES
  ('submit_b1_student_request_atomic','public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'),
  ('act_on_b1_student_request_step_atomic','public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'),
  ('record_external_university_payment_confirmation','public.record_external_university_payment_confirmation(uuid,text)'),
  ('create_b1_request_draft_for_student','public.create_b1_request_draft_for_student(text,text)'),
  ('save_b1_request_draft_for_student','public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'),
  ('current_user_matches_transfer_department_scope','public.current_user_matches_transfer_department_scope(uuid,text)')
)
SELECT 'rpc_catalog' AS check_name, e.name, e.signature,
       to_regprocedure(e.signature) IS NOT NULL AS exists,
       CASE WHEN to_regprocedure(e.signature) IS NULL THEN NULL
            ELSE (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature)) END AS security_definer,
       CASE WHEN to_regprocedure(e.signature) IS NULL THEN NULL
            ELSE (SELECT p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature)) END AS config
FROM expected e
ORDER BY e.name;

WITH expected(signature) AS (VALUES
  ('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'),
  ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'),
  ('public.record_external_university_payment_confirmation(uuid,text)'),
  ('public.create_b1_request_draft_for_student(text,text)'),
  ('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'),
  ('public.current_user_matches_transfer_department_scope(uuid,text)')
)
SELECT 'rpc_acl' AS check_name, e.signature,
       CASE WHEN to_regprocedure(e.signature) IS NULL THEN NULL ELSE has_function_privilege('anon', to_regprocedure(e.signature), 'EXECUTE') END AS anon_execute,
       CASE WHEN to_regprocedure(e.signature) IS NULL THEN NULL ELSE has_function_privilege('authenticated', to_regprocedure(e.signature), 'EXECUTE') END AS authenticated_execute,
       CASE WHEN to_regprocedure(e.signature) IS NULL THEN NULL ELSE has_function_privilege('service_role', to_regprocedure(e.signature), 'EXECUTE') END AS service_role_execute
FROM expected e;

SELECT 'workflow_steps' AS check_name,
       rt.code, ws.step_order, ws.step_key, u.code AS processing_unit,
       r.code AS processing_role, ws.action_type, ws.is_active
FROM public.request_type_workflows w
JOIN public.request_types rt ON rt.id=w.request_type_id
JOIN public.request_type_workflow_steps ws ON ws.workflow_id=w.id
LEFT JOIN public.request_processing_units u ON u.id=ws.processing_unit_id
LEFT JOIN public.request_processing_roles r ON r.id=ws.processing_role_id
WHERE rt.code IN ('department_transfer','transfer')
ORDER BY rt.code, ws.step_order;

SELECT 'assignments' AS check_name,
       u.code AS processing_unit, r.code AS processing_role,
       a.department_id, a.position_assignment_id, a.is_active,
       count(*) AS assignment_count
FROM public.request_processing_assignments a
JOIN public.request_processing_units u ON u.id=a.unit_id
JOIN public.request_processing_roles r ON r.id=a.role_id
WHERE u.code IN ('student_affairs','department','dean','finance','registrar')
  AND r.code IN ('student_affairs_specialist','department_head','dean','revenue_finance_officer','registrar_general')
GROUP BY u.code,r.code,a.department_id,a.position_assignment_id,a.is_active
ORDER BY u.code,r.code,a.department_id;

SELECT 'request_counts' AS check_name,
       count(*) AS total_requests,
       count(*) FILTER (WHERE request_type IN ('department_transfer','transfer')) AS transfer_requests,
       count(*) FILTER (WHERE COALESCE(form_data->>'TEST_ONLY','')='true') AS test_only_requests,
       count(*) FILTER (WHERE request_type IN ('department_transfer','transfer') AND COALESCE(form_data->>'TEST_ONLY','')='true') AS transfer_test_only_requests
FROM public.student_requests;

SELECT 'migration_head' AS check_name,
       max(version) AS latest_applied_version,
       count(*) AS applied_migration_count
FROM supabase_migrations.schema_migrations;

WITH expected_rpc(signature) AS (VALUES
  ('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'),
  ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'),
  ('public.record_external_university_payment_confirmation(uuid,text)'),
  ('public.create_b1_request_draft_for_student(text,text)'),
  ('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'),
  ('public.current_user_matches_transfer_department_scope(uuid,text)')
), required_columns(column_name) AS (VALUES
  ('request_id'), ('current_program_id'), ('requested_program_id'),
  ('current_department_id'), ('requested_department_id'), ('transfer_reason')
), checks(name, ok) AS (
  SELECT 'canonical_service_type', (SELECT count(*) = 1 FROM public.request_types WHERE code='department_transfer' AND is_active AND NOT student_visible)
  UNION ALL SELECT 'detail_table', to_regclass('public.transfer_request_details') IS NOT NULL
  UNION ALL SELECT 'detail_required_columns', (SELECT count(*) = 6 FROM information_schema.columns c JOIN required_columns r ON r.column_name=c.column_name WHERE c.table_schema='public' AND c.table_name='transfer_request_details' AND c.is_nullable='NO')
  UNION ALL SELECT 'required_rpcs', (SELECT count(*) = 6 FROM expected_rpc e WHERE to_regprocedure(e.signature) IS NOT NULL)
  UNION ALL SELECT 'workflow_exact_six_steps', (SELECT count(*) = 6 FROM public.request_type_workflows w JOIN public.request_types rt ON rt.id=w.request_type_id JOIN public.request_type_workflow_steps s ON s.workflow_id=w.id WHERE rt.code='department_transfer' AND w.is_active AND s.is_active)
  UNION ALL SELECT 'public_execute_zero', NOT EXISTS (SELECT 1 FROM expected_rpc e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
  UNION ALL SELECT 'anon_execute_zero', NOT EXISTS (SELECT 1 FROM expected_rpc e WHERE to_regprocedure(e.signature) IS NOT NULL AND has_function_privilege('anon',to_regprocedure(e.signature),'EXECUTE'))
  UNION ALL SELECT 'authenticated_detail_dml_zero', NOT has_table_privilege('authenticated','public.transfer_request_details','INSERT') AND NOT has_table_privilege('authenticated','public.transfer_request_details','UPDATE') AND NOT has_table_privilege('authenticated','public.transfer_request_details','DELETE')
)
SELECT 'preflight_gate' AS check_name,
       bool_and(ok) AS all_checks_pass,
       CASE WHEN bool_and(ok) THEN 'PASS' ELSE 'HOLD' END AS decision,
       jsonb_object_agg(name, ok) AS checks
FROM checks;

ROLLBACK;
