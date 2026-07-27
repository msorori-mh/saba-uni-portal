-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 11 / PREFLIGHT
-- Draft: REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
--
-- Pre-create note: table may be absent (first apply). If present, ACL must not
-- contain unexpected grantees outside remediable pre-state
-- (sandbox_exec / PUBLIC / anon / authenticated / service_role).
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
  WHERE c.oid = to_regclass('public.file_withdrawal_details')
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
  SELECT 'CHECK_01', 'to_regclass(''public.student_requests'') IS NOT NULL',
         (to_regclass('public.student_requests') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'file_withdrawal_details absent or ACL has no unexpected grantee',
         (
           to_regclass('public.file_withdrawal_details') IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM classified c WHERE c.classification = 'unexpected'
           )
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

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
        WHERE c.oid = to_regclass('public.file_withdrawal_details')
      ),
      classified AS (
        SELECT
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
        SELECT (to_regclass('public.student_requests') IS NOT NULL)
        UNION ALL SELECT (
          to_regclass('public.file_withdrawal_details') IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM classified c WHERE c.classification = 'unexpected'
          )
        )
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_11_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
