-- ============================================================================
-- PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_PACKAGE_97
-- Production READ-ONLY preflight for Migration 88.
--
-- MODE: SELECT / WITH / SHOW / catalog reads / assertions only.
-- Zero INSERT/UPDATE/DELETE/MERGE.
-- Zero CREATE/ALTER/DROP/TRUNCATE.
-- Zero GRANT/REVOKE.
-- Zero Auth mutation.
-- Zero write-capable function invocation.
--
-- Transaction: SERIALIZABLE READ ONLY → ends with ROLLBACK.
-- Executing this file does NOT authorize Migration 88 apply.
--
-- Pinned Migration 88 identity (source, NOT applied by this package):
--   filename : supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql
--   version  : 20260804120000
--   raw SHA  : b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c
--   LF SHA   : fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a
--   bytes    : 58236 (raw) / 56666 (LF)
--   lines    : 1571 (LF)
--
-- Expected production project ref: wpmicqriltrowwonknox
-- Lovable project id: 4b291119-790f-4484-9285-c2b774e1ba6f
-- Source merge HEAD: e0cf9d48acb562109aaf310dbd5e534b900c6d90
--
-- Operator attestation (required for G01 PASS):
--   Before this batch, after confirming Lovable is bound to production ref
--   wpmicqriltrowwonknox, set (same session, before BEGIN or via SET LOCAL
--   immediately after BEGIN if the channel allows):
--     SELECT set_config('app.b1_e2e_88_preflight_project_ref',
--                       'wpmicqriltrowwonknox', true);
--   If unset or mismatched → G01 HOLD (PROJECT_IDENTITY_UNPROVEN).
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;

