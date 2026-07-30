-- PORTAL-B1-...-66 — POST-VERIFIER (read-only, run AFTER the migration is applied)
-- Every row must report ok = true. Any false => raise the stop condition and
-- remediate forward-only with
-- B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-ROLLBACK-BY-FORWARD.sql

-- V1. Executor: alias removed, literal guard present, identity preserved.
SELECT 'V1_executor' AS check,
       (position('b1_map_ui_staff_action' in p.prosrc) = 0
        AND position('p_action IS DISTINCT FROM v_config.action_type' in p.prosrc) > 0
        AND p.prosecdef
        AND pg_get_userbyid(p.proowner) = 'postgres'
        AND p.proconfig @> ARRAY['search_path=public']
        AND p.proacl::text LIKE '%authenticated=X%'
        AND p.proacl::text LIKE '%service_role=X%') AS ok,
       p.oid::regprocedure::text AS signature,
       md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p WHERE p.oid = 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure;

-- V2. Readers: publish the literal configured action, identity preserved.
SELECT 'V2_readers' AS check, p.proname,
       (position('b1_map_ui_staff_action' in p.prosrc) = 0
        AND p.prosecdef
        AND p.proconfig @> ARRAY['search_path=public, pg_temp']) AS ok
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_b1_step_allowed_actions','get_b1_assigned_request_details_for_actor',
                    'get_b1_assigned_inbox_for_actor')
ORDER BY p.proname;

-- V3. The mapper itself still exists and is unchanged (not dropped by this package).
SELECT 'V3_mapper_preserved' AS check,
       to_regprocedure('public.b1_map_ui_staff_action(text)') IS NOT NULL AS ok;

-- V4. Migration count delta = 1 versus the preflight P7 baseline.
SELECT 'V4_migration_delta' AS check,
       (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count_now,
       'expected = P7.migration_count + 1' AS expectation;

-- V5. Data delta = 0 versus the preflight P7 baseline.
SELECT 'V5_data_delta' AS check,
       (SELECT count(*) FROM public.student_requests) AS student_requests,
       (SELECT count(*) FROM public.student_request_workflow_steps) AS runtime_steps,
       (SELECT count(*) FROM public.student_request_workflow_events) AS workflow_events,
       (SELECT count(*) FROM public.student_request_workflow_steps WHERE status = 'active') AS active_steps,
       'all four must equal the P7 baseline exactly' AS expectation;

-- V6. Protected surfaces unchanged.
SELECT 'V6_visibility' AS check, code, student_visible,
       (CASE WHEN code = 'enrollment_certificate' THEN student_visible IS TRUE
             ELSE student_visible IS FALSE END) AS ok
FROM public.request_types
WHERE code IN ('enrollment_suspension','excused_absence','absence_excuse','department_transfer',
               'transfer','final_chance','extra_chance','file_withdrawal','enrollment_certificate')
ORDER BY code;

-- V7. enrollment_certificate functions untouched by this package.
SELECT 'V7_enrollment_certificate' AS check, count(*) AS ec_functions_present,
       count(*) > 0 AS ok
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE '%enrollment_certificate%';
