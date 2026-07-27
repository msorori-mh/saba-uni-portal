-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 14 / POST_VERIFIER
-- Draft: REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Proves primitive installed and (when invoked) three tables have final ACL.
-- Note: SEQ14 installs the function only; cutover invoke is SEQ18.
-- This verifier proves function ACL + source contract that sandbox_exec is
-- revoked inside the loop when the role exists.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'apply_b1_detail_rpc_write_boundaries present',
         (to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'authenticated cannot EXECUTE cutover primitive',
         (NOT has_function_privilege('authenticated', 'public.apply_b1_detail_rpc_write_boundaries()', 'EXECUTE'))
  UNION ALL SELECT 'CHECK_03', 'service_role cannot EXECUTE cutover primitive',
         (NOT has_function_privilege('service_role', 'public.apply_b1_detail_rpc_write_boundaries()', 'EXECUTE'))
  UNION ALL SELECT 'CHECK_04', 'function body revokes sandbox_exec when role exists',
         (
           position(
             'REVOKE ALL ON TABLE public.%I FROM sandbox_exec'
             in (
               SELECT prosrc FROM pg_proc
               WHERE oid = 'public.apply_b1_detail_rpc_write_boundaries()'::regprocedure
             )
           ) > 0
         )
  UNION ALL SELECT 'CHECK_05', 'final ACL allowlist excludes sandbox_exec',
         (
           position(
             'rolnameIN(''authenticated'',''service_role'')'
             in replace(
               (SELECT prosrc FROM pg_proc
                 WHERE oid = 'public.apply_b1_detail_rpc_write_boundaries()'::regprocedure),
               ' ',
               ''
             )
           ) > 0
           AND position(
             'rolnameIN(''authenticated'',''service_role'',''sandbox_exec'')'
             in replace(
               (SELECT prosrc FROM pg_proc
                 WHERE oid = 'public.apply_b1_detail_rpc_write_boundaries()'::regprocedure),
               ' ',
               ''
             )
           ) = 0
         )
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH body AS (
        SELECT replace(prosrc, ' ', '') AS compact
        FROM pg_proc
        WHERE oid = 'public.apply_b1_detail_rpc_write_boundaries()'::regprocedure
      ),
      checks(ok) AS (
        SELECT (to_regprocedure('public.apply_b1_detail_rpc_write_boundaries()') IS NOT NULL)
        UNION ALL SELECT (
          NOT has_function_privilege('authenticated', 'public.apply_b1_detail_rpc_write_boundaries()', 'EXECUTE')
        )
        UNION ALL SELECT (
          NOT has_function_privilege('service_role', 'public.apply_b1_detail_rpc_write_boundaries()', 'EXECUTE')
        )
        UNION ALL SELECT (
          position(
            'REVOKE ALL ON TABLE public.%I FROM sandbox_exec'
            in (
              SELECT prosrc FROM pg_proc
              WHERE oid = 'public.apply_b1_detail_rpc_write_boundaries()'::regprocedure
            )
          ) > 0
        )
        UNION ALL SELECT (
          position('rolnameIN(''authenticated'',''service_role'')' in (SELECT compact FROM body)) > 0
          AND position('rolnameIN(''authenticated'',''service_role'',''sandbox_exec'')' in (SELECT compact FROM body)) = 0
        )
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_14_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
