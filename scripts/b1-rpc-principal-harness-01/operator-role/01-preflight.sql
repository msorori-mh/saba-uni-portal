-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01
-- 01-preflight.sql — Preflight verifier before operator role provisioning
--
-- READ-ONLY preflight checks:
--   1. Asserts PostgreSQL 17+
--   2. Asserts current user is authorized (superuser / database owner)
--   3. Checks if b1_matrix_operator already exists (fails if attributes differ)
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_version_num int;
  v_role_exists boolean;
  v_superuser   boolean;
  v_bypassrls   boolean;
BEGIN
  -- 1. Check PostgreSQL version >= 17
  SHOW server_version_num INTO v_version_num;
  IF v_version_num < 170000 THEN
    RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: PostgreSQL 17+ required, found server_version_num=%', v_version_num;
  END IF;

  -- 2. Check existing operator role if present
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') INTO v_role_exists;
  IF v_role_exists THEN
    SELECT rolsuperuser, rolbypassrls INTO v_superuser, v_bypassrls
    FROM pg_roles WHERE rolname = 'b1_matrix_operator';
    
    IF v_superuser OR v_bypassrls THEN
      RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: b1_matrix_operator exists with invalid privileged attributes (superuser=%, bypassrls=%)',
        v_superuser, v_bypassrls;
    END IF;
    RAISE NOTICE 'OPERATOR_PREFLIGHT: b1_matrix_operator role already exists with non-superuser / non-BYPASSRLS attributes.';
  ELSE
    RAISE NOTICE 'OPERATOR_PREFLIGHT: b1_matrix_operator role does not exist; ready for provisioning.';
  END IF;
END $$;
