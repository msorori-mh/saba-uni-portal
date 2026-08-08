-- PORTAL-B1-...-66 — POST-VERIFIER (read-only, EXECUTABLE, FAIL-CLOSED)
-- Run AFTER the migration is applied:
--
--   psql "$CONN" -v ON_ERROR_STOP=1 \
--     -v baseline_migration_count=<P7.migration_count> \
--     -v baseline_student_requests=<P7.student_requests> \
--     -v baseline_runtime_steps=<P7.runtime_steps> \
--     -v baseline_workflow_events=<P7.workflow_events> \
--     -v baseline_active_steps=<P7.active_steps> \
--     -f B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-POST-VERIFIER.sql
--
-- The script FIRST prints every check for operator review, THEN re-evaluates all
-- of them inside a read-only DO block that RAISES on the first violation, so psql
-- exits with a non-zero code. It performs NO automatic remediation: any failure is
-- remediated forward-only with
-- B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-ROLLBACK-BY-FORWARD.sql

\set ON_ERROR_STOP on

-- Session-local baseline (temp only; no persistent object is created).
CREATE TEMP TABLE b1_66_baseline ON COMMIT PRESERVE ROWS AS
SELECT :baseline_migration_count::bigint  AS migration_count,
       :baseline_student_requests::bigint AS student_requests,
       :baseline_runtime_steps::bigint    AS runtime_steps,
       :baseline_workflow_events::bigint  AS workflow_events,
       :baseline_active_steps::bigint     AS active_steps;

-- ===========================================================================
-- PART A — reviewable output
-- ===========================================================================

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

-- V1b. AUTHORIZATION BEFORE ACTION ORACLE: the direct-assignee authorization call
--      must appear BEFORE the literal-action guard in the stored body.
SELECT 'V1b_authorization_before_action' AS check,
       (position('B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' in p.prosrc) > 0
        AND position('B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' in p.prosrc)
            < position('p_action IS DISTINCT FROM v_config.action_type' in p.prosrc)) AS ok
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
       b.migration_count AS baseline,
       ((SELECT count(*) FROM supabase_migrations.schema_migrations) - b.migration_count = 1) AS ok
FROM b1_66_baseline b;

-- V5. Data delta = 0 versus the preflight P7 baseline.
SELECT 'V5_data_delta' AS check,
       (SELECT count(*) FROM public.student_requests) AS student_requests,
       (SELECT count(*) FROM public.student_request_workflow_steps) AS runtime_steps,
       (SELECT count(*) FROM public.student_request_workflow_events) AS workflow_events,
       (SELECT count(*) FROM public.student_request_workflow_steps WHERE status = 'active') AS active_steps,
       ((SELECT count(*) FROM public.student_requests) = b.student_requests
        AND (SELECT count(*) FROM public.student_request_workflow_steps) = b.runtime_steps
        AND (SELECT count(*) FROM public.student_request_workflow_events) = b.workflow_events
        AND (SELECT count(*) FROM public.student_request_workflow_steps WHERE status='active') = b.active_steps) AS ok
FROM b1_66_baseline b;

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

-- ===========================================================================
-- PART B — fail-closed gate (read-only; RAISES on the first violation)
-- ===========================================================================
DO $verify$
DECLARE
  v_src text; v_owner text; v_acl text; v_cfg text[]; v_secdef boolean; v_name text;
  b b1_66_baseline%ROWTYPE; v_now bigint;
