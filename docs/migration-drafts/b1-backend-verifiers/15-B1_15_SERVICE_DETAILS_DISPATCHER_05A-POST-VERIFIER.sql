-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 15 / POST_VERIFIER
-- Draft: REQUEST-B1-SERVICE-DETAILS-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) NOT LIKE ''%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) NOT LIKE '%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%')
  UNION ALL SELECT 'CHECK_02', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) LIKE ''%enrollment_suspension%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) LIKE '%enrollment_suspension%')
  UNION ALL SELECT 'CHECK_03', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) LIKE ''%file_withdrawal%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) LIKE '%file_withdrawal%')
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) NOT LIKE ''%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) NOT LIKE '%B1_SERVICE_PERSISTENCE_NOT_INSTALLED%')
        UNION ALL SELECT 'CHECK_02', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) LIKE ''%enrollment_suspension%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) LIKE '%enrollment_suspension%')
        UNION ALL SELECT 'CHECK_03', '(SELECT prosrc FROM pg_proc WHERE oid=''public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])''::regprocedure) LIKE ''%file_withdrawal%''', ((SELECT prosrc FROM pg_proc WHERE oid='public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) LIKE '%file_withdrawal%')
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_15_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
