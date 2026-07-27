-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 11 / POST_VERIFIER
-- Draft: REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Final ACL: owner + authenticated/service_role SELECT; PUBLIC/anon/sandbox_exec = none.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.file_withdrawal_details'') IS NOT NULL',
         (to_regclass('public.file_withdrawal_details') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'authenticated SELECT only',
         (
           has_table_privilege('authenticated', 'public.file_withdrawal_details', 'SELECT')
           AND NOT has_table_privilege('authenticated', 'public.file_withdrawal_details', 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.file_withdrawal_details', 'UPDATE')
           AND NOT has_table_privilege('authenticated', 'public.file_withdrawal_details', 'DELETE')
         )
  UNION ALL SELECT 'CHECK_03', 'service_role SELECT only',
         (
           has_table_privilege('service_role', 'public.file_withdrawal_details', 'SELECT')
           AND NOT has_table_privilege('service_role', 'public.file_withdrawal_details', 'INSERT')
           AND NOT has_table_privilege('service_role', 'public.file_withdrawal_details', 'UPDATE')
           AND NOT has_table_privilege('service_role', 'public.file_withdrawal_details', 'DELETE')
         )
  UNION ALL SELECT 'CHECK_04', 'anon has zero privileges',
         (
           NOT has_table_privilege('anon', 'public.file_withdrawal_details', 'SELECT')
           AND NOT has_table_privilege('anon', 'public.file_withdrawal_details', 'INSERT')
         )
  UNION ALL SELECT 'CHECK_05', 'sandbox_exec absent or zero privileges',
         (
           NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
           OR NOT EXISTS (
             SELECT 1
             FROM pg_class c
             CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
             JOIN pg_roles r ON r.oid = x.grantee
             WHERE c.oid = 'public.file_withdrawal_details'::regclass
               AND r.rolname = 'sandbox_exec'
           )
         )
  UNION ALL SELECT 'CHECK_06', 'ACL inventory exact',
         (
           NOT EXISTS (
             SELECT 1
             FROM pg_class c
             CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
             LEFT JOIN pg_roles r ON r.oid = x.grantee
             WHERE c.oid = 'public.file_withdrawal_details'::regclass
               AND NOT (
                 x.grantee = c.relowner
                 OR (
                   r.rolname IN ('authenticated', 'service_role')
                   AND x.privilege_type = 'SELECT'
                   AND NOT x.is_grantable
                 )
               )
           )
         )
  UNION ALL SELECT 'CHECK_07', 'policy inventory exact owner SELECT',
         (
           (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'file_withdrawal_details') = 1
           AND EXISTS (
             SELECT 1 FROM pg_policies
             WHERE schemaname = 'public'
               AND tablename = 'file_withdrawal_details'
               AND policyname = 'file_withdrawal_details_owner_select'
               AND cmd = 'SELECT'
               AND permissive = 'PERMISSIVE'
               AND roles = ARRAY['authenticated'::name]
               AND qual = 'is_owner_of_request(auth.uid(), request_id)'
               AND with_check IS NULL
           )
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(ok) AS (
        SELECT (to_regclass('public.file_withdrawal_details') IS NOT NULL)
        UNION ALL SELECT (
          has_table_privilege('authenticated', 'public.file_withdrawal_details', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.file_withdrawal_details', 'INSERT')
        )
        UNION ALL SELECT (
          has_table_privilege('service_role', 'public.file_withdrawal_details', 'SELECT')
          AND NOT has_table_privilege('service_role', 'public.file_withdrawal_details', 'INSERT')
        )
        UNION ALL SELECT (
          NOT has_table_privilege('anon', 'public.file_withdrawal_details', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.file_withdrawal_details', 'INSERT')
        )
        UNION ALL SELECT (
          NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
          OR NOT EXISTS (
            SELECT 1
            FROM pg_class c
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
            JOIN pg_roles r ON r.oid = x.grantee
            WHERE c.oid = 'public.file_withdrawal_details'::regclass
              AND r.rolname = 'sandbox_exec'
          )
        )
        UNION ALL SELECT (
          NOT EXISTS (
            SELECT 1
            FROM pg_class c
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
            LEFT JOIN pg_roles r ON r.oid = x.grantee
            WHERE c.oid = 'public.file_withdrawal_details'::regclass
              AND NOT (
                x.grantee = c.relowner
                OR (
                  r.rolname IN ('authenticated', 'service_role')
                  AND x.privilege_type = 'SELECT'
                  AND NOT x.is_grantable
                )
              )
          )
        )
        UNION ALL SELECT (
          (SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'file_withdrawal_details') = 1
          AND EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'file_withdrawal_details'
              AND policyname = 'file_withdrawal_details_owner_select'
              AND cmd = 'SELECT'
          )
        )
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_11_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
