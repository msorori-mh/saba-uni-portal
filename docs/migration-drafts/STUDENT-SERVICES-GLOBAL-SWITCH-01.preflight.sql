-- STUDENT-SERVICES-GLOBAL-SWITCH-01 — PRE-FLIGHT (READ-ONLY).
-- Run BEFORE applying the draft. Contains SELECT statements only: it creates,
-- alters and writes nothing. Every "must_be_true" column has to be true and the
-- final verdict has to read READY_TO_APPLY.
BEGIN TRANSACTION READ ONLY;

-- 1. Prerequisites the draft's own guard also checks
SELECT
  to_regclass('public.student_requests')  IS NOT NULL AS must_be_true__student_requests,
  to_regclass('public.student_profiles')  IS NOT NULL AS must_be_true__student_profiles,
  to_regclass('public.audit_logs')        IS NOT NULL AS must_be_true__audit_logs,
  to_regprocedure('auth.uid()')           IS NOT NULL AS must_be_true__auth_uid,
  to_regprocedure('public.has_any_role(uuid,text[])') IS NOT NULL AS must_be_true__has_any_role,
  to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NOT NULL
                                                    AS must_be_true__log_audit_7_args,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_audit') = 1 AS must_be_true__single_log_audit,
  (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3
                                                    AS must_be_true__api_roles;

SELECT count(*) = 5 AS must_be_true__column_contract
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (c.table_name, c.column_name, c.data_type) IN (
    ('student_requests','id','uuid'),
    ('student_requests','student_profile_id','uuid'),
    ('student_requests','status','text'),
    ('student_profiles','id','uuid'),
    ('student_profiles','user_id','uuid'));

-- 2. Name collisions: on a first apply every row must say already_exists = false.
--    (true everywhere = the draft was applied before; re-applying is harmless.)
SELECT 'table public.student_services_switch' AS object,
       to_regclass('public.student_services_switch') IS NOT NULL AS already_exists
UNION ALL SELECT 'function public.student_services_enabled()',
       to_regprocedure('public.student_services_enabled()') IS NOT NULL
UNION ALL SELECT 'function public.get_student_services_status()',
       to_regprocedure('public.get_student_services_status()') IS NOT NULL
UNION ALL SELECT 'function public.admin_get_student_services_switch()',
       to_regprocedure('public.admin_get_student_services_switch()') IS NOT NULL
UNION ALL SELECT 'function public.admin_set_student_services_enabled(boolean,text)',
       to_regprocedure('public.admin_set_student_services_enabled(boolean,text)') IS NOT NULL
UNION ALL SELECT 'function public.guard_student_services_switch()',
       to_regprocedure('public.guard_student_services_switch()') IS NOT NULL
UNION ALL SELECT 'function public.guard_student_services_switch_row()',
       to_regprocedure('public.guard_student_services_switch_row()') IS NOT NULL
UNION ALL SELECT 'trigger trg_00_student_services_switch_guard',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_00_student_services_switch_guard' AND NOT tgisinternal);

-- 3. Existing triggers on student_requests (informational). BEFORE row triggers
--    fire in name order, so trg_00_… runs first and reports the pause before
--    any other guard.
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE t.tgrelid = 'public.student_requests'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 4. Every deployed function that writes a request row or sets a request
--    status (informational): these are the entry points the trigger covers
--    without rewriting any of them.
SELECT p.oid::regprocedure AS function, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.prosrc ~* 'insert\s+into\s+(public\.)?student_requests\M'
       OR p.prosrc ~* 'update\s+(public\.)?student_requests\s+set[^;]*\mstatus\M')
ORDER BY 1;

-- 5. Row-level policies that let a student write the table directly (informational)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'student_requests' AND cmd IN ('INSERT','UPDATE','ALL')
ORDER BY policyname;

-- 6. Volume the switch will affect, by status (informational; nothing is modified)
SELECT status, count(*) AS requests
FROM public.student_requests GROUP BY status ORDER BY status;

-- 7. Ordering with EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (PR #436).
--    Informational: this draft applies identically before or after it.
SELECT to_regclass('public.excused_absence_fee_decisions') IS NOT NULL
         AS excused_absence_paid_signature_workflow_01_applied;

-- 8. Verdict
SELECT CASE WHEN
      to_regclass('public.student_requests') IS NOT NULL
  AND to_regclass('public.student_profiles') IS NOT NULL
  AND to_regclass('public.audit_logs') IS NOT NULL
  AND to_regprocedure('auth.uid()') IS NOT NULL
  AND to_regprocedure('public.has_any_role(uuid,text[])') IS NOT NULL
  AND to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NOT NULL
  AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'log_audit') = 1
  AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3
  AND (SELECT count(*) FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND (c.table_name, c.column_name, c.data_type) IN (
            ('student_requests','id','uuid'),('student_requests','student_profile_id','uuid'),
            ('student_requests','status','text'),('student_profiles','id','uuid'),
            ('student_profiles','user_id','uuid'))) = 5
  AND NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'public.student_requests'::regclass
          AND t.tgname = 'trg_00_student_services_switch_guard' AND NOT t.tgisinternal
          AND to_regprocedure('public.guard_student_services_switch()') IS DISTINCT FROM t.tgfoid::regprocedure)
  THEN 'READY_TO_APPLY' ELSE 'NOT_READY_DO_NOT_APPLY' END AS preflight_verdict;

ROLLBACK;
