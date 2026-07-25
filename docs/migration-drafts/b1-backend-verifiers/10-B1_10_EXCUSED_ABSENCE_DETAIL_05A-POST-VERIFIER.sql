-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 10 / POST_VERIFIER
-- Draft: REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'NOT has_table_privilege(''authenticated'',''public.absence_excuse_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.absence_excuse_details','INSERT'))
  UNION ALL SELECT 'CHECK_02', 'has_table_privilege(''authenticated'',''public.absence_excuse_details'',''SELECT'')', (has_table_privilege('authenticated','public.absence_excuse_details','SELECT'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'NOT has_table_privilege(''authenticated'',''public.absence_excuse_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.absence_excuse_details','INSERT'))
        UNION ALL SELECT 'CHECK_02', 'has_table_privilege(''authenticated'',''public.absence_excuse_details'',''SELECT'')', (has_table_privilege('authenticated','public.absence_excuse_details','SELECT'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_10_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