BEGIN
  SELECT * INTO b FROM b1_66_baseline;

  -- signature / identity drift
  IF to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'V_FAIL_SIGNATURE_DRIFT';
  END IF;
  SELECT p.prosrc, pg_get_userbyid(p.proowner), p.proacl::text, p.proconfig, p.prosecdef
    INTO v_src, v_owner, v_acl, v_cfg, v_secdef
  FROM pg_proc p WHERE p.oid='public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure;

  IF v_owner <> 'postgres' THEN RAISE EXCEPTION 'V_FAIL_OWNER_DRIFT:%', v_owner; END IF;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V_FAIL_SECURITY_DEFINER_DRIFT'; END IF;
  IF NOT (v_cfg @> ARRAY['search_path=public']) THEN RAISE EXCEPTION 'V_FAIL_SEARCH_PATH_DRIFT:%', v_cfg; END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'V_FAIL_ACL_DRIFT:%', v_acl; END IF;
  IF position('b1_map_ui_staff_action' in v_src) > 0 THEN RAISE EXCEPTION 'V_FAIL_ALIAS_STILL_PRESENT'; END IF;
  IF position('p_action IS DISTINCT FROM v_config.action_type' in v_src) = 0 THEN
    RAISE EXCEPTION 'V_FAIL_LITERAL_GUARD_MISSING'; END IF;
  IF position('B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' in v_src) = 0
     OR position('B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' in v_src)
        > position('p_action IS DISTINCT FROM v_config.action_type' in v_src) THEN
    RAISE EXCEPTION 'V_FAIL_AUTHORIZATION_NOT_BEFORE_ACTION_GUARD';
  END IF;

  -- readers publish the literal action
  FOR v_name IN SELECT unnest(ARRAY[
      'public.get_b1_step_allowed_actions(uuid)',
      'public.get_b1_assigned_request_details_for_actor(uuid)',
      'public.get_b1_assigned_inbox_for_actor(integer,integer)'])
  LOOP
    IF to_regprocedure(v_name) IS NULL THEN RAISE EXCEPTION 'V_FAIL_READER_MISSING:%', v_name; END IF;
    SELECT p.prosrc, p.prosecdef, p.proconfig INTO v_src, v_secdef, v_cfg
    FROM pg_proc p WHERE p.oid = v_name::regprocedure;
    IF position('b1_map_ui_staff_action' in v_src) > 0 THEN
      RAISE EXCEPTION 'V_FAIL_READER_NOT_PUBLISHING_LITERAL_ACTION:%', v_name; END IF;
    IF NOT v_secdef THEN RAISE EXCEPTION 'V_FAIL_READER_SECURITY_DEFINER_DRIFT:%', v_name; END IF;
    IF NOT (v_cfg @> ARRAY['search_path=public, pg_temp']) THEN
      RAISE EXCEPTION 'V_FAIL_READER_SEARCH_PATH_DRIFT:%', v_name; END IF;
  END LOOP;

  -- migration delta = 1
  SELECT count(*) INTO v_now FROM supabase_migrations.schema_migrations;
  IF v_now - b.migration_count <> 1 THEN
    RAISE EXCEPTION 'V_FAIL_MIGRATION_DELTA_UNEXPECTED:%', v_now - b.migration_count; END IF;

  -- data delta = 0
  SELECT count(*) INTO v_now FROM public.student_requests;
  IF v_now <> b.student_requests THEN RAISE EXCEPTION 'V_FAIL_DATA_DELTA_STUDENT_REQUESTS:%', v_now - b.student_requests; END IF;
  SELECT count(*) INTO v_now FROM public.student_request_workflow_steps;
  IF v_now <> b.runtime_steps THEN RAISE EXCEPTION 'V_FAIL_DATA_DELTA_RUNTIME_STEPS:%', v_now - b.runtime_steps; END IF;
  SELECT count(*) INTO v_now FROM public.student_request_workflow_events;
  IF v_now <> b.workflow_events THEN RAISE EXCEPTION 'V_FAIL_DATA_DELTA_WORKFLOW_EVENTS:%', v_now - b.workflow_events; END IF;
  SELECT count(*) INTO v_now FROM public.student_request_workflow_steps WHERE status='active';
  IF v_now <> b.active_steps THEN RAISE EXCEPTION 'V_FAIL_DATA_DELTA_ACTIVE_STEPS:%', v_now - b.active_steps; END IF;

  -- student_visible drift
  IF EXISTS (SELECT 1 FROM public.request_types
    WHERE code IN ('enrollment_suspension','excused_absence','absence_excuse','department_transfer',
                   'transfer','final_chance','extra_chance','file_withdrawal')
      AND student_visible IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'V_FAIL_STUDENT_VISIBLE_DRIFT';
  END IF;

  -- enrollment_certificate impact
  IF NOT EXISTS (SELECT 1 FROM public.request_types
    WHERE code = 'enrollment_certificate' AND student_visible IS TRUE) THEN
    RAISE EXCEPTION 'V_FAIL_ENROLLMENT_CERTIFICATE_IMPACTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE '%enrollment_certificate%') THEN
    RAISE EXCEPTION 'V_FAIL_ENROLLMENT_CERTIFICATE_IMPACTED';
  END IF;

  RAISE NOTICE 'B1_66_POST_VERIFIER_PASS';
END
$verify$;
