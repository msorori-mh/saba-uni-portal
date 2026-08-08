-- PORTAL-B1-...-66 — PRODUCTION READ-ONLY PREFLIGHT
-- SELECT-only. No DDL, no DML, no workflow RPC. Safe to run against production.
-- Every query below proves a precondition of
-- docs/migration-drafts/B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66.sql

-- P1. Target function identity, owner, security, search_path, ACL (pre-image).
SELECT 'P1_target' AS check,
       p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS config,
       p.proacl::text AS acl,
       md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'act_on_b1_student_request_step_atomic';

-- P2. PRE-IMAGE CAPTURE (store the output; forward-only recovery source).
SELECT 'P2_preimage' AS check,
       pg_get_functiondef('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure) AS definition;

-- P3. PROOF (read-only) that production accepts a generic 'approve' instead of
--     the configured clear / apply_decision / archive for the correct assignee.
--     The alias branch is present in the executor source, and the mapper folds
--     clear / apply_decision / archive onto 'approve'. Expect alias_present=true
--     and one row per folded action.
SELECT 'P3_alias_branch' AS check,
       position('b1_map_ui_staff_action' in p.prosrc) > 0 AS alias_present,
       position('public.b1_map_ui_staff_action(v_config.action_type) = p_action' in p.prosrc) > 0
         AS approve_substitution_branch_present
FROM pg_proc p WHERE p.oid = 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure;

SELECT 'P3_folded_actions' AS check, a AS configured_action_type,
       public.b1_map_ui_staff_action(a) AS accepted_generic_action,
       public.b1_map_ui_staff_action(a) = 'approve' AS approve_accepted_instead
FROM unnest(ARRAY['review','approve','clear','apply_decision','archive']) a;

-- P4. Reader functions currently publish the aliased action (consistency reason
--     the same migration updates them).
SELECT 'P4_readers' AS check, p.proname,
       position('b1_map_ui_staff_action' in p.prosrc) > 0 AS publishes_alias,
       p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_b1_step_allowed_actions','get_b1_assigned_request_details_for_actor',
                    'get_b1_assigned_inbox_for_actor')
ORDER BY p.proname;

-- P5. No 'skip' action exists in the executor vocabulary (no alias exception).
SELECT 'P5_no_skip_action' AS check,
       position('''skip''' in p.prosrc) = 0 AS skip_action_absent
FROM pg_proc p WHERE p.oid = 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure;

-- P6. Protected surfaces: five B1 services hidden, enrollment_certificate intact.
SELECT 'P6_visibility' AS check, code, student_visible
FROM public.request_types
WHERE code IN ('enrollment_suspension','excused_absence','absence_excuse','department_transfer',
               'transfer','final_chance','extra_chance','file_withdrawal','enrollment_certificate')
ORDER BY code;

-- P7. Baselines for the zero-data-delta assertion (compare with post-verifier).
SELECT 'P7_counts' AS check,
       (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count,
       (SELECT count(*) FROM public.student_requests) AS student_requests,
       (SELECT count(*) FROM public.student_request_workflow_steps) AS runtime_steps,
       (SELECT count(*) FROM public.student_request_workflow_events) AS workflow_events,
       (SELECT count(*) FROM public.student_request_workflow_steps WHERE status = 'active') AS active_steps;

-- STOP CONDITIONS (abort the apply if any holds):
--   * P1 owner <> postgres, security_definer <> true, config <> {search_path=public}
--   * P1 acl missing authenticated=X or service_role=X
--   * P3 alias_present = false (already remediated or drifted — re-baseline first)
--   * P6 any of the five B1 services has student_visible <> false
--   * any concurrently active B1 runtime step mid-flight that an operator is acting on
