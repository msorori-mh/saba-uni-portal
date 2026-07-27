-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 10 / POST_VERIFIER
-- Draft: REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
--
-- Final ACL contract:
--   owner: owner privileges
--   authenticated: SELECT only
--   service_role: SELECT only
--   PUBLIC / anon / sandbox_exec: zero privileges
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'authenticated SELECT only (no INSERT)',
         (
           has_table_privilege('authenticated', 'public.absence_excuse_details', 'SELECT')
           AND NOT has_table_privilege('authenticated', 'public.absence_excuse_details', 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.absence_excuse_details', 'UPDATE')
           AND NOT has_table_privilege('authenticated', 'public.absence_excuse_details', 'DELETE')
         )
  UNION ALL SELECT 'CHECK_02', 'service_role SELECT only (no INSERT)',
         (
           has_table_privilege('service_role', 'public.absence_excuse_details', 'SELECT')
           AND NOT has_table_privilege('service_role', 'public.absence_excuse_details', 'INSERT')
           AND NOT has_table_privilege('service_role', 'public.absence_excuse_details', 'UPDATE')
           AND NOT has_table_privilege('service_role', 'public.absence_excuse_details', 'DELETE')
         )
  UNION ALL SELECT 'CHECK_03', 'anon has zero table privileges',
         (
           NOT has_table_privilege('anon', 'public.absence_excuse_details', 'SELECT')
           AND NOT has_table_privilege('anon', 'public.absence_excuse_details', 'INSERT')
           AND NOT has_table_privilege('anon', 'public.absence_excuse_details', 'UPDATE')
           AND NOT has_table_privilege('anon', 'public.absence_excuse_details', 'DELETE')
         )
  UNION ALL SELECT 'CHECK_04', 'sandbox_exec absent or has zero table privileges',
         (
           NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
           OR NOT EXISTS (
             SELECT 1
             FROM pg_class c
             CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
             JOIN pg_roles r ON r.oid = x.grantee
             WHERE c.oid = 'public.absence_excuse_details'::regclass
               AND r.rolname = 'sandbox_exec'
           )
         )
  UNION ALL SELECT 'CHECK_05', 'ACL inventory matches owner + authenticated/service_role SELECT only',
         (
           NOT EXISTS (
             SELECT 1
             FROM pg_class c
             CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
             LEFT JOIN pg_roles r ON r.oid = x.grantee
             WHERE c.oid = 'public.absence_excuse_details'::regclass
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
  UNION ALL SELECT 'CHECK_06', 'policy inventory exact owner SELECT',
         (
           (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'absence_excuse_details') = 1
           AND EXISTS (
             SELECT 1 FROM pg_policies
             WHERE schemaname = 'public'
               AND tablename = 'absence_excuse_details'
               AND policyname = 'absence_excuse_details_owner_select'
               AND cmd = 'SELECT'
               AND permissive = 'PERMISSIVE'
               AND roles = ARRAY['authenticated'::name]
               AND qual = 'is_owner_of_request(auth.uid(), request_id)'
               AND with_check IS NULL
           )
         )
  UNION ALL SELECT 'CHECK_07', 'absence_reason_detail column present nullable text',
         (
           EXISTS (
             SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = 'public.absence_excuse_details'::regclass
               AND a.attname = 'absence_reason_detail'
               AND NOT a.attisdropped
               AND a.atttypid = 'text'::regtype
               AND a.atttypmod = -1
               AND NOT a.attnotnull
           )
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(ok) AS (
        SELECT (
          has_table_privilege('authenticated', 'public.absence_excuse_details', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.absence_excuse_details', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.absence_excuse_details', 'UPDATE')
          AND NOT has_table_privilege('authenticated', 'public.absence_excuse_details', 'DELETE')
        )
        UNION ALL SELECT (
          has_table_privilege('service_role', 'public.absence_excuse_details', 'SELECT')
          AND NOT has_table_privilege('service_role', 'public.absence_excuse_details', 'INSERT')
          AND NOT has_table_privilege('service_role', 'public.absence_excuse_details', 'UPDATE')
          AND NOT has_table_privilege('service_role', 'public.absence_excuse_details', 'DELETE')
        )
        UNION ALL SELECT (
          NOT has_table_privilege('anon', 'public.absence_excuse_details', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.absence_excuse_details', 'INSERT')
          AND NOT has_table_privilege('anon', 'public.absence_excuse_details', 'UPDATE')
          AND NOT has_table_privilege('anon', 'public.absence_excuse_details', 'DELETE')
        )
        UNION ALL SELECT (
          NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
          OR NOT EXISTS (
            SELECT 1
            FROM pg_class c
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
            JOIN pg_roles r ON r.oid = x.grantee
            WHERE c.oid = 'public.absence_excuse_details'::regclass
              AND r.rolname = 'sandbox_exec'
          )
        )
        UNION ALL SELECT (
          NOT EXISTS (
            SELECT 1
            FROM pg_class c
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
            LEFT JOIN pg_roles r ON r.oid = x.grantee
            WHERE c.oid = 'public.absence_excuse_details'::regclass
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
            WHERE schemaname = 'public' AND tablename = 'absence_excuse_details') = 1
          AND EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'absence_excuse_details'
              AND policyname = 'absence_excuse_details_owner_select'
              AND cmd = 'SELECT'
              AND permissive = 'PERMISSIVE'
              AND roles = ARRAY['authenticated'::name]
              AND qual = 'is_owner_of_request(auth.uid(), request_id)'
              AND with_check IS NULL
          )
        )
        UNION ALL SELECT (
          EXISTS (
            SELECT 1 FROM pg_attribute a
            WHERE a.attrelid = 'public.absence_excuse_details'::regclass
              AND a.attname = 'absence_reason_detail'
              AND NOT a.attisdropped
              AND a.atttypid = 'text'::regtype
              AND a.atttypmod = -1
              AND NOT a.attnotnull
          )
        )
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_10_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
