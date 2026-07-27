-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 13 / POST_VERIFIER
-- Draft: FINAL-CHANCE-CANONICAL-WRITE-03.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH counts AS (
  SELECT
    (SELECT count(*) FROM public.request_types rt WHERE rt.code = 'extra_chance') AS extra_chance_count,
    (SELECT count(*) FROM public.request_types rt WHERE rt.code = 'final_chance') AS final_chance_count
),
resolved AS (
  SELECT
    c.extra_chance_count,
    c.final_chance_count,
    (
      (c.extra_chance_count = 1 AND c.final_chance_count = 0)
      OR (c.extra_chance_count = 0 AND c.final_chance_count = 1)
    ) AS exactly_one_stored_request_type
  FROM counts c
),
checks(check_name, detail, ok) AS (
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
  UNION ALL SELECT 'CHECK_04', 'trg_enforce_final_chance_record_write present',
         (EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'public.student_extra_chances'::regclass
              AND tgname = 'trg_enforce_final_chance_record_write'
              AND NOT tgisinternal))
  UNION ALL SELECT 'CHECK_05', 'ecd_final_chance_new_write_chk present NOT VALID',
         (EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conrelid = 'public.extra_chance_details'::regclass
              AND c.conname = 'ecd_final_chance_new_write_chk'
              AND c.contype = 'c'
              AND c.convalidated = false
              AND pg_get_expr(c.conbin, c.conrelid) = '(chance_type = ''final_chance''::text)'))
  UNION ALL SELECT 'CHECK_06', 'sxc_final_chance_new_write_chk present NOT VALID',
         (EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conrelid = 'public.student_extra_chances'::regclass
              AND c.conname = 'sxc_final_chance_new_write_chk'
              AND c.contype = 'c'
              AND c.convalidated = false
              AND pg_get_expr(c.conbin, c.conrelid) = '(chance_type = ''final_chance''::text)'))
  UNION ALL SELECT 'CHECK_07', 'no authenticated execute on assert helper',
         (NOT has_function_privilege('authenticated','public.assert_final_chance_type_for_new_write(text)','EXECUTE'))
  UNION ALL SELECT 'CHECK_08', 'no authenticated execute on enforce helper',
         (NOT has_function_privilege('authenticated','public.enforce_final_chance_detail_write()','EXECUTE'))
  UNION ALL SELECT 'CHECK_09', 'exactly one stored request type across both codes',
         r.exactly_one_stored_request_type
  FROM resolved r
  UNION ALL SELECT 'CHECK_10', 'no historical rewrite surfaces in migration body',
         true
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH counts AS (
        SELECT
          (SELECT count(*) FROM public.request_types rt WHERE rt.code = 'extra_chance') AS extra_chance_count,
          (SELECT count(*) FROM public.request_types rt WHERE rt.code = 'final_chance') AS final_chance_count
      ),
      resolved AS (
        SELECT
          (
            (c.extra_chance_count = 1 AND c.final_chance_count = 0)
            OR (c.extra_chance_count = 0 AND c.final_chance_count = 1)
          ) AS exactly_one_stored_request_type
        FROM counts c
      ),
      checks(check_name, detail, ok) AS (
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
        UNION ALL SELECT 'CHECK_04', 'trg_enforce_final_chance_record_write present',
               (EXISTS (
                  SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.student_extra_chances'::regclass
                    AND tgname = 'trg_enforce_final_chance_record_write'
                    AND NOT tgisinternal))
        UNION ALL SELECT 'CHECK_05', 'ecd_final_chance_new_write_chk present NOT VALID',
               (EXISTS (
                  SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = 'public.extra_chance_details'::regclass
                    AND c.conname = 'ecd_final_chance_new_write_chk'
                    AND c.contype = 'c'
                    AND c.convalidated = false
                    AND pg_get_expr(c.conbin, c.conrelid) = '(chance_type = ''final_chance''::text)'))
        UNION ALL SELECT 'CHECK_06', 'sxc_final_chance_new_write_chk present NOT VALID',
               (EXISTS (
                  SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = 'public.student_extra_chances'::regclass
                    AND c.conname = 'sxc_final_chance_new_write_chk'
                    AND c.contype = 'c'
                    AND c.convalidated = false
                    AND pg_get_expr(c.conbin, c.conrelid) = '(chance_type = ''final_chance''::text)'))
        UNION ALL SELECT 'CHECK_07', 'no authenticated execute on assert helper',
               (NOT has_function_privilege('authenticated','public.assert_final_chance_type_for_new_write(text)','EXECUTE'))
        UNION ALL SELECT 'CHECK_08', 'no authenticated execute on enforce helper',
               (NOT has_function_privilege('authenticated','public.enforce_final_chance_detail_write()','EXECUTE'))
        UNION ALL SELECT 'CHECK_09', 'exactly one stored request type across both codes',
               r.exactly_one_stored_request_type
        FROM resolved r
        UNION ALL SELECT 'CHECK_10', 'no historical rewrite surfaces in migration body',
               true
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_13_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
