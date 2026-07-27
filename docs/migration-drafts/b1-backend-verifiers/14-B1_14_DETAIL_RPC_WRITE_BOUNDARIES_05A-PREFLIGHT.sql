-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 14 / PREFLIGHT
-- Draft: REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
--
-- For each of the three legacy detail tables, ACL may include remediable
-- sandbox_exec / PUBLIC / anon / authenticated / service_role privileges.
-- Any other grantee fails closed.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH tables(name) AS (
  VALUES
    ('enrollment_suspension_details'),
    ('transfer_request_details'),
    ('extra_chance_details')
),
acl_rows AS (
  SELECT
    t.name AS table_name,
    CASE
      WHEN x.grantee = 0 THEN 'PUBLIC'
      ELSE coalesce(r.rolname, x.grantee::text)
    END AS grantee_name,
    x.privilege_type,
    x.is_grantable,
    (x.grantee = c.relowner) AS is_owner
  FROM tables t
  JOIN pg_class c ON c.oid = to_regclass('public.' || t.name)
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
  LEFT JOIN pg_roles r ON r.oid = x.grantee
),
classified AS (
  SELECT
    table_name,
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
checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'dispatcher stub/function present',
         (to_regprocedure('public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'three detail tables present',
         (
           (SELECT count(*) FROM tables t WHERE to_regclass('public.' || t.name) IS NOT NULL) = 3
         )
  UNION ALL SELECT 'CHECK_03', 'no unexpected ACL grantee on three detail tables',
         (
           NOT EXISTS (
             SELECT 1 FROM classified c WHERE c.classification = 'unexpected'
           )
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH tables(name) AS (
        VALUES
          ('enrollment_suspension_details'),
          ('transfer_request_details'),
          ('extra_chance_details')
      ),
      acl_rows AS (
        SELECT
          CASE
            WHEN x.grantee = 0 THEN 'PUBLIC'
            ELSE coalesce(r.rolname, x.grantee::text)
          END AS grantee_name,
          x.privilege_type,
          x.is_grantable,
          (x.grantee = c.relowner) AS is_owner
        FROM tables t
        JOIN pg_class c ON c.oid = to_regclass('public.' || t.name)
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
        LEFT JOIN pg_roles r ON r.oid = x.grantee
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
        SELECT (to_regprocedure('public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])') IS NOT NULL)
        UNION ALL SELECT (
          (SELECT count(*) FROM tables t WHERE to_regclass('public.' || t.name) IS NOT NULL) = 3
        )
        UNION ALL SELECT (
          NOT EXISTS (SELECT 1 FROM classified c WHERE c.classification = 'unexpected')
        )
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_14_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
