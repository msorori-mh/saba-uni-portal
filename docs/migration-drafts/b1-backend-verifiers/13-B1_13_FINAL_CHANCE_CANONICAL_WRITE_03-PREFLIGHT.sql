-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 13 / PREFLIGHT
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
    CASE
      WHEN c.extra_chance_count = 1 AND c.final_chance_count = 0 THEN 'extra_chance'
      WHEN c.extra_chance_count = 0 AND c.final_chance_count = 1 THEN 'final_chance'
      ELSE NULL
    END AS resolved_stored_code,
    (
      (c.extra_chance_count = 1 AND c.final_chance_count = 0)
      OR (c.extra_chance_count = 0 AND c.final_chance_count = 1)
    ) AS exactly_one_stored_request_type
  FROM counts c
),
checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.extra_chance_details'') IS NOT NULL',
         (to_regclass('public.extra_chance_details') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.student_extra_chances'') IS NOT NULL',
         (to_regclass('public.student_extra_chances') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03',
         format('extra_chance_count=%s', r.extra_chance_count),
         (r.extra_chance_count IN (0, 1))
  FROM resolved r
  UNION ALL SELECT 'CHECK_04',
         format('final_chance_count=%s', r.final_chance_count),
         (r.final_chance_count IN (0, 1))
  FROM resolved r
  UNION ALL SELECT 'CHECK_05',
         format('resolved_stored_code=%s', coalesce(r.resolved_stored_code, 'NONE')),
         (r.resolved_stored_code IS NOT NULL)
  FROM resolved r
  UNION ALL SELECT 'CHECK_06', 'exactly_one_stored_request_type=true',
         r.exactly_one_stored_request_type
  FROM resolved r
  UNION ALL SELECT 'CHECK_07', 'reject both present',
         NOT (r.extra_chance_count >= 1 AND r.final_chance_count >= 1)
  FROM resolved r
  UNION ALL SELECT 'CHECK_08', 'reject neither present',
         NOT (r.extra_chance_count = 0 AND r.final_chance_count = 0)
  FROM resolved r
  UNION ALL SELECT 'CHECK_09', 'reject duplicate codes',
         (r.extra_chance_count <= 1 AND r.final_chance_count <= 1)
  FROM resolved r
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
          c.extra_chance_count,
          c.final_chance_count,
          CASE
            WHEN c.extra_chance_count = 1 AND c.final_chance_count = 0 THEN 'extra_chance'
            WHEN c.extra_chance_count = 0 AND c.final_chance_count = 1 THEN 'final_chance'
            ELSE NULL
          END AS resolved_stored_code,
          (
            (c.extra_chance_count = 1 AND c.final_chance_count = 0)
            OR (c.extra_chance_count = 0 AND c.final_chance_count = 1)
          ) AS exactly_one_stored_request_type
        FROM counts c
      ),
      checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regclass(''public.extra_chance_details'') IS NOT NULL',
               (to_regclass('public.extra_chance_details') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.student_extra_chances'') IS NOT NULL',
               (to_regclass('public.student_extra_chances') IS NOT NULL)
        UNION ALL SELECT 'CHECK_03',
               format('extra_chance_count=%s', r.extra_chance_count),
               (r.extra_chance_count IN (0, 1))
        FROM resolved r
        UNION ALL SELECT 'CHECK_04',
               format('final_chance_count=%s', r.final_chance_count),
               (r.final_chance_count IN (0, 1))
        FROM resolved r
        UNION ALL SELECT 'CHECK_05',
               format('resolved_stored_code=%s', coalesce(r.resolved_stored_code, 'NONE')),
               (r.resolved_stored_code IS NOT NULL)
        FROM resolved r
        UNION ALL SELECT 'CHECK_06', 'exactly_one_stored_request_type=true',
               r.exactly_one_stored_request_type
        FROM resolved r
        UNION ALL SELECT 'CHECK_07', 'reject both present',
               NOT (r.extra_chance_count >= 1 AND r.final_chance_count >= 1)
        FROM resolved r
        UNION ALL SELECT 'CHECK_08', 'reject neither present',
               NOT (r.extra_chance_count = 0 AND r.final_chance_count = 0)
        FROM resolved r
        UNION ALL SELECT 'CHECK_09', 'reject duplicate codes',
               (r.extra_chance_count <= 1 AND r.final_chance_count <= 1)
        FROM resolved r
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_13_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
