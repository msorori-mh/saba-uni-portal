-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 11 / POST_VERIFIER
-- Draft: REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.file_withdrawal_details'') IS NOT NULL', (to_regclass('public.file_withdrawal_details') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'NOT has_table_privilege(''authenticated'',''public.file_withdrawal_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.file_withdrawal_details','INSERT'))
  UNION ALL SELECT 'CHECK_03', 'has_table_privilege(''authenticated'',''public.file_withdrawal_details'',''SELECT'')', (has_table_privilege('authenticated','public.file_withdrawal_details','SELECT'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regclass(''public.file_withdrawal_details'') IS NOT NULL', (to_regclass('public.file_withdrawal_details') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'NOT has_table_privilege(''authenticated'',''public.file_withdrawal_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.file_withdrawal_details','INSERT'))
        UNION ALL SELECT 'CHECK_03', 'has_table_privilege(''authenticated'',''public.file_withdrawal_details'',''SELECT'')', (has_table_privilege('authenticated','public.file_withdrawal_details','SELECT'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_11_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
