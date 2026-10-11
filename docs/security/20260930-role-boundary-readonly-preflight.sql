-- Read-only preflight and post-apply evidence for PR #419.
-- Run before and after in the target environment; keep result sets with the release record.
SELECT current_database() AS database_name, now() AS observed_at;

SELECT c.relname AS relation_name, t.tgname AS trigger_name, t.tgenabled AS enabled,
       p.oid::regprocedure AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal
  AND c.relname IN ('student_requests','official_documents','grade_components','student_grades')
ORDER BY 1,2;

SELECT p.oid::regprocedure AS function_name,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('issue_official_document','act_on_student_request_step',
   'act_on_student_request_step_internal','approve_submitted_section_grades')
ORDER BY 1;

SELECT has_table_privilege('authenticated','public.official_documents','INSERT') AS document_client_insert,
       has_table_privilege('authenticated','public.official_documents','UPDATE') AS document_client_update;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='student_requests'
  AND policyname IN ('sr_insert_priv','sr_update_priv') ORDER BY policyname;

SELECT sr.status, count(*) AS requests_without_runtime_steps
FROM public.student_requests sr
WHERE sr.status IN ('submitted','in_review','under_review')
  AND NOT EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id=sr.id)
GROUP BY sr.status ORDER BY sr.status;

SELECT count(*) AS grades_with_cross_section_component
FROM public.student_grades g
JOIN public.student_enrollments e ON e.id=g.student_enrollment_id
JOIN public.grade_components c ON c.id=g.grade_component_id
WHERE e.course_section_id IS DISTINCT FROM c.course_section_id;
