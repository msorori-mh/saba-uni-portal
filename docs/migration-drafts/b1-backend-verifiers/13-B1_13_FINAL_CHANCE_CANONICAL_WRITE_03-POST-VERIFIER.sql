-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 13 / POST_VERIFIER
-- Draft: FINAL-CHANCE-CANONICAL-WRITE-03.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'assert_final_chance_type_for_new_write installed',
         (to_regprocedure('public.assert_final_chance_type_for_new_write(text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'enforce_final_chance_detail_write trigger fn installed',
         (to_regprocedure('public.enforce_final_chance_detail_write()') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'trg_enforce_final_chance_detail_write present',
         (EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'public.extra_chance_details'::regclass
              AND tgname = 'trg_enforce_final_chance_detail_write'
              AND NOT tgisinternal))
  UNION ALL SELECT 'CHECK_04', 'no authenticated execute on assert helper',
         (NOT has_function_privilege('authenticated','public.assert_final_chance_type_for_new_write(text)','EXECUTE'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'assert_final_chance_type_for_new_write installed',
               (to_regprocedure('public.assert_final_chance_type_for_new_write(text)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'enforce_final_chance_detail_write trigger fn installed',
               (to_regprocedure('public.enforce_final_chance_detail_write()') IS NOT NULL)
        UNION ALL SELECT 'CHECK_03', 'trg_enforce_final_chance_detail_write present',
               (EXISTS (
                  SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.extra_chance_details'::regclass
                    AND tgname = 'trg_enforce_final_chance_detail_write'
                    AND NOT tgisinternal))
        UNION ALL SELECT 'CHECK_04', 'no authenticated execute on assert helper',
               (NOT has_function_privilege('authenticated','public.assert_final_chance_type_for_new_write(text)','EXECUTE'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_13_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;