-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- operator-role/05-effective-grants-verifier.sql
--
-- Machine-readable dump of EXPLICIT grants held by b1_matrix_operator.
-- Grants received indirectly through PUBLIC are NOT listed, so this verifier
-- proves the operator's privilege surface is exactly what the provisioning
-- step granted.
-- ============================================================================
\set ON_ERROR_STOP on

SELECT 'function_execute' AS grant_kind,
       n.nspname AS schema_name,
       p.proname AS object_name,
       pg_get_function_identity_arguments(p.oid) AS object_signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE EXISTS (
  SELECT 1
  FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE a.grantee = 'b1_matrix_operator'::regrole
    AND a.privilege_type = 'EXECUTE'
)
ORDER BY n.nspname, p.proname;

SELECT 'schema_usage' AS grant_kind,
       n.nspname AS schema_name,
       NULL AS object_name,
       NULL AS object_signature
FROM pg_namespace n
WHERE EXISTS (
  SELECT 1
  FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
  WHERE a.grantee = 'b1_matrix_operator'::regrole
    AND a.privilege_type = 'USAGE'
)
ORDER BY n.nspname;

SELECT 'table_select' AS grant_kind,
       n.nspname AS schema_name,
       c.relname AS object_name,
       NULL AS object_signature
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','v','m')
  AND EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE a.grantee = 'b1_matrix_operator'::regrole
      AND a.privilege_type = 'SELECT'
  )
ORDER BY n.nspname, c.relname;
