-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 10 / PREFLIGHT
-- Draft: REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
--
-- ACL note (pre-state, remediable by SEQ10 migration):
--   - owner privileges = expected
--   - authenticated/service_role SELECT-only = already final-shaped (ok)
--   - sandbox_exec OR PUBLIC/anon/authenticated/service_role privileges that
--     SEQ10 will REVOKE/rewrite = REMEDIABLE (not a preflight hard-fail)
--   - any other grantee = PREFLIGHT FAIL (fail-closed)
-- Migration SEQ10 bytes / SHA are immutable after production apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH acl_rows AS (
  SELECT
    CASE
      WHEN x.grantee = 0 THEN 'PUBLIC'
      ELSE coalesce(r.rolname, x.grantee::text)
    END AS grantee_name,
    x.privilege_type,
    x.is_grantable,
    (x.grantee = c.relowner) AS is_owner
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
  LEFT JOIN pg_roles r ON r.oid = x.grantee
  WHERE c.oid = to_regclass('public.absence_excuse_details')
),
classified AS (
  SELECT
    grantee_name,
    privilege_type,
    CASE
      WHEN is_owner THEN 'owner'
      WHEN grantee_name IN ('authenticated', 'service_role')
           AND privilege_type = 'SELECT'
           AND NOT is_grantable THEN 'expected_select'
      WHEN grantee_name IN (
             'sandbox_exec',
             'PUBLIC',
             'anon',
             'authenticated',
             'service_role'
           ) THEN 'remediable_pre_state'
      ELSE 'unexpected'
    END AS classification
  FROM acl_rows
),
checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.absence_excuse_details'') IS NOT NULL',
         (to_regclass('public.absence_excuse_details') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regprocedure(''public.assert_b1_active_course_enrollment(uuid,uuid)'') IS NOT NULL',
         (to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'no unexpected ACL grantee outside remediable pre-state set',
         (
           to_regclass('public.absence_excuse_details') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM classified c WHERE c.classification = 'unexpected'
           )
         )
  UNION ALL SELECT 'CHECK_04', 'sandbox_exec absent or remediable when present (informational)',
         (
           to_regclass('public.absence_excuse_details') IS NOT NULL
           AND (
             NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
             OR EXISTS (
               SELECT 1 FROM classified c
               WHERE c.grantee_name = 'sandbox_exec'
                 AND c.classification = 'remediable_pre_state'
             )
             OR NOT EXISTS (
               SELECT 1 FROM classified c WHERE c.grantee_name = 'sandbox_exec'
             )
           )
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

WITH acl_rows AS (
  SELECT
    CASE
      WHEN x.grantee = 0 THEN 'PUBLIC'
      ELSE coalesce(r.rolname, x.grantee::text)
    END AS grantee_name,
    x.privilege_type,
    x.is_grantable,
    (x.grantee = c.relowner) AS is_owner
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
  LEFT JOIN pg_roles r ON r.oid = x.grantee
  WHERE c.oid = to_regclass('public.absence_excuse_details')
),
classified AS (
  SELECT
    grantee_name,
    privilege_type,
    CASE
      WHEN is_owner THEN 'owner'
      WHEN grantee_name IN ('authenticated', 'service_role')
           AND privilege_type = 'SELECT'
           AND NOT is_grantable THEN 'expected_select'
      WHEN grantee_name IN (
             'sandbox_exec',
             'PUBLIC',
             'anon',
             'authenticated',
             'service_role'
           ) THEN 'remediable_pre_state'
      ELSE 'unexpected'
    END AS classification
  FROM acl_rows
)
SELECT
  'EVIDENCE_ACL' AS evidence_kind,
  grantee_name,
  privilege_type,
  classification
FROM classified
ORDER BY 2, 3;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH acl_rows AS (
        SELECT
          CASE
            WHEN x.grantee = 0 THEN 'PUBLIC'
            ELSE coalesce(r.rolname, x.grantee::text)
          END AS grantee_name,
          x.privilege_type,
          x.is_grantable,
          (x.grantee = c.relowner) AS is_owner
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
        LEFT JOIN pg_roles r ON r.oid = x.grantee
        WHERE c.oid = to_regclass('public.absence_excuse_details')
      ),
      classified AS (
        SELECT
          grantee_name,
          CASE
            WHEN is_owner THEN 'owner'
            WHEN grantee_name IN ('authenticated', 'service_role')
                 AND privilege_type = 'SELECT'
                 AND NOT is_grantable THEN 'expected_select'
            WHEN grantee_name IN (
                   'sandbox_exec',
                   'PUBLIC',
                   'anon',
                   'authenticated',
                   'service_role'
                 ) THEN 'remediable_pre_state'
            ELSE 'unexpected'
          END AS classification
        FROM acl_rows
      ),
      checks(ok) AS (
        SELECT (to_regclass('public.absence_excuse_details') IS NOT NULL)
        UNION ALL SELECT (to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') IS NOT NULL)
        UNION ALL SELECT (
          to_regclass('public.absence_excuse_details') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM classified c WHERE c.classification = 'unexpected'
          )
        )
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_10_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
