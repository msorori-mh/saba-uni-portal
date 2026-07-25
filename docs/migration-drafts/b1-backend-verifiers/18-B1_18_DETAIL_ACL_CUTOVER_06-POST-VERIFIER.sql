-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 18 / POST_VERIFIER
-- Draft: REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'NOT has_table_privilege(''authenticated'',''public.enrollment_suspension_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.enrollment_suspension_details','INSERT'))
  UNION ALL SELECT 'CHECK_02', 'NOT has_table_privilege(''authenticated'',''public.transfer_request_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.transfer_request_details','INSERT'))
  UNION ALL SELECT 'CHECK_03', 'NOT has_table_privilege(''authenticated'',''public.extra_chance_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.extra_chance_details','INSERT'))
  UNION ALL SELECT 'CHECK_04', 'NOT has_table_privilege(''authenticated'',''public.absence_excuse_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.absence_excuse_details','INSERT'))
  UNION ALL SELECT 'CHECK_05', 'NOT has_table_privilege(''authenticated'',''public.file_withdrawal_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.file_withdrawal_details','INSERT'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'NOT has_table_privilege(''authenticated'',''public.enrollment_suspension_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.enrollment_suspension_details','INSERT'))
        UNION ALL SELECT 'CHECK_02', 'NOT has_table_privilege(''authenticated'',''public.transfer_request_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.transfer_request_details','INSERT'))
        UNION ALL SELECT 'CHECK_03', 'NOT has_table_privilege(''authenticated'',''public.extra_chance_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.extra_chance_details','INSERT'))
        UNION ALL SELECT 'CHECK_04', 'NOT has_table_privilege(''authenticated'',''public.absence_excuse_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.absence_excuse_details','INSERT'))
        UNION ALL SELECT 'CHECK_05', 'NOT has_table_privilege(''authenticated'',''public.file_withdrawal_details'',''INSERT'')', (NOT has_table_privilege('authenticated','public.file_withdrawal_details','INSERT'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_18_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
