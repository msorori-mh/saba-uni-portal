-- STUDENT-SERVICES-GLOBAL-SWITCH-01 — POST-APPLY VERIFICATION (READ-ONLY).
-- Run AFTER applying the draft. SELECT statements only. Every "must_be_true"
-- column has to be true and the final verdict has to read VERIFIED.
BEGIN TRANSACTION READ ONLY;

-- 1. The single row. Right after the first apply: enabled = true, no notice,
--    updated_by NULL. (Later it shows whatever an admin last set.)
SELECT id, enabled, message_ar, updated_at, updated_by,
       (SELECT count(*) FROM public.student_services_switch) = 1 AS must_be_true__exactly_one_row
FROM public.student_services_switch;

-- 2. Table is closed to the API roles; no policy; RLS on
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_services_switch'::regclass)
                                                              AS must_be_true__rls_enabled,
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename = 'student_services_switch')     AS must_be_true__no_policy,
  NOT has_table_privilege('anon', 'public.student_services_switch',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')                 AS must_be_true__anon_no_access,
  NOT has_table_privilege('authenticated', 'public.student_services_switch',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')                 AS must_be_true__authenticated_no_access,
  NOT has_table_privilege('service_role', 'public.student_services_switch',
      'INSERT,UPDATE,DELETE,TRUNCATE')                        AS must_be_true__service_role_read_only;

-- 3. Functions: SECURITY DEFINER where expected, pinned search_path, grants
SELECT p.oid::regprocedure AS function,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       p.proconfig AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_execute__must_be_false,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'student_services_enabled', 'get_student_services_status',
  'admin_get_student_services_switch', 'admin_set_student_services_enabled',
  'guard_student_services_switch', 'guard_student_services_switch_row')
ORDER BY 1;

-- 4. Triggers
SELECT t.tgrelid::regclass AS on_table, t.tgname, t.tgtype, t.tgenabled,
       t.tgfoid::regprocedure AS function
FROM pg_trigger t
WHERE NOT t.tgisinternal AND t.tgname IN (
  'trg_00_student_services_switch_guard',
  'trg_student_services_switch_row_keep',
  'trg_student_services_switch_no_truncate')
ORDER BY 2;

-- 5. Predicate and student-facing read
SELECT public.student_services_enabled() AS services_enabled_now,
       public.get_student_services_status() AS student_facing_status;

-- 6. Audit trail of the switch (empty right after the first apply)
SELECT created_at, actor_user_id, actor_role, action_type, old_values, new_values
FROM public.audit_logs
WHERE entity_type = 'student_services_switch'
ORDER BY created_at DESC
LIMIT 20;

-- 7. Verdict
SELECT CASE WHEN
      (SELECT count(*) FROM public.student_services_switch) = 1
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_services_switch'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'student_services_switch')
  AND NOT has_table_privilege('anon', 'public.student_services_switch', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.student_services_switch', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.student_services_switch', 'INSERT,UPDATE,DELETE,TRUNCATE')
  AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=public, pg_temp']
          AND p.proname IN ('student_services_enabled', 'get_student_services_status',
                            'admin_get_student_services_switch', 'admin_set_student_services_enabled',
                            'guard_student_services_switch')) = 5
  AND NOT has_function_privilege('anon', 'public.student_services_enabled()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_student_services_status()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_get_student_services_switch()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_set_student_services_enabled(boolean,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_student_services_status()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.admin_set_student_services_enabled(boolean,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.guard_student_services_switch()', 'EXECUTE')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_requests'::regclass
        AND tgname = 'trg_00_student_services_switch_guard'
        AND tgfoid = 'public.guard_student_services_switch()'::regprocedure
        AND tgtype = 23 AND tgenabled = 'O' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_services_switch'::regclass
        AND tgname = 'trg_student_services_switch_row_keep' AND tgenabled = 'O')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.student_services_switch'::regclass
        AND tgname = 'trg_student_services_switch_no_truncate' AND tgenabled = 'O')
  THEN 'VERIFIED' ELSE 'VERIFICATION_FAILED' END AS verify_verdict;

ROLLBACK;
