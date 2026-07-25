-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 18 / PREFLIGHT
-- Draft: REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regprocedure(''public.apply_b1_detail_rpc_write_boundaries()'') IS NOT NULL', (to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) NOT LIKE ''%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) NOT LIKE '%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%')
  UNION ALL SELECT 'CHECK_03', 'obj_description(''public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])''::regprocedure,''pg_proc'') ~ ''^B1_ATOMIC_CALLER_RELEASE_EVIDENCE=[0-9a-f]{40}$''', (obj_description('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'::regprocedure,'pg_proc') ~ '^B1_ATOMIC_CALLER_RELEASE_EVIDENCE=[0-9a-f]{40}$')
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regprocedure(''public.apply_b1_detail_rpc_write_boundaries()'') IS NOT NULL', (to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) NOT LIKE ''%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) NOT LIKE '%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%')
        UNION ALL SELECT 'CHECK_03', 'obj_description(''public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])''::regprocedure,''pg_proc'') ~ ''^B1_ATOMIC_CALLER_RELEASE_EVIDENCE=[0-9a-f]{40}$''', (obj_description('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'::regprocedure,'pg_proc') ~ '^B1_ATOMIC_CALLER_RELEASE_EVIDENCE=[0-9a-f]{40}$')
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_18_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
