-- Read-only evidence after authorized migration application. No writes.
-- Unexpected EXECUTE on any internal helper below is a release blocker.
SELECT p.oid::regprocedure AS function_signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY anon_can_execute DESC, authenticated_can_execute DESC, function_signature;

-- Confirm the named service-only functions in this security package.
SELECT f.signature,
       to_regprocedure('public.' || f.signature) IS NOT NULL AS exists,
       has_function_privilege('anon', to_regprocedure('public.' || f.signature), 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', to_regprocedure('public.' || f.signature), 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', to_regprocedure('public.' || f.signature), 'EXECUTE') AS service_role_can_execute
FROM (VALUES
  ('link_faculty_profile_account(uuid,uuid)'),
  ('replace_class_schedule_for_context(uuid[],jsonb)'),
  ('link_staff_profile_account(uuid,uuid)'),
  ('check_and_record_rate_limit(text,text,integer,integer,integer)'),
  ('p1_enrollment_result(uuid)'),
  ('p1_passed_course_ids(uuid)'),
  ('student_has_approved_grades_for_transcript(uuid)')
) AS f(signature);

SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'payment_receipts'
  AND cmd = 'INSERT';

-- New routines made by postgres must not inherit EXECUTE for PUBLIC,
-- anon, or authenticated. Empty result is the desired state.
SELECT d.defaclnamespace::regnamespace AS schema_scope,
       a.grantee::regrole AS grantee,
       a.privilege_type
FROM pg_default_acl d
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE d.defaclrole = 'postgres'::regrole
  AND d.defaclobjtype = 'f'
  AND a.privilege_type = 'EXECUTE'
  AND (a.grantee = 0 OR a.grantee IN ('anon'::regrole, 'authenticated'::regrole));
