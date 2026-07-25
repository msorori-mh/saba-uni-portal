-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 8 / POST_VERIFIER
-- Draft: REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regprocedure(''public.assert_b1_academic_period_reference(uuid,uuid)'') IS NOT NULL', (to_regprocedure('public.assert_b1_academic_period_reference(uuid,uuid)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regprocedure(''public.assert_b1_active_course_enrollment(uuid,uuid)'') IS NOT NULL', (to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'to_regprocedure(''public.assert_b1_target_program_department(uuid,uuid)'') IS NOT NULL', (to_regprocedure('public.assert_b1_target_program_department(uuid,uuid)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_04', 'NOT has_function_privilege(''authenticated'',''public.assert_b1_academic_period_reference(uuid,uuid)'',''EXECUTE'')', (NOT has_function_privilege('authenticated','public.assert_b1_academic_period_reference(uuid,uuid)','EXECUTE'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regprocedure(''public.assert_b1_academic_period_reference(uuid,uuid)'') IS NOT NULL', (to_regprocedure('public.assert_b1_academic_period_reference(uuid,uuid)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'to_regprocedure(''public.assert_b1_active_course_enrollment(uuid,uuid)'') IS NOT NULL', (to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_03', 'to_regprocedure(''public.assert_b1_target_program_department(uuid,uuid)'') IS NOT NULL', (to_regprocedure('public.assert_b1_target_program_department(uuid,uuid)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_04', 'NOT has_function_privilege(''authenticated'',''public.assert_b1_academic_period_reference(uuid,uuid)'',''EXECUTE'')', (NOT has_function_privilege('authenticated','public.assert_b1_academic_period_reference(uuid,uuid)','EXECUTE'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_8_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
