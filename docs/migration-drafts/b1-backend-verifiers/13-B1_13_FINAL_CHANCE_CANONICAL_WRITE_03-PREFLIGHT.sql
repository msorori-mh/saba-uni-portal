-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 13 / PREFLIGHT
-- Draft: FINAL-CHANCE-CANONICAL-WRITE-03.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.extra_chance_details'') IS NOT NULL', (to_regclass('public.extra_chance_details') IS NOT NULL)
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regclass(''public.extra_chance_details'') IS NOT NULL', (to_regclass('public.extra_chance_details') IS NOT NULL)
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_13_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