WITH
params AS (
  SELECT
    'wpmicqriltrowwonknox'::text AS expected_project_ref,
    '20260804120000'::text AS expected_migration_version,
    'b1_88_request_scoped_e2e_support'::text AS expected_migration_token,
    'b1b8ea2a7c6f7a08910046658e6876c2667d28d5ca879f296c142bf905de587c'::text AS migration_raw_sha256,
    'fb4e1e507b0bc109a225cb33e1a95e740253c3c85f508ed673abd4f273726f2a'::text AS migration_lf_sha256,
    58236::bigint AS migration_raw_bytes,
    56666::bigint AS migration_lf_bytes,
    1571::integer AS migration_lf_lines,
    'docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql'::text
      AS decommission_draft_path,
    '61254e3f3e6cc66802b5aa16d6b40f0fa9019d1a3d88a50c334424bcbad0335d'::text AS decommission_raw_sha256,
    'e77ea69b3c7914408af06c4c2b9ea50ce9fbd217d380507c94b0a2766107bce8'::text AS decommission_lf_sha256,
    29733::bigint AS decommission_raw_bytes,
    -- Base (pre-apply / post-decommission) fingerprints from cleanup draft
    '9c9090f29458975b197b92dc86b0e587'::text AS fp_create_student_request_base,
    'e25e7e4f6cb759814857abcd509ae49e'::text AS fp_user_matches_base,
    '4a3c50af92db046b1571eba0e4073f64'::text AS fp_transfer_scope_base,
    'f0bf40897b23c49bfee1044b2ce34e3d'::text AS fp_can_act_base,
    -- Post-apply (migration-88) fingerprints — must NOT match pre-apply
    'ed11125e55df36b154c432c7e28d7285'::text AS fp_create_student_request_m88,
    '2fba2db758a2edd42b1c440a36a4aa47'::text AS fp_user_matches_m88,
    '396eb3a5f12fb7d46018823930d87851'::text AS fp_transfer_scope_m88,
    '586893beacb33c10a1483b38e8d090fd'::text AS fp_can_act_m88
),
attestation AS (
  SELECT
    nullif(current_setting('app.b1_e2e_88_preflight_project_ref', true), '') AS attested_project_ref,
    current_setting('transaction_read_only', true) AS txn_read_only,
    current_database() AS db_name
),
five_services AS (
  SELECT * FROM (VALUES
    ('enrollment_suspension'),
    ('excused_absence'),
    ('department_transfer'),
    ('final_chance'),
    ('file_withdrawal')
  ) AS t(code)
),
fixture_expect AS (
  SELECT * FROM (VALUES
    (1,  'SR-20260801-13000001'::text, 'f1300000-0000-4000-8000-000000000001'::uuid, 'department_transfer'::text, 'source_department_head_approval'::text, 'f1300001-0000-4000-8000-000001000002'::uuid),
    (2,  'SR-20260801-13000002', 'f1300000-0000-4000-8000-000000000002'::uuid, 'department_transfer', 'target_department_head_approval', 'f1300001-0000-4000-8000-000002000003'::uuid),
    (3,  'SR-20260801-13000003', 'f1300000-0000-4000-8000-000000000003'::uuid, 'department_transfer', 'dean_approval', 'f1300001-0000-4000-8000-000003000004'::uuid),
    (4,  'SR-20260801-13000004', 'f1300000-0000-4000-8000-000000000004'::uuid, 'department_transfer', 'payment_confirmation', 'f1300001-0000-4000-8000-000004000005'::uuid),
    (5,  'SR-20260801-13000005', 'f1300000-0000-4000-8000-000000000005'::uuid, 'department_transfer', 'registrar_apply', 'f1300001-0000-4000-8000-000005000006'::uuid),
    (6,  'SR-20260801-13000006', 'f1300000-0000-4000-8000-000000000006'::uuid, 'enrollment_suspension', 'manager_approval', 'f1300001-0000-4000-8000-000006000002'::uuid),
    (7,  'SR-20260801-13000007', 'f1300000-0000-4000-8000-000000000007'::uuid, 'enrollment_suspension', 'registrar_apply', 'f1300001-0000-4000-8000-000007000003'::uuid),
    (8,  'SR-20260801-13000008', 'f1300000-0000-4000-8000-000000000008'::uuid, 'excused_absence', 'manager_review', 'f1300001-0000-4000-8000-000008000002'::uuid),
    (9,  'SR-20260801-13000009', 'f1300000-0000-4000-8000-000000000009'::uuid, 'excused_absence', 'record_apply', 'f1300001-0000-4000-8000-000009000003'::uuid),
    (10, 'SR-20260801-13000010', 'f1300000-0000-4000-8000-000000000010'::uuid, 'file_withdrawal', 'library_clearance', 'f1300001-0000-4000-8000-000010000002'::uuid),
    (11, 'SR-20260801-13000011', 'f1300000-0000-4000-8000-000000000011'::uuid, 'file_withdrawal', 'labs_clearance', 'f1300001-0000-4000-8000-000011000003'::uuid),
    (12, 'SR-20260801-13000012', 'f1300000-0000-4000-8000-000000000012'::uuid, 'file_withdrawal', 'activities_clearance', 'f1300001-0000-4000-8000-000012000004'::uuid),
    (13, 'SR-20260801-13000013', 'f1300000-0000-4000-8000-000000000013'::uuid, 'file_withdrawal', 'finance_clearance', 'f1300001-0000-4000-8000-000013000005'::uuid),
    (14, 'SR-20260801-13000014', 'f1300000-0000-4000-8000-000000000014'::uuid, 'file_withdrawal', 'registrar_apply', 'f1300001-0000-4000-8000-000014000006'::uuid),
    (15, 'SR-20260801-13000015', 'f1300000-0000-4000-8000-000000000015'::uuid, 'file_withdrawal', 'archive', 'f1300001-0000-4000-8000-000015000007'::uuid),
    (16, 'SR-20260801-13000016', 'f1300000-0000-4000-8000-000000000016'::uuid, 'final_chance', 'manager_review', 'f1300001-0000-4000-8000-000016000002'::uuid),
    (17, 'SR-20260801-13000017', 'f1300000-0000-4000-8000-000000000017'::uuid, 'final_chance', 'dean_decision', 'f1300001-0000-4000-8000-000017000003'::uuid),
    (18, 'SR-20260801-13000018', 'f1300000-0000-4000-8000-000000000018'::uuid, 'final_chance', 'payment_confirmation', 'f1300001-0000-4000-8000-000018000004'::uuid),
    (19, 'SR-20260801-13000019', 'f1300000-0000-4000-8000-000000000019'::uuid, 'final_chance', 'registrar_apply', 'f1300001-0000-4000-8000-000019000005'::uuid)
  ) AS t(case_index, request_number, request_id, service_code, step_code, runtime_step_id)
),
-- Catalog fingerprint (same formula as cleanup draft pg_temp.b1_e2e_88_fn_fingerprint)
fn_catalog AS (
  SELECT
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS identity,
    md5(
      regexp_replace(pg_get_functiondef(p.oid), E'[\n\r\t ]+', ' ', 'g')
      || '|' || pg_get_userbyid(p.proowner)
      || '|' || p.prosecdef::text
      || '|' || p.provolatile::text
      || '|' || p.proisstrict::text
      || '|' || p.proparallel::text
      || '|' || coalesce(array_to_string(p.proconfig, ','), '')
      || '|' || coalesce((
           SELECT string_agg(grantee::regrole::text || '=' || privilege_type, ',' ORDER BY 1)
           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
         ), '')
      || '|' || pg_get_function_identity_arguments(p.oid)
    ) AS fingerprint,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.provolatile::text AS volatility,
    p.proisstrict AS is_strict,
    p.proparallel::text AS parallel_safety,
    coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    coalesce((
      SELECT string_agg(grantee::regrole::text || '=' || privilege_type, ',' ORDER BY 1)
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    ), '') AS acl,
    (position('b1_e2e_88' in pg_get_functiondef(p.oid)) > 0) AS body_mentions_e2e_88
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      (p.proname = 'create_student_request'
        AND pg_get_function_identity_arguments(p.oid) = 'text, text, jsonb, text')
      OR (p.proname = 'user_matches_workflow_runtime_step'
        AND pg_get_function_identity_arguments(p.oid) = 'uuid')
      OR (p.proname = 'current_user_matches_transfer_department_scope'
        AND pg_get_function_identity_arguments(p.oid) = 'uuid, text')
      OR (p.proname = 'can_current_user_act_on_step'
        AND pg_get_function_identity_arguments(p.oid) = 'uuid, text')
    )
),
fn_expect AS (
  SELECT * FROM (VALUES
    ('public.create_student_request(text, text, jsonb, text)'::text,
     (SELECT fp_create_student_request_base FROM params),
     (SELECT fp_create_student_request_m88 FROM params)),
    ('public.user_matches_workflow_runtime_step(uuid)',
     (SELECT fp_user_matches_base FROM params),
     (SELECT fp_user_matches_m88 FROM params)),
    ('public.current_user_matches_transfer_department_scope(uuid, text)',
     (SELECT fp_transfer_scope_base FROM params),
     (SELECT fp_transfer_scope_m88 FROM params)),
    ('public.can_current_user_act_on_step(uuid, text)',
     (SELECT fp_can_act_base FROM params),
     (SELECT fp_can_act_m88 FROM params))
  ) AS t(identity, expected_base_fp, forbidden_m88_fp)
),
fn_eval AS (
  SELECT
    e.identity,
    e.expected_base_fp,
    e.forbidden_m88_fp,
    c.fingerprint AS observed_fp,
    c.owner,
    c.security_definer,
    c.volatility,
    c.is_strict,
    c.parallel_safety,
    c.proconfig,
    c.acl,
    c.body_mentions_e2e_88,
    (SELECT count(*) FROM fn_catalog x WHERE x.identity = e.identity) AS match_count
  FROM fn_expect e
  LEFT JOIN fn_catalog c ON c.identity = e.identity
),
object_prestate AS (
  SELECT
    (to_regclass('public.b1_e2e_88_executions') IS NOT NULL) AS has_executions,
    (to_regclass('public.b1_e2e_88_actor_bindings') IS NOT NULL) AS has_bindings,
    (to_regclass('public.b1_e2e_88_audit_events') IS NOT NULL) AS has_audit,
    (to_regprocedure('public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)') IS NOT NULL) AS has_open_rpc,
    (to_regprocedure('public.close_b1_e2e_88_execution(uuid,text)') IS NOT NULL) AS has_close_rpc,
    (to_regprocedure('public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)') IS NOT NULL) AS has_bind_rpc,
    (to_regprocedure('public.cleanup_b1_e2e_88_package(uuid,boolean)') IS NOT NULL) AS has_cleanup_rpc,
    (to_regprocedure('public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text)') IS NOT NULL) AS has_actor_binding_fn,
    (to_regprocedure('public.current_user_has_b1_e2e_88_department_binding(uuid,text)') IS NOT NULL) AS has_dept_binding_fn,
    (to_regprocedure('public.b1_e2e_88_marker()') IS NOT NULL) AS has_marker_fn,
    (to_regprocedure('public.guard_b1_e2e_88_immutable_marker()') IS NOT NULL) AS has_guard_fn,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND t.tgname IN ('trg_b1_e2e_88_audit_no_update', 'trg_guard_b1_e2e_88_immutable_marker')
    ) AS has_e2e_trigger,
    (
      SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('b1_e2e_88_executions', 'b1_e2e_88_actor_bindings', 'b1_e2e_88_audit_events')
    ) AS e2e_policy_count
),
migration_ledger AS (
  SELECT
    (
      to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
      AND has_table_privilege('supabase_migrations.schema_migrations', 'SELECT')
    ) AS ledger_readable_candidate,
    CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
        OR NOT has_table_privilege('supabase_migrations.schema_migrations', 'SELECT')
      THEN -1::bigint
      ELSE (
        SELECT count(*)::bigint
        FROM supabase_migrations.schema_migrations sm
        WHERE sm.version = (SELECT expected_migration_version FROM params)
           OR sm.version ILIKE '%' || (SELECT expected_migration_token FROM params) || '%'
      )
    END AS ledger_hits,
    CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
        OR NOT has_table_privilege('supabase_migrations.schema_migrations', 'SELECT')
      THEN NULL::bigint
      ELSE (SELECT count(*)::bigint FROM supabase_migrations.schema_migrations)
    END AS migration_count,
    CASE
      WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
        OR NOT has_table_privilege('supabase_migrations.schema_migrations', 'SELECT')
      THEN NULL::text
      ELSE (SELECT max(version) FROM supabase_migrations.schema_migrations)
    END AS migration_head
),
visibility AS (
  SELECT
    (SELECT count(*) FROM public.request_types rt
      JOIN five_services f ON f.code = rt.code
      WHERE rt.is_active IS TRUE AND rt.student_visible IS FALSE) AS five_hidden_active,
    (SELECT count(*) FROM public.request_types rt
      JOIN five_services f ON f.code = rt.code) AS five_present,
    (SELECT count(*) FROM public.request_types rt
      JOIN five_services f ON f.code = rt.code
      WHERE rt.student_visible IS DISTINCT FROM FALSE
         OR rt.is_active IS DISTINCT FROM TRUE) AS five_visibility_drift,
    EXISTS (
      SELECT 1 FROM public.request_types rt
      WHERE rt.code = 'enrollment_certificate'
        AND rt.is_active IS TRUE
        AND rt.student_visible IS TRUE
    ) AS enrollment_certificate_ok,
    EXISTS (
      SELECT 1 FROM public.request_types rt WHERE rt.code = 'enrollment_certificate'
    ) AS enrollment_certificate_exists
),
fixture_live AS (
  SELECT
    sr.id,
    sr.request_number,
    sr.request_type,
    sr.status,
    sr.completed_at,
    sr.form_data,
    (SELECT count(*) FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active') AS active_steps,
    (SELECT s.id FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order LIMIT 1) AS active_step_id,
    COALESCE(sr.form_data->>'e2e_marker', '') AS e2e_marker,
    COALESCE(sr.form_data->>'e2e_correlation_id', '') AS e2e_correlation,
    (sr.form_data ? 'e2e_correlation_id') AS has_correlation_field
  FROM public.student_requests sr
  WHERE sr.request_number LIKE 'SR-20260801-13%'
),
fixture_eval AS (
  SELECT
    (SELECT count(*) FROM fixture_live) AS fixture_count,
    (SELECT count(*) FROM fixture_expect e
      JOIN fixture_live l ON l.id = e.request_id AND l.request_number = e.request_number) AS identity_matches,
    (SELECT count(*) FROM fixture_live WHERE active_steps = 1) AS exactly_one_active,
    (SELECT count(*) FROM fixture_live WHERE e2e_marker = 'TEST_ONLY_B1_E2E_88') AS e2e_marker_hits,
    (SELECT count(*) FROM fixture_live WHERE has_correlation_field) AS correlation_field_hits,
    EXISTS (
      SELECT 1 FROM fixture_live l
      JOIN fixture_expect e ON e.request_id = l.id
      WHERE e.case_index = 15
        AND l.status = 'in_review'
        AND l.completed_at IS NULL
        AND l.active_steps = 1
        AND l.active_step_id = e.runtime_step_id
    ) AS fixture_15_restored_ok,
    (
      SELECT count(*) FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = 'f1300000-0000-4000-8000-000000000015'::uuid
        AND s.status = 'completed'
    ) AS fixture_15_completed_steps
),
rpa_scope AS (
  SELECT DISTINCT a.*
  FROM public.request_processing_assignments a
  JOIN public.request_type_workflow_steps ws
    ON ws.processing_unit_id = a.unit_id
   AND ws.processing_role_id = a.role_id
  JOIN public.request_type_workflows w ON w.id = ws.workflow_id
  JOIN public.request_types rt ON rt.id = w.request_type_id
  JOIN five_services f ON f.code = rt.code
  WHERE a.is_active IS TRUE
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
),
rpa_fp AS (
  SELECT
    md5(coalesce(string_agg(row_text, '|' ORDER BY row_text), '')) AS fingerprint,
    count(*)::bigint AS active_row_count
  FROM (
    SELECT
      id::text || ':' ||
      unit_id::text || ':' ||
      role_id::text || ':' ||
      assignment_type || ':' ||
      coalesce(user_id::text, '') || ':' ||
      coalesce(staff_profile_id::text, '') || ':' ||
      coalesce(faculty_profile_id::text, '') || ':' ||
      coalesce(position_assignment_id::text, '') || ':' ||
      coalesce(department_id::text, '') || ':' ||
      is_active::text || ':' ||
      coalesce(starts_at::text, '') || ':' ||
      coalesce(ends_at::text, '') AS row_text
    FROM rpa_scope
  ) q
),
rpa_dup AS (
  SELECT count(*)::bigint AS duplicate_active_groups
  FROM (
    SELECT unit_id, role_id, assignment_type,
           coalesce(user_id::text, ''),
           coalesce(staff_profile_id::text, ''),
           coalesce(faculty_profile_id::text, ''),
           coalesce(department_id::text, ''),
           count(*) AS c
    FROM rpa_scope
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    HAVING count(*) > 1
  ) d
),
protected_fp AS (
  SELECT
    md5(coalesce(string_agg(x, '|' ORDER BY x), '')) AS request_types_fp
  FROM (
    SELECT code || ':' || is_active::text || ':' || student_visible::text AS x
    FROM public.request_types
    WHERE code IN (
      'enrollment_suspension','excused_absence','department_transfer',
      'final_chance','file_withdrawal','enrollment_certificate'
    )
  ) q
),
fixture_fp AS (
  SELECT md5(coalesce(string_agg(x, '|' ORDER BY x), '')) AS fixtures_fp
  FROM (
    SELECT id::text || ':' || request_number || ':' || request_type || ':' ||
           status || ':' || coalesce(completed_at::text, '') || ':' ||
           active_steps::text || ':' || coalesce(active_step_id::text, '') AS x
    FROM fixture_live
  ) q
),
runtime_fp AS (
  SELECT md5(coalesce(string_agg(x, '|' ORDER BY x), '')) AS runtime_fp
  FROM (
    SELECT s.id::text || ':' || s.student_request_id::text || ':' ||
           s.status || ':' || s.step_order::text || ':' ||
           coalesce(s.workflow_step_id::text, '') AS x
    FROM public.student_request_workflow_steps s
    JOIN fixture_live l ON l.id = s.student_request_id
  ) q
),
enroll_protected AS (
  SELECT
    (SELECT count(*) FROM public.student_requests
      WHERE request_number IN (
        'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8'
      )) AS protected_request_count,
    (SELECT count(*) FROM public.official_documents
      WHERE document_number IN ('USR-2026-000001','USR-2026-000002')
        AND status = 'archived') AS protected_document_count,
    (
      SELECT count(*) FROM public.student_requests sr
      WHERE sr.request_type = 'enrollment_certificate'
        AND (
          COALESCE(sr.form_data->>'e2e_marker', '') = 'TEST_ONLY_B1_E2E_88'
          OR (sr.form_data ? 'e2e_correlation_id')
        )
    ) AS enroll_e2e_marker_hits
),
workflow_fp AS (
  SELECT md5(coalesce(string_agg(x, '|' ORDER BY x), '')) AS workflow_fp
  FROM (
    SELECT w.id::text || ':' || rt.code || ':' ||
           ws.id::text || ':' || ws.step_key || ':' ||
           coalesce(ws.action_type, '') || ':' ||
           coalesce(ws.processing_unit_id::text, '') || ':' ||
           coalesce(ws.processing_role_id::text, '') AS x
    FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    JOIN public.request_type_workflow_steps ws ON ws.workflow_id = w.id
    JOIN five_services f ON f.code = rt.code
  ) q
),
e2e_binding_hits AS (
  SELECT
    CASE
      WHEN to_regclass('public.b1_e2e_88_actor_bindings') IS NULL THEN 0::bigint
      ELSE (
        SELECT count(*) FROM public.b1_e2e_88_actor_bindings b
        WHERE b.active
          AND b.request_id IN (SELECT id FROM fixture_live)
      )
    END AS fixture_e2e_binding_hits
),
identity_inventory AS (
  SELECT
    (SELECT count(*) FROM auth.users u
      WHERE u.email ILIKE '%@testonly.quboolye.com'
         OR u.email = 'test-only.b1.e2e03@usr.edu.ye') AS testonly_auth_shells,
    (
      SELECT count(DISTINCT u.id) FROM auth.users u
      WHERE (u.email ILIKE '%@testonly.quboolye.com'
             OR u.email = 'test-only.b1.e2e03@usr.edu.ye')
        AND (
          EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.user_id = u.id)
          OR EXISTS (SELECT 1 FROM public.staff_profiles st WHERE st.user_id = u.id)
          OR EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.user_id = u.id)
        )
    ) AS testonly_profiles,
    (SELECT count(*) FROM public.staff_profiles sp
      JOIN auth.users u ON u.id = sp.user_id
      WHERE u.email ILIKE '%@testonly.quboolye.com') AS testonly_staff,
    (SELECT count(*) FROM public.faculty_profiles fp
      JOIN auth.users u ON u.id = fp.user_id
      WHERE u.email ILIKE '%@testonly.quboolye.com') AS testonly_faculty,
    (SELECT count(*) FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
      WHERE u.email ILIKE '%@testonly.quboolye.com') AS testonly_roles,
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.email IN (
        'student@testonly.quboolye.com',
        'e2e02@testonly.quboolye.com',
        'test-only.b1.e2e02@testonly.quboolye.com',
        'test-only.b1.e2e03@usr.edu.ye'
      )
    ) AS owner_student_shell,
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.email ILIKE '%@testonly.quboolye.com'
        AND u.email NOT IN (
          'student@testonly.quboolye.com',
          'e2e02@testonly.quboolye.com',
          'test-only.b1.e2e02@testonly.quboolye.com'
        )
    ) AS other_student_candidate,
    EXISTS (
      SELECT 1
      FROM public.faculty_profiles fp
      JOIN auth.users u ON u.id = fp.user_id
      WHERE u.email ILIKE '%@testonly.quboolye.com'
        AND NOT EXISTS (
          SELECT 1 FROM public.staff_profiles sp WHERE sp.user_id = u.id
        )
    ) AS faculty_only_negative_ready,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
      WHERE (u.email ILIKE '%@testonly.quboolye.com'
             OR u.email = 'unrelated.admin.test.01d@quboolye.test')
        AND ur.role::text IN ('admin', 'system_admin')
    ) AS admin_role_negative_ready,
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.email = 'unrelated.admin.test.01d@quboolye.test'
    ) AS unrelated_admin_shell_exists,
    'UNKNOWN'::text AS password_usability
),
dept_identities AS (
  SELECT
    EXISTS (SELECT 1 FROM public.departments WHERE id = 'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid) AS source_dept_ok,
    EXISTS (SELECT 1 FROM public.departments WHERE id = '11111111-1111-4111-8111-111111111111'::uuid) AS target_dept_ok
),
gate_rows AS (
  -- G01 project identity
  SELECT
    'G01'::text AS gate,
    'project_ref_attestation'::text AS check_name,
    CASE
      WHEN a.attested_project_ref IS NULL THEN 'HOLD'
      WHEN a.attested_project_ref IS DISTINCT FROM p.expected_project_ref THEN 'HOLD'
      ELSE 'PASS'
    END AS status,
    CASE
      WHEN a.attested_project_ref IS NULL THEN 'PROJECT_IDENTITY_UNPROVEN'
      WHEN a.attested_project_ref IS DISTINCT FROM p.expected_project_ref THEN 'PROJECT_IDENTITY_MISMATCH'
      ELSE 'PROJECT_REF_ATTESTED'
    END AS detail,
    jsonb_build_object(
      'expected_project_ref', p.expected_project_ref,
      'attested_project_ref', a.attested_project_ref,
      'txn_read_only', a.txn_read_only,
      'db_name', a.db_name
    ) AS evidence
  FROM params p CROSS JOIN attestation a

  UNION ALL

  -- G02 migration ledger
  SELECT
    'G02', 'migration_ledger_not_applied',
    CASE
      WHEN NOT ml.ledger_readable_candidate OR ml.ledger_hits < 0 THEN 'HOLD'
      WHEN ml.ledger_hits > 1 THEN 'HOLD'
      WHEN ml.ledger_hits = 1 THEN 'HOLD'
      WHEN ml.ledger_hits = 0
           AND NOT (SELECT has_executions OR has_bindings OR has_audit OR has_open_rpc FROM object_prestate)
        THEN 'PASS'
      WHEN ml.ledger_hits = 0
           AND (SELECT has_executions OR has_bindings OR has_audit OR has_open_rpc FROM object_prestate)
        THEN 'HOLD'
      ELSE 'HOLD'
    END,
    CASE
      WHEN NOT ml.ledger_readable_candidate OR ml.ledger_hits < 0 THEN 'MIGRATION_LEDGER_UNREADABLE'
      WHEN ml.ledger_hits > 1 THEN 'MIGRATION_LEDGER_AMBIGUOUS_OR_DUPLICATE'
      WHEN ml.ledger_hits = 1 THEN 'MIGRATION_88_ALREADY_APPLIED'
      WHEN ml.ledger_hits = 0
           AND (SELECT has_executions OR has_bindings OR has_audit OR has_open_rpc FROM object_prestate)
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      WHEN ml.ledger_hits = 0 THEN 'MIGRATION_88_NOT_APPLIED'
      ELSE 'MIGRATION_LEDGER_UNEXPECTED'
    END,
    jsonb_build_object(
      'expected_version', p.expected_migration_version,
      'expected_token', p.expected_migration_token,
      'ledger_hits', ml.ledger_hits,
      'migration_count', ml.migration_count,
      'migration_head', ml.migration_head,
      'migration_raw_sha256', p.migration_raw_sha256,
      'migration_lf_sha256', p.migration_lf_sha256,
      'object_identity_alias_search', 'also fails closed on partial b1_e2e_88_* object presence'
    )
  FROM params p CROSS JOIN migration_ledger ml

  UNION ALL

  -- G03 object pre-state (absence)
  SELECT
    'G03', 'migration_88_objects_absent',
    CASE
      WHEN (SELECT has_executions::int + has_bindings::int + has_audit::int
                 + has_open_rpc::int + has_close_rpc::int + has_bind_rpc::int
                 + has_cleanup_rpc::int + has_actor_binding_fn::int
                 + has_dept_binding_fn::int + has_marker_fn::int
                 + has_guard_fn::int + has_e2e_trigger::int
                 + CASE WHEN e2e_policy_count > 0 THEN 1 ELSE 0 END
            FROM object_prestate) = 0
        THEN 'PASS'
      WHEN (SELECT has_executions AND has_bindings AND has_audit AND has_open_rpc FROM object_prestate)
        THEN 'HOLD'
      ELSE 'HOLD'
    END,
    CASE
      WHEN (SELECT has_executions::int + has_bindings::int + has_audit::int
                 + has_open_rpc::int + has_close_rpc::int + has_bind_rpc::int
                 + has_cleanup_rpc::int + has_actor_binding_fn::int
                 + has_dept_binding_fn::int + has_marker_fn::int
                 + has_guard_fn::int + has_e2e_trigger::int
                 + CASE WHEN e2e_policy_count > 0 THEN 1 ELSE 0 END
            FROM object_prestate) = 0
        THEN 'OBJECTS_ABSENT'
      WHEN (SELECT has_executions AND has_bindings AND has_audit AND has_open_rpc FROM object_prestate)
        THEN 'MIGRATION_88_OBJECTS_PRESENT_FULL'
      ELSE 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
    END,
    (SELECT to_jsonb(object_prestate.*) FROM object_prestate)

  UNION ALL

  -- G04 function preimages
  SELECT
    'G04', 'four_function_preimages',
    CASE
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE match_count <> 1 OR observed_fp IS NULL) THEN 'HOLD'
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE observed_fp IS DISTINCT FROM expected_base_fp) THEN 'HOLD'
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE body_mentions_e2e_88) THEN 'HOLD'
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE observed_fp = forbidden_m88_fp) THEN 'HOLD'
      ELSE 'PASS'
    END,
    CASE
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE match_count <> 1 OR observed_fp IS NULL)
        THEN 'HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE observed_fp IS DISTINCT FROM expected_base_fp)
        THEN 'HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE body_mentions_e2e_88 OR observed_fp = forbidden_m88_fp)
        THEN 'HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT'
      ELSE 'FUNCTION_PREIMAGES_MATCH_BASE'
    END,
    jsonb_build_object(
      'functions', (SELECT jsonb_agg(to_jsonb(fn_eval) ORDER BY identity) FROM fn_eval)
    )

  UNION ALL

  -- G05 five-service visibility
  SELECT
    'G05', 'five_service_visibility',
    CASE
      WHEN v.five_present = 5 AND v.five_hidden_active = 5 AND v.five_visibility_drift = 0
        THEN 'PASS' ELSE 'HOLD'
    END,
    CASE
      WHEN v.five_present = 5 AND v.five_hidden_active = 5 AND v.five_visibility_drift = 0
        THEN 'FIVE_SERVICES_HIDDEN_ACTIVE'
      ELSE 'SERVICE_VISIBILITY_DRIFT'
    END,
    jsonb_build_object(
      'five_present', v.five_present,
      'five_hidden_active', v.five_hidden_active,
      'five_visibility_drift', v.five_visibility_drift,
      'services', ARRAY(SELECT code FROM five_services ORDER BY 1)
    )
  FROM visibility v

  UNION ALL

  -- G06 enrollment_certificate protection
  SELECT
    'G06', 'enrollment_certificate_protection',
    CASE
      WHEN v.enrollment_certificate_exists
           AND v.enrollment_certificate_ok
           AND ep.enroll_e2e_marker_hits = 0
           AND ep.protected_request_count = 3
           AND ep.protected_document_count = 2
        THEN 'PASS' ELSE 'HOLD'
    END,
    CASE
      WHEN NOT v.enrollment_certificate_exists THEN 'ENROLLMENT_CERTIFICATE_MISSING'
      WHEN NOT v.enrollment_certificate_ok THEN 'ENROLLMENT_CERTIFICATE_VISIBILITY_DRIFT'
      WHEN ep.enroll_e2e_marker_hits > 0 THEN 'ENROLLMENT_CERTIFICATE_E2E_MARKER_PRESENT'
      WHEN ep.protected_request_count <> 3 OR ep.protected_document_count <> 2
        THEN 'ENROLLMENT_CERTIFICATE_PROTECTED_IDENTITY_DRIFT'
      ELSE 'ENROLLMENT_CERTIFICATE_PROTECTED'
    END,
    jsonb_build_object(
      'enrollment_certificate_ok', v.enrollment_certificate_ok,
      'enroll_e2e_marker_hits', ep.enroll_e2e_marker_hits,
      'protected_request_count', ep.protected_request_count,
      'protected_document_count', ep.protected_document_count
    )
  FROM visibility v CROSS JOIN enroll_protected ep

  UNION ALL

  -- G07 authoritative fixtures
  SELECT
    'G07', 'authoritative_fixture_matrix_19',
    CASE
      WHEN fe.fixture_count = 19
           AND fe.identity_matches = 19
           AND fe.exactly_one_active = 19
           AND fe.e2e_marker_hits = 0
           AND fe.correlation_field_hits = 0
           AND eb.fixture_e2e_binding_hits = 0
           AND fe.fixture_15_restored_ok
           AND fe.fixture_15_completed_steps = 6
        THEN 'PASS' ELSE 'HOLD'
    END,
    CASE
      WHEN fe.fixture_count <> 19 THEN 'FIXTURE_COUNT_DRIFT'
      WHEN fe.identity_matches <> 19 THEN 'FIXTURE_IDENTITY_DRIFT'
      WHEN fe.exactly_one_active <> 19 THEN 'FIXTURE_ACTIVE_STEP_DRIFT'
      WHEN fe.e2e_marker_hits > 0 OR fe.correlation_field_hits > 0 OR eb.fixture_e2e_binding_hits > 0
        THEN 'FIXTURE_E2E_88_CONTAMINATION'
      WHEN NOT fe.fixture_15_restored_ok OR fe.fixture_15_completed_steps <> 6
        THEN 'FIXTURE_15_RESTORED_APPROVED_STATE_DRIFT'
      ELSE 'FIXTURES_19_OF_19_OK'
    END,
    jsonb_build_object(
      'fixture_count', fe.fixture_count,
      'identity_matches', fe.identity_matches,
      'exactly_one_active', fe.exactly_one_active,
      'e2e_marker_hits', fe.e2e_marker_hits,
      'correlation_field_hits', fe.correlation_field_hits,
      'fixture_e2e_binding_hits', eb.fixture_e2e_binding_hits,
      'fixture_15_restored_ok', fe.fixture_15_restored_ok,
      'fixture_15_completed_steps', fe.fixture_15_completed_steps
    )
  FROM fixture_eval fe CROSS JOIN e2e_binding_hits eb

  UNION ALL

  -- G08 RPA fingerprint
  SELECT
    'G08', 'request_processing_assignments_fingerprint',
    CASE
      WHEN rd.duplicate_active_groups = 0 AND rf.active_row_count > 0 THEN 'PASS'
      WHEN rd.duplicate_active_groups > 0 THEN 'HOLD'
      ELSE 'HOLD'
    END,
    CASE
      WHEN rd.duplicate_active_groups > 0 THEN 'RPA_AMBIGUOUS_DUPLICATE_ACTIVE'
      WHEN rf.active_row_count = 0 THEN 'RPA_SCOPE_EMPTY_OR_UNPROVEN'
      ELSE 'RPA_FINGERPRINT_CAPTURED'
    END,
    jsonb_build_object(
      'rpa_fingerprint', rf.fingerprint,
      'active_row_count', rf.active_row_count,
      'duplicate_active_groups', rd.duplicate_active_groups,
      'preflight_mutates_rpa', false
    )
  FROM rpa_fp rf CROSS JOIN rpa_dup rd

  UNION ALL

  -- G09 protected-surface fingerprints
  SELECT
    'G09', 'protected_surface_fingerprints',
    'PASS',
    'FINGERPRINTS_CAPTURED',
    jsonb_build_object(
      'request_types_fp', pf.request_types_fp,
      'fixtures_fp', ff.fixtures_fp,
      'runtime_fp', rt.runtime_fp,
      'rpa_fingerprint', rf.fingerprint,
      'workflow_fp', wf.workflow_fp,
      'protected_requests', ep.protected_request_count,
      'protected_documents', ep.protected_document_count
    )
  FROM protected_fp pf
  CROSS JOIN fixture_fp ff
  CROSS JOIN runtime_fp rt
  CROSS JOIN rpa_fp rf
  CROSS JOIN workflow_fp wf
  CROSS JOIN enroll_protected ep

  UNION ALL

  -- G10 TEST_ONLY identity inventory (read-only; passwords UNKNOWN)
  SELECT
    'G10', 'test_only_identity_inventory',
    'PASS',
    'INVENTORY_CAPTURED_PASSWORD_UNKNOWN',
    jsonb_build_object(
      'auth_shell_count', ii.testonly_auth_shells,
      'profile_count', ii.testonly_profiles,
      'staff_count', ii.testonly_staff,
      'faculty_count', ii.testonly_faculty,
      'role_count', ii.testonly_roles,
      'password_usability', ii.password_usability,
      'faculty_only_negative_ready', ii.faculty_only_negative_ready,
      'admin_role_negative_ready', ii.admin_role_negative_ready,
      'unrelated_admin_shell_exists', ii.unrelated_admin_shell_exists,
      'note', 'Inventory only. No Auth create/repair. Password usability always UNKNOWN.'
    )
  FROM identity_inventory ii

  UNION ALL

  -- G11 production E2E prerequisites classification
  SELECT
    'G11', 'production_e2e_prerequisites',
    'HOLD',
    'PREREQUISITES_NOT_READY_OR_UNPROVEN',
    jsonb_build_object(
      'owner_student', CASE WHEN ii.owner_student_shell THEN 'READY' ELSE 'NOT_READY' END,
      'other_student_negatives', CASE WHEN ii.other_student_candidate THEN 'AMBIGUOUS' ELSE 'NOT_READY' END,
      'workflow_actors', CASE WHEN ii.testonly_auth_shells >= 8 THEN 'AMBIGUOUS' ELSE 'NOT_READY' END,
      'faculty_only_negative', CASE WHEN ii.faculty_only_negative_ready THEN 'READY' ELSE 'NOT_READY' END,
      'admin_role_negative', CASE WHEN ii.admin_role_negative_ready THEN 'READY' ELSE 'NOT_READY' END,
      'password_session_ability', 'UNPROVEN',
      'department_source_target',
        CASE WHEN d.source_dept_ok AND d.target_dept_ok THEN 'READY' ELSE 'NOT_READY' END,
      'attachment_prerequisites', 'UNPROVEN',
      'service_business_data_prerequisites', 'UNPROVEN',
      'password_usability', ii.password_usability,
      'classification_rule',
        'Identity readiness cannot become PASS while password_usability=UNKNOWN'
    )
  FROM identity_inventory ii CROSS JOIN dept_identities d

  UNION ALL

  -- G12 apply feasibility
  SELECT
    'G12', 'apply_feasibility',
    CASE
      WHEN (SELECT has_executions OR has_bindings OR has_audit OR has_open_rpc FROM object_prestate)
        THEN 'HOLD'
      WHEN (SELECT ledger_hits FROM migration_ledger) > 0 THEN 'HOLD'
      WHEN (SELECT NOT ledger_readable_candidate OR ledger_hits < 0 FROM migration_ledger) THEN 'HOLD'
      ELSE 'PASS'
    END,
    CASE
      WHEN (SELECT has_executions OR has_bindings OR has_audit OR has_open_rpc FROM object_prestate)
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      WHEN (SELECT ledger_hits FROM migration_ledger) > 0 THEN 'MIGRATION_88_ALREADY_APPLIED'
      WHEN (SELECT NOT ledger_readable_candidate OR ledger_hits < 0 FROM migration_ledger)
        THEN 'MIGRATION_LEDGER_UNREADABLE'
      ELSE 'APPLY_FEASIBILITY_SOURCE_READY_NOT_AUTHORIZED'
    END,
    jsonb_build_object(
      'expected_source_version', p.expected_migration_version,
      'recommended_managed_alias_strategy',
        'Prefer exact version 20260804120000; if Lovable rewrites the name, match post-apply by object identity (b1_e2e_88_* tables + open/bind/cleanup RPCs), never by filename alone',
      'preflight_fingerprint_package', '97',
      'migration_raw_sha256', p.migration_raw_sha256,
      'migration_lf_sha256', p.migration_lf_sha256,
      'migration_raw_bytes', p.migration_raw_bytes,
      'migration_lf_bytes', p.migration_lf_bytes,
      'expected_object_delta',
        jsonb_build_object(
          'tables_added', 3,
          'triggers_added', 2,
          'new_functions_added', 18,
          'functions_replaced', 4,
          'rls_enabled_tables', 3,
          'policies_added', 0,
          'data_dml_rows', 0
        ),
      'expected_function_replacements', jsonb_build_array(
        'public.create_student_request(text,text,jsonb,text)',
        'public.user_matches_workflow_runtime_step(uuid)',
        'public.current_user_matches_transfer_department_scope(uuid,text)',
        'public.can_current_user_act_on_step(uuid,text)'
      ),
      'zero_data_dml_during_apply', true,
      'this_package_authorizes_apply', false
    )
  FROM params p

  UNION ALL

  -- G13 decommission readiness
  SELECT
    'G13', 'decommission_readiness',
    'PASS',
    'DECOMMISSION_DRAFT_PINNED',
    jsonb_build_object(
      'cleanup_draft_path', p.decommission_draft_path,
      'cleanup_raw_sha256', p.decommission_raw_sha256,
      'cleanup_lf_sha256', p.decommission_lf_sha256,
      'cleanup_raw_bytes', p.decommission_raw_bytes,
      'post_decommission_base_fingerprints', jsonb_build_object(
        'create_student_request', p.fp_create_student_request_base,
        'user_matches_workflow_runtime_step', p.fp_user_matches_base,
        'current_user_matches_transfer_department_scope', p.fp_transfer_scope_base,
        'can_current_user_act_on_step', p.fp_can_act_base
      ),
      'operational_cleanup_prerequisites',
        'open executions = 0; active bindings = 0; CAS assignee snapshots align',
      'automatic_test_only_request_deletion', false,
      'audit_preservation', 'b1_e2e_88_audit_events append-only retained until separate purge authorization'
    )
  FROM params p
),
gates_core AS (
  SELECT gate, check_name, status, detail, evidence FROM gate_rows
),
final_decision AS (
  SELECT
    'G14'::text AS gate,
    'stop_conditions_final_decision'::text AS check_name,
    'HOLD'::text AS status,
    CASE
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE detail = 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED')
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE detail = 'HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT')
        THEN 'HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G01' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_PROJECT_IDENTITY_UNPROVEN'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G02' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_MIGRATION_LEDGER'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G05' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_SERVICE_VISIBILITY_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G06' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_ENROLLMENT_CERTIFICATE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G07' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_FIXTURE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G08' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_RPA_AMBIGUITY'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G11' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_E2E_PREREQUISITES_UNPROVEN'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_PREFLIGHT_STOP'
      ELSE 'HOLD_B1_E2E_88_PREFLIGHT_STOP'
    END AS detail,
    jsonb_build_object(
      'gate_statuses', (SELECT jsonb_object_agg(gate, status) FROM gates_core),
      'hold_gates', (SELECT coalesce(jsonb_agg(gate ORDER BY gate), '[]'::jsonb)
                     FROM gates_core WHERE status = 'HOLD'),
      'production_execution_claim', false,
      'migration_88_apply_authorized', false,
      'package_mode', 'SOURCE_READONLY_PREFLIGHT_97',
      'stop_if', jsonb_build_array(
        'project identity unproven',
        'migration already applied',
        'partial objects exist',
        'function preimage drift',
        'service visibility drift',
        'Fixture count/state drift',
        'enrollment_certificate drift',
        'RPA ambiguity',
        'missing required identity',
        'password/session ability unproven',
        'faculty-only/admin-negative identities missing',
        'any query error',
        'any result count unexpected'
      )
    ) AS evidence
)
SELECT gate, check_name, status, detail, evidence
FROM (
  SELECT * FROM gates_core
  UNION ALL
  SELECT * FROM final_decision
) q
ORDER BY gate;

ROLLBACK;
