-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 14 / POST_VERIFIER
-- Draft: REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regprocedure(''public.apply_b1_detail_rpc_write_boundaries()'') IS NOT NULL', (to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'NOT has_function_privilege(''authenticated'',''public.apply_b1_detail_rpc_write_boundaries()'',''EXECUTE'')', (NOT has_function_privilege('authenticated','public.apply_b1_detail_rpc_write_boundaries()','EXECUTE'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regprocedure(''public.apply_b1_detail_rpc_write_boundaries()'') IS NOT NULL', (to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'NOT has_function_privilege(''authenticated'',''public.apply_b1_detail_rpc_write_boundaries()'',''EXECUTE'')', (NOT has_function_privilege('authenticated','public.apply_b1_detail_rpc_write_boundaries()','EXECUTE'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_14_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
