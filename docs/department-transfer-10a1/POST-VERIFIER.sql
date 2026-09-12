-- Department Transfer 10A1 — read-only post-verifier.
-- Prepared for a separately authorized PG17/production verification; not run.

BEGIN;
SET TRANSACTION READ ONLY;

WITH checks(name, ok) AS (
  SELECT 'detail_table', to_regclass('public.transfer_request_details') IS NOT NULL
  UNION ALL SELECT 'detail_rls', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.transfer_request_details')), false)
  UNION ALL SELECT 'submit_rpc', to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NOT NULL
  UNION ALL SELECT 'act_rpc', to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NOT NULL
  UNION ALL SELECT 'payment_rpc', to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL
  UNION ALL SELECT 'scope_rpc', to_regprocedure('public.current_user_matches_transfer_department_scope(uuid,text)') IS NOT NULL
  UNION ALL SELECT 'submit_anon_denied', CASE WHEN to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NULL THEN false ELSE NOT has_function_privilege('anon','public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])','EXECUTE') END
  UNION ALL SELECT 'act_anon_denied', CASE WHEN to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL THEN false ELSE NOT has_function_privilege('anon','public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)','EXECUTE') END
  UNION ALL SELECT 'payment_anon_denied', CASE WHEN to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NULL THEN false ELSE NOT has_function_privilege('anon','public.record_external_university_payment_confirmation(uuid,text)','EXECUTE') END
  UNION ALL SELECT 'submit_public_denied', CASE WHEN to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NULL THEN false ELSE NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') AND a.grantee=0 AND a.privilege_type='EXECUTE') END
  UNION ALL SELECT 'act_public_denied', CASE WHEN to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL THEN false ELSE NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') AND a.grantee=0 AND a.privilege_type='EXECUTE') END
  UNION ALL SELECT 'payment_public_denied', CASE WHEN to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NULL THEN false ELSE NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') AND a.grantee=0 AND a.privilege_type='EXECUTE') END
  UNION ALL SELECT 'detail_authenticated_dml_denied', CASE WHEN to_regclass('public.transfer_request_details') IS NULL THEN false ELSE NOT has_table_privilege('authenticated','public.transfer_request_details','INSERT')
    AND NOT has_table_privilege('authenticated','public.transfer_request_details','UPDATE')
    AND NOT has_table_privilege('authenticated','public.transfer_request_details','DELETE') END
)
SELECT name, ok, CASE WHEN ok THEN 'PASS' ELSE 'HOLD' END AS result
FROM checks
ORDER BY name;

SELECT 'zero_residue_counts' AS check_name,
       count(*) FILTER (WHERE request_type IN ('department_transfer','transfer') AND COALESCE(form_data->>'TEST_ONLY','')='true') AS transfer_test_only_count,
       count(*) FILTER (WHERE request_type IN ('department_transfer','transfer') AND status NOT IN ('completed','rejected','cancelled')) AS transfer_open_count
FROM public.student_requests;

ROLLBACK;
