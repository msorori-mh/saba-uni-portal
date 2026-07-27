-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 10 / PREFLIGHT
-- Draft: REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
--
-- ACL note (SEQ10 sandbox_exec remediation):
--   - owner / authenticated SELECT / service_role SELECT = expected
--   - sandbox_exec privileges = REMEDIABLE by SEQ10 (not a preflight hard-fail)
--   - any other unexpected grantee = PREFLIGHT FAIL (fail-closed)
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH unexpected_acl AS (
  SELECT
    coalesce(r.rolname, x.grantee::text) AS grantee_name,
    x.privilege_type
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
  LEFT JOIN pg_roles r ON r.oid = x.grantee
  WHERE to_regclass('public.absence_excuse_details') IS NOT NULL
    AND c.oid = 'public.absence_excuse_details'::regclass
    AND NOT (
      x.grantee = c.relowner
      OR (
        r.rolname IN ('authenticated', 'service_role')
        AND x.privilege_type = 'SELECT'
        AND NOT x.is_grantable
      )
    )
),
checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.absence_excuse_details'') IS NOT NULL',
         (to_regclass('public.absence_excuse_details') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regprocedure(''public.assert_b1_active_course_enrollment(uuid,uuid)'') IS NOT NULL',
         (to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'no unexpected ACL grantee other than remediable sandbox_exec',
         (
           to_regclass('public.absence_excuse_details') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM unexpected_acl u
             WHERE u.grantee_name IS DISTINCT FROM 'sandbox_exec'
           )
         )
  UNION ALL SELECT 'CHECK_04', 'sandbox_exec ACL state is absent or remediable (informational ok)',
         (
           to_regclass('public.absence_excuse_details') IS NOT NULL
           AND (
             NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
             OR EXISTS (SELECT 1 FROM unexpected_acl u WHERE u.grantee_name = 'sandbox_exec')
             OR NOT EXISTS (SELECT 1 FROM unexpected_acl)
           )
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

SELECT
  'EVIDENCE_ACL' AS evidence_kind,
  coalesce(r.rolname, x.grantee::text) AS grantee_name,
  x.privilege_type,
  CASE
    WHEN x.grantee = c.relowner THEN 'owner'
    WHEN r.rolname IN ('authenticated', 'service_role')
         AND x.privilege_type = 'SELECT'
         AND NOT x.is_grantable THEN 'expected_select'
    WHEN r.rolname = 'sandbox_exec' THEN 'remediable_sandbox_exec'
    ELSE 'unexpected'
  END AS classification
FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
LEFT JOIN pg_roles r ON r.oid = x.grantee
WHERE to_regclass('public.absence_excuse_details') IS NOT NULL
  AND c.oid = 'public.absence_excuse_details'::regclass
ORDER BY 2, 3;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH unexpected_acl AS (
        SELECT
          coalesce(r.rolname, x.grantee::text) AS grantee_name
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
        LEFT JOIN pg_roles r ON r.oid = x.grantee
        WHERE to_regclass('public.absence_excuse_details') IS NOT NULL
          AND c.oid = 'public.absence_excuse_details'::regclass
          AND NOT (
            x.grantee = c.relowner
            OR (
              r.rolname IN ('authenticated', 'service_role')
              AND x.privilege_type = 'SELECT'
              AND NOT x.is_grantable
            )
          )
      ),
      checks(ok) AS (
        SELECT (to_regclass('public.absence_excuse_details') IS NOT NULL)
        UNION ALL SELECT (to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') IS NOT NULL)
        UNION ALL SELECT (
          to_regclass('public.absence_excuse_details') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM unexpected_acl u
            WHERE u.grantee_name IS DISTINCT FROM 'sandbox_exec'
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
