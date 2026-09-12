-- Department Transfer 10A1 — read-only partial-apply classifier.
-- This never performs rollback. A PARTIAL result requires a reviewed
-- forward-only remediation decision and must stop the chain.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected(name, present) AS (
  SELECT 'transfer_request_details', to_regclass('public.transfer_request_details') IS NOT NULL
  UNION ALL SELECT 'submit_b1_student_request_atomic', to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NOT NULL
  UNION ALL SELECT 'act_on_b1_student_request_step_atomic', to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NOT NULL
  UNION ALL SELECT 'record_external_university_payment_confirmation', to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL
  UNION ALL SELECT 'current_user_matches_transfer_department_scope', to_regprocedure('public.current_user_matches_transfer_department_scope(uuid,text)') IS NOT NULL
), totals AS (
  SELECT count(*) AS expected_count, count(*) FILTER (WHERE present) AS present_count
  FROM expected
)
SELECT CASE
  WHEN present_count = 0 THEN 'ABSENT_NO_RUNTIME_OBJECTS'
  WHEN present_count = expected_count THEN 'COMPLETE_FORWARD_CHAIN_CANDIDATE'
  ELSE 'PARTIAL_APPLY_STOP_AND_REVIEW_FORWARD_ONLY'
END AS classification,
expected_count, present_count
FROM totals;

WITH expected(name, present) AS (
  SELECT 'transfer_request_details', to_regclass('public.transfer_request_details') IS NOT NULL
  UNION ALL SELECT 'submit_b1_student_request_atomic', to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NOT NULL
  UNION ALL SELECT 'act_on_b1_student_request_step_atomic', to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NOT NULL
  UNION ALL SELECT 'record_external_university_payment_confirmation', to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL
  UNION ALL SELECT 'current_user_matches_transfer_department_scope', to_regprocedure('public.current_user_matches_transfer_department_scope(uuid,text)') IS NOT NULL
)
SELECT name, present
FROM expected
ORDER BY name;

ROLLBACK;
