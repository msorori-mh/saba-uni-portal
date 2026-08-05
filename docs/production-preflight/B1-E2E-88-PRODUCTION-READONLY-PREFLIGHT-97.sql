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
-- Zero dynamic EXECUTE.
-- Zero temp tables.
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
-- Lovable project id (active): 90f4dcde-07fb-4441-b86a-6ad5510833b8
-- Lovable project id (historical/stale; do not use): 4b291119-790f-4484-9285-c2b774e1ba6f
-- Source merge HEAD: e0cf9d48acb562109aaf310dbd5e534b900c6d90
--
-- Privileged-schema contract:
--   Executable SQL may read only public, pg_catalog, and information_schema.
--   Never SELECT/JOIN/call/EXECUTE against auth, storage, vault, realtime,
--   supabase_functions, supabase_migrations, net, cron, pgmq, or any other
--   restricted schema. Schema names may appear in comments, evidence labels,
--   expected object-name strings, and pg_catalog metadata predicates only.
--   Catalog presence/USAGE may be inspected via pg_catalog / has_schema_privilege;
--   never via to_regclass / relation SELECT that requires restricted USAGE.
--
-- Project identity (G01):
--   SQL alone cannot PASS. Database metadata cannot independently prove
--   the Supabase project ref. User-supplied set_config / GUCs must NEVER
--   make G01 PASS. Operational classification requires trusted Lovable
--   channel attestation of wpmicqriltrowwonknox plus G02–G14 results.
--
-- Migration ledger (G02):
--   SQL never queries the managed migration ledger relation. The Lovable
--   read-only role may lack schema USAGE; any static/dynamic probe of that
--   relation can abort the whole preflight. G02 therefore always reports
--   ledger readability as UNREADABLE from SQL, returns status UNPROVEN with
--   code HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE when the ledger cannot
--   be read independently, and separately reports Migration-88 object-state
--   inference from pg_catalog only. Final operational G02 combines SQL
--   object-state with trusted Lovable-managed migration-history metadata
--   outside SQL (never user prompt / GUC / set_config).
--
-- Auth inventory (G10/G11):
--   SQL never reads auth.users or any auth.* relation. G10 returns a
--   public-side TEST_ONLY identity inventory only, with Auth-user existence
--   UNPROVEN, password usability UNKNOWN, session usability UNKNOWN, and
--   status UNPROVEN / HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE. G11 remains
--   fail-closed. Final Auth readiness requires trusted Lovable Auth
--   attestation outside SQL (no password/secret printing).
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
    '9c9090f29458975b197b92dc86b0e587'::text AS fp_create_student_request_base,
    'e25e7e4f6cb759814857abcd509ae49e'::text AS fp_user_matches_base,
    '4a3c50af92db046b1571eba0e4073f64'::text AS fp_transfer_scope_base,
    'f0bf40897b23c49bfee1044b2ce34e3d'::text AS fp_can_act_base,
    'ed11125e55df36b154c432c7e28d7285'::text AS fp_create_student_request_m88,
    '2fba2db758a2edd42b1c440a36a4aa47'::text AS fp_user_matches_m88,
    '396eb3a5f12fb7d46018823930d87851'::text AS fp_transfer_scope_m88,
    '586893beacb33c10a1483b38e8d090fd'::text AS fp_can_act_m88
),
session_meta AS (
  SELECT
    current_setting('transaction_read_only', true) AS txn_read_only,
    current_database() AS db_name,
    current_user AS db_user,
    inet_server_addr()::text AS server_addr,
    current_setting('server_version', true) AS server_version
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
    (1, 'SR-20260801-13000001'::text, 'f1300000-0000-4000-8000-000000000001'::uuid, 'department_transfer'::text, 'in_review'::text, 2, 'source_department_head_approval'::text, 'f1300001-0000-4000-8000-000001000002'::uuid, 'approve'::text, 'department'::text, 'department_head'::text, 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e'::uuid, 'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid, 'source'::text),
    (2, 'SR-20260801-13000002', 'f1300000-0000-4000-8000-000000000002'::uuid, 'department_transfer', 'in_review', 3, 'target_department_head_approval', 'f1300001-0000-4000-8000-000002000003'::uuid, 'approve', 'department', 'department_head', '97acbe02-c59c-409c-8d51-7d4ef72e6db7'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'target'),
    (3, 'SR-20260801-13000003', 'f1300000-0000-4000-8000-000000000003'::uuid, 'department_transfer', 'in_review', 4, 'dean_approval', 'f1300001-0000-4000-8000-000003000004'::uuid, 'approve', 'dean', 'dean', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0'::uuid, NULL::uuid, NULL),
    (4, 'SR-20260801-13000004', 'f1300000-0000-4000-8000-000000000004'::uuid, 'department_transfer', 'in_review', 5, 'payment_confirmation', 'f1300001-0000-4000-8000-000004000005'::uuid, 'confirm_payment', 'finance', 'revenue_finance_officer', '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, NULL::uuid, NULL),
    (5, 'SR-20260801-13000005', 'f1300000-0000-4000-8000-000000000005'::uuid, 'department_transfer', 'in_review', 6, 'registrar_apply', 'f1300001-0000-4000-8000-000005000006'::uuid, 'apply_decision', 'registrar', 'registrar_general', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, NULL::uuid, NULL),
    (6, 'SR-20260801-13000006', 'f1300000-0000-4000-8000-000000000006'::uuid, 'enrollment_suspension', 'in_review', 2, 'manager_approval', 'f1300001-0000-4000-8000-000006000002'::uuid, 'approve', 'student_affairs', 'student_affairs_manager', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, NULL::uuid, NULL),
    (7, 'SR-20260801-13000007', 'f1300000-0000-4000-8000-000000000007'::uuid, 'enrollment_suspension', 'in_review', 3, 'registrar_apply', 'f1300001-0000-4000-8000-000007000003'::uuid, 'apply_decision', 'registrar', 'registrar_general', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, NULL::uuid, NULL),
    (8, 'SR-20260801-13000008', 'f1300000-0000-4000-8000-000000000008'::uuid, 'excused_absence', 'in_review', 2, 'manager_review', 'f1300001-0000-4000-8000-000008000002'::uuid, 'approve', 'student_affairs', 'student_affairs_manager', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, NULL::uuid, NULL),
    (9, 'SR-20260801-13000009', 'f1300000-0000-4000-8000-000000000009'::uuid, 'excused_absence', 'in_review', 3, 'record_apply', 'f1300001-0000-4000-8000-000009000003'::uuid, 'apply_decision', 'student_affairs', 'student_affairs_specialist', 'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid, NULL::uuid, NULL),
    (10, 'SR-20260801-13000010', 'f1300000-0000-4000-8000-000000000010'::uuid, 'file_withdrawal', 'in_review', 2, 'library_clearance', 'f1300001-0000-4000-8000-000010000002'::uuid, 'clear', 'library', 'library_officer', 'e7a93314-bb06-4525-b412-5315198c668a'::uuid, NULL::uuid, NULL),
    (11, 'SR-20260801-13000011', 'f1300000-0000-4000-8000-000000000011'::uuid, 'file_withdrawal', 'in_review', 3, 'labs_clearance', 'f1300001-0000-4000-8000-000011000003'::uuid, 'clear', 'labs', 'labs_manager', '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid, NULL::uuid, NULL),
    (12, 'SR-20260801-13000012', 'f1300000-0000-4000-8000-000000000012'::uuid, 'file_withdrawal', 'in_review', 4, 'activities_clearance', 'f1300001-0000-4000-8000-000012000004'::uuid, 'clear', 'student_affairs', 'student_affairs_manager', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, NULL::uuid, NULL),
    (13, 'SR-20260801-13000013', 'f1300000-0000-4000-8000-000000000013'::uuid, 'file_withdrawal', 'in_review', 5, 'finance_clearance', 'f1300001-0000-4000-8000-000013000005'::uuid, 'clear', 'finance', 'revenue_finance_officer', '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, NULL::uuid, NULL),
    (14, 'SR-20260801-13000014', 'f1300000-0000-4000-8000-000000000014'::uuid, 'file_withdrawal', 'in_review', 6, 'registrar_apply', 'f1300001-0000-4000-8000-000014000006'::uuid, 'apply_decision', 'registrar', 'registrar_general', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, NULL::uuid, NULL),
    (15, 'SR-20260801-13000015', 'f1300000-0000-4000-8000-000000000015'::uuid, 'file_withdrawal', 'in_review', 7, 'archive', 'f1300001-0000-4000-8000-000015000007'::uuid, 'archive', 'archive', 'archive_officer', 'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid, NULL::uuid, NULL),
    (16, 'SR-20260801-13000016', 'f1300000-0000-4000-8000-000000000016'::uuid, 'final_chance', 'in_review', 2, 'manager_review', 'f1300001-0000-4000-8000-000016000002'::uuid, 'approve', 'student_affairs', 'student_affairs_manager', 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, NULL::uuid, NULL),
    (17, 'SR-20260801-13000017', 'f1300000-0000-4000-8000-000000000017'::uuid, 'final_chance', 'in_review', 3, 'dean_decision', 'f1300001-0000-4000-8000-000017000003'::uuid, 'approve', 'dean', 'dean', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0'::uuid, NULL::uuid, NULL),
    (18, 'SR-20260801-13000018', 'f1300000-0000-4000-8000-000000000018'::uuid, 'final_chance', 'in_review', 4, 'payment_confirmation', 'f1300001-0000-4000-8000-000018000004'::uuid, 'confirm_payment', 'finance', 'revenue_finance_officer', '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, NULL::uuid, NULL),
    (19, 'SR-20260801-13000019', 'f1300000-0000-4000-8000-000000000019'::uuid, 'final_chance', 'in_review', 5, 'registrar_apply', 'f1300001-0000-4000-8000-000019000005'::uuid, 'apply_decision', 'registrar', 'registrar_general', '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, NULL::uuid, NULL)
  ) AS t(
    case_index, request_number, request_id, service_code, request_status,
    step_index, step_code, runtime_step_id, configured_action,
    processing_unit_code, processing_role_code, direct_assignee_principal_id,
    department_scope_id, department_side
  )
),
m88_fn_expect AS (
  SELECT * FROM (VALUES
    ('public.b1_e2e_88_audit_events_deny_mutate()'::text),
    ('public.b1_e2e_88_is_five_service(text)'::text),
    ('public.b1_e2e_88_marker()'::text),
    ('public.b1_e2e_88_parse_correlation(text)'::text),
    ('public.b1_e2e_88_request_correlation(uuid)'::text),
    ('public.b1_e2e_88_request_is_marked(uuid)'::text),
    ('public.b1_e2e_88_correlations_aligned(uuid, uuid, uuid)'::text),
    ('public.b1_e2e_88_write_audit(text, uuid, uuid, uuid, uuid, uuid, jsonb)'::text),
    ('public.b1_e2e_88_execution_is_live(uuid)'::text),
    ('public.current_user_has_b1_e2e_88_actor_binding(uuid, uuid, text)'::text),
    ('public.current_user_has_b1_e2e_88_department_binding(uuid, text)'::text),
    ('public.b1_e2e_88_allows_hidden_create(text, jsonb)'::text),
    ('public.open_b1_e2e_88_execution(uuid, uuid, text, timestamp with time zone, jsonb)'::text),
    ('public.close_b1_e2e_88_execution(uuid, text)'::text),
    ('public.bind_b1_e2e_88_actor_to_runtime_step(uuid, uuid, uuid, uuid, text, uuid, text)'::text),
    ('public.b1_e2e_88_step_matches_applied_snapshot(uuid, jsonb)'::text),
    ('public.cleanup_b1_e2e_88_package(uuid, boolean)'::text),
    ('public.guard_b1_e2e_88_immutable_marker()'::text)
  ) AS t(identity)
),
-- Catalog-only presence (pg_catalog / information_schema). Never SELECT from M88 tables.
m88_tables AS (
  SELECT
    e.relname AS table_name,
    true AS present,
    pg_get_userbyid(c.relowner) AS owner,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    coalesce((
      SELECT string_agg(
        x.grantee::regrole::text || '=' || x.privilege_type,
        ','
        ORDER BY x.grantee::regrole::text, x.privilege_type
      )
      FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner)))
        AS x(grantee, grantor, privilege_type, is_grantable)
    ), '<NULL>') AS table_acl
  FROM (VALUES
    ('b1_e2e_88_executions'),
    ('b1_e2e_88_actor_bindings'),
    ('b1_e2e_88_audit_events')
  ) AS e(relname)
  JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
  JOIN pg_catalog.pg_class c
    ON c.relnamespace = n.oid
   AND c.relname = e.relname
   AND c.relkind = 'r'
),
m88_tables_missing AS (
  SELECT v.relname AS table_name
  FROM (VALUES
    ('b1_e2e_88_executions'),
    ('b1_e2e_88_actor_bindings'),
    ('b1_e2e_88_audit_events')
  ) AS v(relname)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v.relname
      AND c.relkind = 'r'
  )
),
m88_fns AS (
  SELECT
    e.identity,
    true AS present,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    coalesce((
      SELECT string_agg(
        grantee::regrole::text || '=' || privilege_type,
        ','
        ORDER BY grantee::regrole::text, privilege_type
      )
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    ), '<NULL>') AS execute_acl,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  FROM m88_fn_expect e
  JOIN pg_catalog.pg_proc p
    ON p.oid = to_regprocedure(e.identity)
),
m88_fns_missing AS (
  SELECT e.identity
  FROM m88_fn_expect e
  WHERE to_regprocedure(e.identity) IS NULL
),
m88_triggers AS (
  SELECT
    e.tgname AS trigger_name,
    e.relname AS table_name,
    true AS present,
    pg_get_triggerdef(t.oid, true) AS trigger_def
  FROM (VALUES
    ('trg_b1_e2e_88_audit_no_update', 'b1_e2e_88_audit_events'),
    ('trg_guard_b1_e2e_88_immutable_marker', 'student_requests')
  ) AS e(tgname, relname)
  JOIN pg_catalog.pg_trigger t ON t.tgname = e.tgname AND NOT t.tgisinternal
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid AND c.relname = e.relname
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
),
m88_triggers_missing AS (
  SELECT e.tgname AS trigger_name, e.relname AS table_name
  FROM (VALUES
    ('trg_b1_e2e_88_audit_no_update', 'b1_e2e_88_audit_events'),
    ('trg_guard_b1_e2e_88_immutable_marker', 'student_requests')
  ) AS e(tgname, relname)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND t.tgname = e.tgname
      AND c.relname = e.relname
      AND NOT t.tgisinternal
  )
),
object_prestate AS (
  SELECT
    (SELECT count(*) FROM m88_tables) AS tables_present,
    (SELECT count(*) FROM m88_tables_missing) AS tables_missing,
    (SELECT count(*) FROM m88_fns) AS functions_present,
    (SELECT count(*) FROM m88_fns_missing) AS functions_missing,
    (SELECT count(*) FROM m88_triggers) AS triggers_present,
    (SELECT count(*) FROM m88_triggers_missing) AS triggers_missing,
    (
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('b1_e2e_88_executions','b1_e2e_88_actor_bindings','b1_e2e_88_audit_events')
    ) AS info_schema_table_hits,
    (
      SELECT count(*) FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN ('b1_e2e_88_executions','b1_e2e_88_actor_bindings','b1_e2e_88_audit_events')
        AND c.relrowsecurity
    ) AS rls_enabled_count,
    (
      SELECT count(*) FROM pg_catalog.pg_policy pol
      JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('b1_e2e_88_executions','b1_e2e_88_actor_bindings','b1_e2e_88_audit_events')
    ) AS e2e_policy_count,
    -- Catalog presence of bindings table counts as contamination without row SELECT.
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'b1_e2e_88_actor_bindings'
    ) AS bindings_table_present
),
object_inventory_counts AS (
  SELECT
    (SELECT tables_present + functions_present + triggers_present
            + CASE WHEN e2e_policy_count > 0 THEN 1 ELSE 0 END
     FROM object_prestate) AS present_object_hits,
    (SELECT 3 + 18 + 2 FROM params) AS expected_object_total,
    (SELECT tables_present = 3 AND functions_present = 18 AND triggers_present = 2
     FROM object_prestate) AS full_object_set_present,
    (SELECT tables_present + functions_present + triggers_present = 0
            AND e2e_policy_count = 0
     FROM object_prestate) AS all_objects_absent
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
fn_catalog AS (
  SELECT
    e.identity,
    md5(
      regexp_replace(pg_get_functiondef(p.oid), E'[\n\r\t ]+', ' ', 'g')
      || '|' || pg_get_userbyid(p.proowner)
      || '|' || p.prosecdef::text
      || '|' || p.provolatile::text
      || '|' || p.proisstrict::text
      || '|' || p.proparallel::text
      || '|' || coalesce(array_to_string(p.proconfig, ','), '<NULL>')
      || '|' || coalesce((
           SELECT string_agg(
             grantee::regrole::text || '=' || privilege_type,
             ','
             ORDER BY grantee::regrole::text, privilege_type
           )
           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
         ), '<NULL>')
      || '|' || pg_get_function_identity_arguments(p.oid)
    ) AS fingerprint,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.provolatile::text AS volatility,
    p.proisstrict AS is_strict,
    p.proparallel::text AS parallel_safety,
    coalesce(array_to_string(p.proconfig, ','), '<NULL>') AS proconfig,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    coalesce((
      SELECT string_agg(
        grantee::regrole::text || '=' || privilege_type,
        ','
        ORDER BY grantee::regrole::text, privilege_type
      )
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    ), '<NULL>') AS acl,
    (position('b1_e2e_88' in pg_get_functiondef(p.oid)) > 0) AS body_mentions_e2e_88
  FROM fn_expect e
  JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure(e.identity)
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
-- Ledger is never queried from SQL (no managed-ledger relation access).
-- Readability is always UNREADABLE for this package; object-state uses pg_catalog.
migration_ledger AS (
  SELECT
    false AS ledger_readable,
    'UNREADABLE'::text AS ledger_readability,
    'sql_cannot_independently_read_managed_ledger'::text AS ledger_attestation_source,
    NULL::bigint AS ledger_hits,
    NULL::bigint AS migration_count,
    NULL::text AS migration_head
),
object_state_inference AS (
  SELECT
    CASE
      WHEN (SELECT all_objects_absent FROM object_inventory_counts)
        THEN 'OBJECT_STATE_NOT_APPLIED'
      WHEN (SELECT full_object_set_present FROM object_inventory_counts)
           AND (SELECT e2e_policy_count FROM object_prestate) = 0
        THEN 'OBJECT_STATE_APPLIED_OR_EQUIVALENT'
      WHEN (SELECT present_object_hits FROM object_inventory_counts) > 0
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      ELSE 'HOLD'
    END AS object_state_code,
    (SELECT all_objects_absent FROM object_inventory_counts) AS objects_absent,
    (SELECT full_object_set_present FROM object_inventory_counts)
      AND (SELECT e2e_policy_count FROM object_prestate) = 0 AS objects_complete,
    (SELECT present_object_hits FROM object_inventory_counts) > 0
      AND NOT (
        (SELECT full_object_set_present FROM object_inventory_counts)
        AND (SELECT e2e_policy_count FROM object_prestate) = 0
      ) AS objects_partial,
    (SELECT present_object_hits FROM object_inventory_counts) AS present_object_hits,
    (SELECT expected_object_total FROM object_inventory_counts) AS expected_object_total
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
      ORDER BY s.step_order, s.id LIMIT 1) AS active_step_id,
    (SELECT s.workflow_step_id FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_workflow_step_id,
    (SELECT s.step_key FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_step_key,
    (SELECT s.step_order FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_step_order,
    (SELECT s.status FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_step_status,
    (SELECT s.processing_unit_id FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_unit_id,
    (SELECT s.processing_role_id FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_role_id,
    (SELECT coalesce(s.assigned_user_id, s.assigned_staff_profile_id, s.assigned_faculty_profile_id,
                     s.assigned_position_assignment_id)
       FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_direct_assignee,
    (SELECT s.metadata->>'direct_assignment_id'
       FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = sr.id AND s.status = 'active'
      ORDER BY s.step_order, s.id LIMIT 1) AS active_direct_assignment_id,
    COALESCE(sr.form_data->>'e2e_marker', '<NULL>') AS e2e_marker,
    COALESCE(sr.form_data->>'e2e_correlation_id', '<NULL>') AS e2e_correlation,
    (sr.form_data ? 'e2e_correlation_id') AS has_correlation_field,
    (COALESCE(sr.form_data->>'e2e_marker', '') = 'TEST_ONLY_B1_E2E_88') AS has_e2e_marker
  FROM public.student_requests sr
  WHERE sr.request_number LIKE 'SR-20260801-13%'
),
fixture_joined AS (
  SELECT
    e.*,
    l.status AS live_status,
    l.request_type AS live_request_type,
    l.active_steps,
    l.active_step_id,
    l.active_workflow_step_id,
    l.active_step_key,
    l.active_step_order,
    l.active_step_status,
    l.active_unit_id,
    l.active_role_id,
    l.active_direct_assignee,
    l.has_e2e_marker,
    l.has_correlation_field,
    l.completed_at AS live_completed_at,
    u.code AS live_unit_code,
    r.code AS live_role_code,
    ws.action_type AS live_configured_action,
    ws.step_key AS workflow_step_key,
    ws.step_order AS workflow_step_order,
    (
      e.request_id IS NOT NULL
      AND l.id IS NOT NULL
      AND l.request_number = e.request_number
      AND l.request_type = e.service_code
      AND l.status = e.request_status
      AND l.active_steps = 1
      AND l.active_step_id = e.runtime_step_id
      AND l.active_step_key = e.step_code
      AND l.active_step_order = e.step_index
      AND l.active_step_status = 'active'
      AND ws.action_type IS NOT DISTINCT FROM e.configured_action
      AND u.code IS NOT DISTINCT FROM e.processing_unit_code
      AND r.code IS NOT DISTINCT FROM e.processing_role_code
      AND l.active_direct_assignee IS NOT DISTINCT FROM e.direct_assignee_principal_id
      AND l.active_workflow_step_id IS NOT NULL
      AND NOT l.has_e2e_marker
      AND NOT l.has_correlation_field
      AND (
        e.department_scope_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.transfer_request_details td
          WHERE td.request_id = e.request_id
            AND (
              (e.department_side = 'source' AND td.current_department_id = e.department_scope_id)
              OR (e.department_side = 'target' AND td.requested_department_id = e.department_scope_id)
              OR (e.department_side IS NULL)
            )
        )
      )
    ) AS pin_ok
  FROM fixture_expect e
  LEFT JOIN fixture_live l ON l.id = e.request_id
  LEFT JOIN public.request_processing_units u ON u.id = l.active_unit_id
  LEFT JOIN public.request_processing_roles r ON r.id = l.active_role_id
  LEFT JOIN public.request_type_workflow_steps ws ON ws.id = l.active_workflow_step_id
),
fixture_eval AS (
  SELECT
    (SELECT count(*) FROM fixture_live) AS fixture_count,
    (SELECT count(*) FROM fixture_expect) AS expect_count,
    (SELECT count(*) FROM fixture_joined WHERE pin_ok) AS pin_ok_count,
    (SELECT count(*) FROM fixture_live WHERE active_steps = 1) AS exactly_one_active,
    (SELECT count(*) FROM fixture_live WHERE has_e2e_marker) AS e2e_marker_hits,
    (SELECT count(*) FROM fixture_live WHERE has_correlation_field) AS correlation_field_hits,
    (SELECT count(*) FROM fixture_joined j
      WHERE j.live_unit_code IS DISTINCT FROM j.processing_unit_code
         OR j.live_role_code IS DISTINCT FROM j.processing_role_code
         OR j.active_step_key IS DISTINCT FROM j.step_code
         OR j.live_request_type IS DISTINCT FROM j.service_code
    ) AS routing_drift_count,
    EXISTS (
      SELECT 1 FROM fixture_joined j
      WHERE j.case_index = 15
        AND j.pin_ok
        AND j.live_completed_at IS NULL
    ) AS fixture_15_restored_ok,
    (
      SELECT count(*) FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = 'f1300000-0000-4000-8000-000000000015'::uuid
        AND s.status = 'completed'
    ) AS fixture_15_completed_steps,
    (SELECT bindings_table_present FROM object_prestate) AS bindings_table_present
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
    md5(coalesce(string_agg(row_text, '|' ORDER BY row_text), '<EMPTY>')) AS fingerprint,
    count(*)::bigint AS active_row_count
  FROM (
    SELECT
      id::text || ':' ||
      unit_id::text || ':' ||
      role_id::text || ':' ||
      assignment_type || ':' ||
      coalesce(user_id::text, '<NULL>') || ':' ||
      coalesce(staff_profile_id::text, '<NULL>') || ':' ||
      coalesce(faculty_profile_id::text, '<NULL>') || ':' ||
      coalesce(position_assignment_id::text, '<NULL>') || ':' ||
      coalesce(department_id::text, '<NULL>') || ':' ||
      is_active::text || ':' ||
      coalesce(extract(epoch FROM starts_at AT TIME ZONE 'UTC')::text, '<NULL>') || ':' ||
      coalesce(extract(epoch FROM ends_at AT TIME ZONE 'UTC')::text, '<NULL>') AS row_text
    FROM rpa_scope
  ) q
),
rpa_dup AS (
  SELECT count(*)::bigint AS duplicate_active_groups
  FROM (
    SELECT unit_id, role_id, assignment_type,
           coalesce(user_id::text, '<NULL>'),
           coalesce(staff_profile_id::text, '<NULL>'),
           coalesce(faculty_profile_id::text, '<NULL>'),
           coalesce(position_assignment_id::text, '<NULL>'),
           coalesce(department_id::text, '<NULL>'),
           count(*) AS c
    FROM rpa_scope
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    HAVING count(*) > 1
  ) d
),
protected_fp AS (
  SELECT
    md5(coalesce(string_agg(x, '|' ORDER BY x), '<EMPTY>')) AS request_types_fp,
    count(*)::bigint AS request_types_count
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
  SELECT
    md5(coalesce(string_agg(x, '|' ORDER BY x), '<EMPTY>')) AS fixtures_fp,
    count(*)::bigint AS fixtures_fp_count
  FROM (
    SELECT id::text || ':' || request_number || ':' || request_type || ':' ||
           status || ':' || coalesce(extract(epoch FROM completed_at AT TIME ZONE 'UTC')::text, '<NULL>') || ':' ||
           active_steps::text || ':' || coalesce(active_step_id::text, '<NULL>') AS x
    FROM fixture_live
  ) q
),
runtime_fp AS (
  SELECT
    md5(coalesce(string_agg(x, '|' ORDER BY x), '<EMPTY>')) AS runtime_fp,
    count(*)::bigint AS runtime_fp_count
  FROM (
    SELECT s.id::text || ':' || s.student_request_id::text || ':' ||
           s.status || ':' || s.step_order::text || ':' ||
           coalesce(s.workflow_step_id::text, '<NULL>') AS x
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
  SELECT
    md5(coalesce(string_agg(x, '|' ORDER BY x), '<EMPTY>')) AS workflow_fp,
    count(*)::bigint AS workflow_fp_count
  FROM (
    SELECT w.id::text || ':' || rt.code || ':' ||
           ws.id::text || ':' || ws.step_key || ':' ||
           coalesce(ws.action_type, '<NULL>') || ':' ||
           coalesce(ws.processing_unit_id::text, '<NULL>') || ':' ||
           coalesce(ws.processing_role_id::text, '<NULL>') AS x
    FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
    JOIN public.request_type_workflow_steps ws ON ws.workflow_id = w.id
    JOIN five_services f ON f.code = rt.code
  ) q
),
-- Public-side TEST_ONLY inventory only. Never SELECT auth.* / storage.* / etc.
-- Auth-user existence remains UNPROVEN from SQL; password/session UNKNOWN.
testonly_public_user_ids AS (
  SELECT sp.user_id AS user_id
  FROM public.student_profiles sp
  WHERE sp.user_id IS NOT NULL
    AND (
      sp.email ILIKE '%@testonly.quboolye.com'
      OR sp.email = 'test-only.b1.e2e03@usr.edu.ye'
      OR sp.academic_number LIKE 'TEST_ONLY%'
      OR coalesce(sp.full_name_en, '') ILIKE '%TEST_ONLY%'
      OR coalesce(sp.full_name_ar, '') ILIKE '%TEST_ONLY%'
    )
  UNION
  SELECT st.user_id
  FROM public.staff_profiles st
  WHERE st.user_id IS NOT NULL
    AND (
      st.email ILIKE '%@testonly.quboolye.com'
      OR st.email = 'unrelated.admin.test.01d@quboolye.test'
      OR coalesce(st.full_name_en, '') ILIKE '%TEST_ONLY%'
      OR coalesce(st.full_name_ar, '') ILIKE '%TEST_ONLY%'
      OR coalesce(st.employee_number, '') LIKE 'TEST_ONLY%'
    )
  UNION
  SELECT fp.user_id
  FROM public.faculty_profiles fp
  WHERE fp.user_id IS NOT NULL
    AND (
      coalesce(fp.full_name_en, '') ILIKE '%TEST_ONLY%'
      OR coalesce(fp.full_name_ar, '') ILIKE '%TEST_ONLY%'
      OR coalesce(fp.employee_number, '') LIKE 'TEST_ONLY%'
      OR coalesce(fp.faculty_id, '') LIKE 'TEST_ONLY%'
    )
),
identity_inventory AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = 'auth'
    ) AS auth_schema_catalog_present,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = 'auth'
      ) THEN 'ABSENT'
      WHEN coalesce(has_schema_privilege('auth', 'USAGE'), false) = false
        THEN 'USAGE_DENIED'
      ELSE 'PRESENT_NOT_QUERIED'
    END AS auth_schema_access,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = 'storage'
    ) AS storage_schema_catalog_present,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = 'storage'
      ) THEN 'ABSENT'
      WHEN coalesce(has_schema_privilege('storage', 'USAGE'), false) = false
        THEN 'USAGE_DENIED'
      ELSE 'PRESENT_NOT_QUERIED'
    END AS storage_schema_access,
    (SELECT count(*) FROM public.student_profiles sp
      WHERE sp.email ILIKE '%@testonly.quboolye.com'
         OR sp.email = 'test-only.b1.e2e03@usr.edu.ye'
         OR sp.academic_number LIKE 'TEST_ONLY%'
         OR coalesce(sp.full_name_en, '') ILIKE '%TEST_ONLY%'
         OR coalesce(sp.full_name_ar, '') ILIKE '%TEST_ONLY%')
      AS public_student_profile_candidates,
    (SELECT count(*) FROM public.staff_profiles st
      WHERE st.email ILIKE '%@testonly.quboolye.com'
         OR st.email = 'unrelated.admin.test.01d@quboolye.test'
         OR coalesce(st.full_name_en, '') ILIKE '%TEST_ONLY%'
         OR coalesce(st.full_name_ar, '') ILIKE '%TEST_ONLY%'
         OR coalesce(st.employee_number, '') LIKE 'TEST_ONLY%')
      AS public_staff_profile_candidates,
    (SELECT count(*) FROM public.faculty_profiles fp
      WHERE coalesce(fp.full_name_en, '') ILIKE '%TEST_ONLY%'
         OR coalesce(fp.full_name_ar, '') ILIKE '%TEST_ONLY%'
         OR coalesce(fp.employee_number, '') LIKE 'TEST_ONLY%'
         OR coalesce(fp.faculty_id, '') LIKE 'TEST_ONLY%')
      AS public_faculty_profile_candidates,
    (
      SELECT count(DISTINCT x.user_id)
      FROM (
        SELECT sp.user_id FROM public.student_profiles sp
        WHERE sp.user_id IS NOT NULL
          AND (
            sp.email ILIKE '%@testonly.quboolye.com'
            OR sp.email = 'test-only.b1.e2e03@usr.edu.ye'
            OR sp.academic_number LIKE 'TEST_ONLY%'
          )
        UNION
        SELECT st.user_id FROM public.staff_profiles st
        WHERE st.user_id IS NOT NULL
          AND (
            st.email ILIKE '%@testonly.quboolye.com'
            OR coalesce(st.full_name_en, '') ILIKE '%TEST_ONLY%'
            OR coalesce(st.full_name_ar, '') ILIKE '%TEST_ONLY%'
          )
        UNION
        SELECT fp.user_id FROM public.faculty_profiles fp
        WHERE fp.user_id IS NOT NULL
          AND (
            coalesce(fp.full_name_en, '') ILIKE '%TEST_ONLY%'
            OR coalesce(fp.full_name_ar, '') ILIKE '%TEST_ONLY%'
            OR coalesce(fp.employee_number, '') LIKE 'TEST_ONLY%'
          )
      ) x
    ) AS public_profile_user_id_candidates,
    (SELECT count(*) FROM public.user_roles ur
      WHERE ur.user_id IN (SELECT user_id FROM testonly_public_user_ids))
      AS public_role_records,
    (SELECT count(*) FROM public.request_processing_assignments a
      WHERE a.is_active IS TRUE
        AND (
          a.user_id IN (SELECT user_id FROM testonly_public_user_ids)
          OR a.staff_profile_id IN (
            SELECT st.id FROM public.staff_profiles st
            WHERE st.email ILIKE '%@testonly.quboolye.com'
               OR coalesce(st.full_name_en, '') ILIKE '%TEST_ONLY%'
               OR coalesce(st.full_name_ar, '') ILIKE '%TEST_ONLY%'
               OR coalesce(st.employee_number, '') LIKE 'TEST_ONLY%'
          )
          OR a.faculty_profile_id IN (
            SELECT fp.id FROM public.faculty_profiles fp
            WHERE coalesce(fp.full_name_en, '') ILIKE '%TEST_ONLY%'
               OR coalesce(fp.full_name_ar, '') ILIKE '%TEST_ONLY%'
               OR coalesce(fp.employee_number, '') LIKE 'TEST_ONLY%'
               OR coalesce(fp.faculty_id, '') LIKE 'TEST_ONLY%'
          )
        )) AS public_assignment_records,
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.email IN (
        'student@testonly.quboolye.com',
        'test-only.b1.student@testonly.quboolye.com',
        'e2e02@testonly.quboolye.com',
        'test-only.b1.e2e02@testonly.quboolye.com',
        'test-only.b1.e2e03@usr.edu.ye'
      )
      OR sp.academic_number IN (
        'TEST_ONLY_B1_0001',
        'TEST_ONLY_B1_0002',
        'TEST_ONLY_B1_0003'
      )
    ) AS owner_student_public_candidate,
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE (
        sp.email ILIKE '%@testonly.quboolye.com'
        OR sp.academic_number LIKE 'TEST_ONLY%'
      )
      AND coalesce(sp.email, '') NOT IN (
        'student@testonly.quboolye.com',
        'test-only.b1.student@testonly.quboolye.com',
        'e2e02@testonly.quboolye.com',
        'test-only.b1.e2e02@testonly.quboolye.com'
      )
      AND coalesce(sp.academic_number, '') NOT IN ('TEST_ONLY_B1_0001')
    ) AS other_student_public_candidate,
    EXISTS (
      SELECT 1
      FROM public.faculty_profiles fp
      WHERE (
        coalesce(fp.full_name_en, '') ILIKE '%TEST_ONLY%'
        OR coalesce(fp.full_name_ar, '') ILIKE '%TEST_ONLY%'
        OR coalesce(fp.employee_number, '') LIKE 'TEST_ONLY%'
        OR coalesce(fp.faculty_id, '') LIKE 'TEST_ONLY%'
      )
      AND fp.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_profiles st WHERE st.user_id = fp.user_id
      )
    ) AS faculty_only_negative_public_candidate,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id IN (SELECT user_id FROM testonly_public_user_ids)
        AND ur.role::text IN ('admin', 'system_admin')
    ) AS admin_role_negative_public_candidate,
    (
      EXISTS (
        SELECT 1 FROM public.staff_profiles st
        WHERE st.email = 'unrelated.admin.test.01d@quboolye.test'
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.role::text IN ('admin', 'system_admin')
          AND ur.user_id IN (SELECT user_id FROM testonly_public_user_ids)
      )
    ) AS unrelated_admin_public_candidate,
    CASE
      WHEN (
        SELECT count(*) FROM public.student_profiles sp
        WHERE sp.email ILIKE '%@testonly.quboolye.com'
           OR sp.email = 'test-only.b1.e2e03@usr.edu.ye'
           OR sp.academic_number LIKE 'TEST_ONLY%'
      ) = 0
      AND (
        SELECT count(*) FROM public.staff_profiles st
        WHERE st.email ILIKE '%@testonly.quboolye.com'
           OR coalesce(st.full_name_en, '') ILIKE '%TEST_ONLY%'
           OR coalesce(st.full_name_ar, '') ILIKE '%TEST_ONLY%'
      ) = 0
        THEN 'MISSING'
      WHEN (
        SELECT count(*) FROM public.student_profiles sp
        WHERE sp.email IN (
          'student@testonly.quboolye.com',
          'test-only.b1.student@testonly.quboolye.com',
          'e2e02@testonly.quboolye.com',
          'test-only.b1.e2e02@testonly.quboolye.com',
          'test-only.b1.e2e03@usr.edu.ye'
        )
        OR sp.academic_number IN (
          'TEST_ONLY_B1_0001',
          'TEST_ONLY_B1_0002',
          'TEST_ONLY_B1_0003'
        )
      ) >= 1
      AND (
        SELECT count(*) FROM public.staff_profiles st
        WHERE st.email ILIKE '%@testonly.quboolye.com'
           OR coalesce(st.full_name_en, '') ILIKE '%TEST_ONLY%'
           OR coalesce(st.full_name_ar, '') ILIKE '%TEST_ONLY%'
      ) >= 1
        THEN 'COMPLETE_PUBLIC_SIDE'
      ELSE 'PARTIAL_OR_AMBIGUOUS'
    END AS public_identity_completeness,
    'UNPROVEN'::text AS auth_user_existence,
    'UNKNOWN'::text AS password_usability,
    'UNKNOWN'::text AS session_usability,
    'HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE'::text AS auth_unreadability_code
),
dept_identities AS (
  SELECT
    EXISTS (SELECT 1 FROM public.departments WHERE id = 'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid) AS source_dept_ok,
    EXISTS (SELECT 1 FROM public.departments WHERE id = '11111111-1111-4111-8111-111111111111'::uuid) AS target_dept_ok
),
gate_rows AS (
  -- G01 project identity — never PASS from user-supplied values
  SELECT
    'G01'::text AS gate,
    'project_ref_attestation'::text AS check_name,
    'HOLD'::text AS status,
    'PROJECT_IDENTITY_UNPROVEN'::text AS detail,
    jsonb_build_object(
      'expected_project_ref', p.expected_project_ref,
      'identity_classification', 'UNPROVEN',
      'sql_can_pass', false,
      'user_supplied_guc_accepted', false,
      'trusted_external_channel_required', true,
      'trusted_channel_ref', 'wpmicqriltrowwonknox',
      'txn_read_only', sm.txn_read_only,
      'db_name', sm.db_name,
      'db_user', sm.db_user,
      'server_version', sm.server_version,
      'note', 'G01 remains UNPROVEN in SQL. Final operational classification requires trusted Lovable channel identity plus G02-G14.'
    ) AS evidence
  FROM params p CROSS JOIN session_meta sm

  UNION ALL

  -- G02 migration ledger (SQL never reads managed ledger; object-state via pg_catalog)
  SELECT
    'G02', 'migration_ledger_not_applied',
    CASE
      WHEN osi.object_state_code = 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED' THEN 'HOLD'
      WHEN osi.object_state_code = 'HOLD' THEN 'HOLD'
      ELSE 'UNPROVEN'
    END,
    CASE
      WHEN osi.object_state_code = 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      WHEN osi.object_state_code = 'HOLD'
        THEN 'HOLD_B1_E2E_88_OBJECT_STATE_AMBIGUOUS'
      ELSE 'HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE'
    END,
    jsonb_build_object(
      'ledger_readability', ml.ledger_readability,
      'ledger_readable', ml.ledger_readable,
      'ledger_attestation_source', ml.ledger_attestation_source,
      'sql_ledger_status', 'UNPROVEN',
      'code', 'HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE',
      'object_state_code', osi.object_state_code,
      'object_state_inference', osi.object_state_code,
      'objects_absent', osi.objects_absent,
      'objects_partial', osi.objects_partial,
      'objects_complete', osi.objects_complete,
      'present_object_hits', osi.present_object_hits,
      'expected_object_total', osi.expected_object_total,
      'source_version_identity', p.expected_migration_version,
      'expected_managed_alias_identity', p.expected_migration_token,
      'expected_version', p.expected_migration_version,
      'expected_token', p.expected_migration_token,
      'ledger_hits', ml.ledger_hits,
      'migration_count', ml.migration_count,
      'migration_head', ml.migration_head,
      'migration_raw_sha256', p.migration_raw_sha256,
      'migration_lf_sha256', p.migration_lf_sha256,
      'definitive_not_applied_from_unreadable_ledger', false,
      'external_lovable_ledger_attestation_required', true,
      'note', 'SQL does not query the managed migration ledger. Do not classify Migration 88 definitively NOT_APPLIED solely because the ledger is unreadable. Final G02 combines this SQL object-state result with trusted Lovable-managed migration-history metadata outside SQL.'
    )
  FROM params p
  CROSS JOIN migration_ledger ml
  CROSS JOIN object_state_inference osi

  UNION ALL

  -- G03 object pre-state (full inventory; any non-zero subset → PARTIAL APPLY)
  SELECT
    'G03', 'migration_88_objects_absent',
    CASE
      WHEN (SELECT all_objects_absent FROM object_inventory_counts) THEN 'PASS'
      ELSE 'HOLD'
    END,
    CASE
      WHEN (SELECT all_objects_absent FROM object_inventory_counts) THEN 'OBJECTS_ABSENT'
      WHEN (SELECT full_object_set_present FROM object_inventory_counts)
           AND (SELECT e2e_policy_count FROM object_prestate) = 0
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      ELSE 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
    END,
    jsonb_build_object(
      'tables_present', (SELECT tables_present FROM object_prestate),
      'tables_missing', (SELECT tables_missing FROM object_prestate),
      'functions_present', (SELECT functions_present FROM object_prestate),
      'functions_missing', (SELECT functions_missing FROM object_prestate),
      'triggers_present', (SELECT triggers_present FROM object_prestate),
      'triggers_missing', (SELECT triggers_missing FROM object_prestate),
      'rls_enabled_count', (SELECT rls_enabled_count FROM object_prestate),
      'e2e_policy_count', (SELECT e2e_policy_count FROM object_prestate),
      'present_object_hits', (SELECT present_object_hits FROM object_inventory_counts),
      'expected_tables', 3,
      'expected_m88_only_functions', 18,
      'expected_triggers', 2,
      'tables', (SELECT coalesce(jsonb_agg(to_jsonb(m88_tables) ORDER BY table_name), '[]'::jsonb) FROM m88_tables),
      'functions', (SELECT coalesce(jsonb_agg(to_jsonb(m88_fns) ORDER BY identity), '[]'::jsonb) FROM m88_fns),
      'triggers', (SELECT coalesce(jsonb_agg(to_jsonb(m88_triggers) ORDER BY trigger_name), '[]'::jsonb) FROM m88_triggers),
      'missing_functions', (SELECT coalesce(jsonb_agg(identity ORDER BY identity), '[]'::jsonb) FROM m88_fns_missing),
      'missing_triggers', (SELECT coalesce(jsonb_agg(trigger_name ORDER BY trigger_name), '[]'::jsonb) FROM m88_triggers_missing)
    )

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
      WHEN EXISTS (SELECT 1 FROM fn_eval WHERE match_count <> 1 OR observed_fp IS NULL
                    OR observed_fp IS DISTINCT FROM expected_base_fp
                    OR body_mentions_e2e_88 OR observed_fp = forbidden_m88_fp)
        THEN 'HOLD_B1_E2E_88_FUNCTION_PREIMAGE_DRIFT'
      ELSE 'FUNCTION_PREIMAGES_MATCH_BASE'
    END,
    jsonb_build_object(
      'functions', (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'identity', identity,
              'expected_base_fp', expected_base_fp,
              'forbidden_m88_fp', forbidden_m88_fp,
              'observed_fp', coalesce(observed_fp, '<NULL>'),
              'owner', coalesce(owner, '<NULL>'),
              'security_definer', security_definer,
              'volatility', coalesce(volatility, '<NULL>'),
              'acl', coalesce(acl, '<NULL>'),
              'body_mentions_e2e_88', coalesce(body_mentions_e2e_88, false),
              'match_count', match_count
            )
            ORDER BY identity
          ),
          '[]'::jsonb
        )
        FROM fn_eval
      )
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

  -- G07 authoritative fixtures (full 19-fixture matrix)
  SELECT
    'G07', 'authoritative_fixture_matrix_19',
    CASE
      WHEN fe.fixture_count = 19
           AND fe.expect_count = 19
           AND fe.pin_ok_count = 19
           AND fe.exactly_one_active = 19
           AND fe.e2e_marker_hits = 0
           AND fe.correlation_field_hits = 0
           AND NOT fe.bindings_table_present
           AND fe.routing_drift_count = 0
           AND fe.fixture_15_restored_ok
           AND fe.fixture_15_completed_steps = 6
        THEN 'PASS' ELSE 'HOLD'
    END,
    CASE
      WHEN fe.fixture_count <> 19 THEN 'FIXTURE_COUNT_DRIFT'
      WHEN fe.pin_ok_count <> 19 THEN 'FIXTURE_IDENTITY_DRIFT'
      WHEN fe.exactly_one_active <> 19 THEN 'FIXTURE_ACTIVE_STEP_DRIFT'
      WHEN fe.routing_drift_count > 0 THEN 'FIXTURE_SERVICE_OR_STEP_ROUTING_DRIFT'
      WHEN fe.e2e_marker_hits > 0 OR fe.correlation_field_hits > 0 OR fe.bindings_table_present
        THEN 'FIXTURE_E2E_88_CONTAMINATION'
      WHEN NOT fe.fixture_15_restored_ok OR fe.fixture_15_completed_steps <> 6
        THEN 'FIXTURE_15_RESTORED_APPROVED_STATE_DRIFT'
      ELSE 'FIXTURES_19_OF_19_OK'
    END,
    jsonb_build_object(
      'fixture_count', fe.fixture_count,
      'expect_count', fe.expect_count,
      'pin_ok_count', fe.pin_ok_count,
      'exactly_one_active', fe.exactly_one_active,
      'e2e_marker_hits', fe.e2e_marker_hits,
      'correlation_field_hits', fe.correlation_field_hits,
      'bindings_table_present', fe.bindings_table_present,
      'routing_drift_count', fe.routing_drift_count,
      'fixture_15_restored_ok', fe.fixture_15_restored_ok,
      'fixture_15_completed_steps', fe.fixture_15_completed_steps,
      'failed_pins', (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'case_index', case_index,
              'request_number', request_number,
              'service_code', service_code,
              'step_code', step_code,
              'live_status', coalesce(live_status, '<NULL>'),
              'active_step_key', coalesce(active_step_key, '<NULL>'),
              'live_unit_code', coalesce(live_unit_code, '<NULL>'),
              'live_role_code', coalesce(live_role_code, '<NULL>')
            )
            ORDER BY case_index
          ),
          '[]'::jsonb
        )
        FROM fixture_joined
        WHERE NOT pin_ok
      )
    )
  FROM fixture_eval fe

  UNION ALL

  -- G08 RPA fingerprint
  SELECT
    'G08', 'request_processing_assignments_fingerprint',
    CASE
      WHEN rd.duplicate_active_groups = 0 AND rf.active_row_count > 0 THEN 'PASS'
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
      'includes_position_assignment_id', true,
      'timestamp_form', 'epoch_utc',
      'null_marker', '<NULL>',
      'preflight_mutates_rpa', false
    )
  FROM rpa_fp rf CROSS JOIN rpa_dup rd

  UNION ALL

  -- G09 protected-surface fingerprints
  SELECT
    'G09', 'protected_surface_fingerprints',
    CASE
      WHEN pf.request_types_count = 0
        OR ff.fixtures_fp_count = 0
        OR rt.runtime_fp_count = 0
        OR wf.workflow_fp_count = 0
        OR rf.active_row_count = 0
        OR ep.protected_request_count = 0
        OR ep.protected_document_count = 0
        THEN 'HOLD'
      ELSE 'PASS'
    END,
    CASE
      WHEN pf.request_types_count = 0
        OR ff.fixtures_fp_count = 0
        OR rt.runtime_fp_count = 0
        OR wf.workflow_fp_count = 0
        OR rf.active_row_count = 0
        OR ep.protected_request_count = 0
        OR ep.protected_document_count = 0
        THEN 'PROTECTED_SURFACE_EMPTY_OR_MISSING'
      ELSE 'FINGERPRINTS_CAPTURED'
    END,
    jsonb_build_object(
      'request_types_fp', pf.request_types_fp,
      'fixtures_fp', ff.fixtures_fp,
      'runtime_fp', rt.runtime_fp,
      'rpa_fingerprint', rf.fingerprint,
      'workflow_fp', wf.workflow_fp,
      'protected_requests', ep.protected_request_count,
      'protected_documents', ep.protected_document_count,
      'null_marker', '<NULL>',
      'empty_marker', '<EMPTY>',
      'timestamp_form', 'epoch_utc'
    )
  FROM protected_fp pf
  CROSS JOIN fixture_fp ff
  CROSS JOIN runtime_fp rt
  CROSS JOIN rpa_fp rf
  CROSS JOIN workflow_fp wf
  CROSS JOIN enroll_protected ep

  UNION ALL

  -- G10 TEST_ONLY identity inventory (public-side only; Auth unreadable)
  SELECT
    'G10', 'test_only_identity_inventory',
    'UNPROVEN',
    'HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE',
    jsonb_build_object(
      'auth_schema_catalog_present', ii.auth_schema_catalog_present,
      'auth_schema_access', ii.auth_schema_access,
      'storage_schema_catalog_present', ii.storage_schema_catalog_present,
      'storage_schema_access', ii.storage_schema_access,
      'public_student_profile_candidates', ii.public_student_profile_candidates,
      'public_staff_profile_candidates', ii.public_staff_profile_candidates,
      'public_faculty_profile_candidates', ii.public_faculty_profile_candidates,
      'public_profile_user_id_candidates', ii.public_profile_user_id_candidates,
      'public_role_records', ii.public_role_records,
      'public_assignment_records', ii.public_assignment_records,
      'public_identity_completeness', ii.public_identity_completeness,
      'owner_student_public_candidate', ii.owner_student_public_candidate,
      'other_student_public_candidate', ii.other_student_public_candidate,
      'faculty_only_negative_public_candidate', ii.faculty_only_negative_public_candidate,
      'admin_role_negative_public_candidate', ii.admin_role_negative_public_candidate,
      'unrelated_admin_public_candidate', ii.unrelated_admin_public_candidate,
      'auth_user_existence', ii.auth_user_existence,
      'password_usability', ii.password_usability,
      'session_usability', ii.session_usability,
      'code', ii.auth_unreadability_code,
      'external_lovable_auth_attestation_required', true,
      'note', 'Public-side inventory only. SQL never reads auth.users. Auth-user existence UNPROVEN; password/session UNKNOWN. Final Auth readiness requires trusted Lovable Auth attestation outside SQL.'
    )
  FROM identity_inventory ii

  UNION ALL

  -- G11 production E2E prerequisites (fail-closed while Auth unresolved)
  SELECT
    'G11', 'production_e2e_prerequisites',
    'HOLD',
    'PREREQUISITES_NOT_READY_OR_UNPROVEN',
    jsonb_build_object(
      'owner_student',
        CASE WHEN ii.owner_student_public_candidate THEN 'PUBLIC_CANDIDATE' ELSE 'NOT_READY' END,
      'other_student_negatives',
        CASE WHEN ii.other_student_public_candidate THEN 'PUBLIC_CANDIDATE_AMBIGUOUS' ELSE 'NOT_READY' END,
      'workflow_actors',
        CASE
          WHEN ii.public_assignment_records >= 1 AND ii.public_staff_profile_candidates >= 1
            THEN 'PUBLIC_CANDIDATE_AUTH_UNPROVEN'
          ELSE 'NOT_READY'
        END,
      'faculty_only_negative',
        CASE WHEN ii.faculty_only_negative_public_candidate THEN 'PUBLIC_CANDIDATE' ELSE 'NOT_READY' END,
      'admin_role_negative',
        CASE WHEN ii.admin_role_negative_public_candidate THEN 'PUBLIC_CANDIDATE' ELSE 'NOT_READY' END,
      'auth_user_existence', ii.auth_user_existence,
      'password_session_ability', 'UNPROVEN',
      'password_usability', ii.password_usability,
      'session_usability', ii.session_usability,
      'department_source_target',
        CASE WHEN d.source_dept_ok AND d.target_dept_ok THEN 'READY' ELSE 'NOT_READY' END,
      'attachment_prerequisites', 'UNPROVEN',
      'service_business_data_prerequisites', 'UNPROVEN',
      'auth_schema_access', ii.auth_schema_access,
      'code', 'HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE',
      'external_lovable_auth_attestation_required', true,
      'classification_rule',
        'Identity readiness cannot become PASS while auth_user_existence=UNPROVEN or password_usability=UNKNOWN or session_usability=UNKNOWN'
    )
  FROM identity_inventory ii CROSS JOIN dept_identities d

  UNION ALL

  -- G12 apply feasibility (does not require successful ledger SELECT; attest externally)
  SELECT
    'G12', 'apply_feasibility',
    CASE
      WHEN NOT (SELECT all_objects_absent FROM object_inventory_counts) THEN 'HOLD'
      ELSE 'PASS'
    END,
    CASE
      WHEN NOT (SELECT all_objects_absent FROM object_inventory_counts)
        THEN 'HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED'
      ELSE 'APPLY_FEASIBILITY_SOURCE_READY_NOT_AUTHORIZED'
    END,
    jsonb_build_object(
      'expected_source_version', p.expected_migration_version,
      'expected_managed_alias_identity', p.expected_migration_token,
      'ledger_readability', ml.ledger_readability,
      'ledger_readable', ml.ledger_readable,
      'sql_ledger_status', 'UNPROVEN',
      'object_state_code', osi.object_state_code,
      'external_lovable_ledger_attestation_required', true,
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
  CROSS JOIN migration_ledger ml
  CROSS JOIN object_state_inference osi

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
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G01')
        THEN 'HOLD_B1_E2E_88_PROJECT_IDENTITY_UNPROVEN'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G02' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_MIGRATION_LEDGER'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G02' AND status = 'UNPROVEN')
        THEN 'HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G05' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_SERVICE_VISIBILITY_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G06' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_ENROLLMENT_CERTIFICATE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G07' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_FIXTURE_DRIFT'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G08' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_RPA_AMBIGUITY'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G10' AND status = 'UNPROVEN')
        THEN 'HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE gate = 'G11' AND status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_E2E_PREREQUISITES_UNPROVEN'
      WHEN EXISTS (SELECT 1 FROM gates_core WHERE status = 'HOLD')
        THEN 'HOLD_B1_E2E_88_PREFLIGHT_STOP'
      ELSE 'HOLD_B1_E2E_88_PREFLIGHT_STOP'
    END AS detail,
    jsonb_build_object(
      'gate_statuses', (SELECT jsonb_object_agg(gate, status ORDER BY gate) FROM gates_core),
      'hold_gates', (SELECT coalesce(jsonb_agg(gate ORDER BY gate), '[]'::jsonb)
                     FROM gates_core WHERE status = 'HOLD'),
      'production_execution_claim', false,
      'migration_88_apply_authorized', false,
      'package_mode', 'SOURCE_READONLY_PREFLIGHT_97',
      'project_identity_sql', 'UNPROVEN',
      'trusted_lovable_channel_ref_required', 'wpmicqriltrowwonknox',
      'stop_if', jsonb_build_array(
        'project identity unproven in SQL',
        'migration already applied',
        'partial objects exist',
        'function preimage drift',
        'service visibility drift',
        'Fixture count/state/routing drift',
        'enrollment_certificate drift',
        'RPA ambiguity or empty',
        'empty protected surfaces',
        'missing required identity',
        'auth schema unreadable / Auth-user existence UNPROVEN',
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
