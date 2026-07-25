-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 17 / PREFLIGHT
-- Draft: EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regprocedure(''public.record_external_university_payment_confirmation(uuid,text)'') IS NOT NULL', (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.request_type_workflows'') IS NOT NULL', (to_regclass('public.request_type_workflows') IS NOT NULL)
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regprocedure(''public.record_external_university_payment_confirmation(uuid,text)'') IS NOT NULL', (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.request_type_workflows'') IS NOT NULL', (to_regclass('public.request_type_workflows') IS NOT NULL)
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_17_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
