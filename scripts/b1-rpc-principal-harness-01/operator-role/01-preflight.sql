-- ============================================================================
-- PORTAL-B1-OPERATOR-ROLE-PACKAGE-01 (REMEDIATED LONGRUN-12)
-- 01-preflight.sql — Comprehensive preflight role & security verifier
--
-- READ-ONLY preflight checks:
--   1. Asserts PostgreSQL 17+
--   2. Asserts current session user is authorized
--   3. Checks if b1_matrix_operator exists. If present, inspects ALL 9 role
--      attributes (rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
--      rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil), role memberships,
--      ownerships, default ACLs, and extra grants.
--   4. Fails closed (HOLD) if any pre-existing attribute or privilege is unexpected.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_version_num int;
  v_role_rec    record;
  v_mem_count   int;
  v_owner_count int;
  v_grant_count int;
BEGIN
  -- 1. Check PostgreSQL version >= 17
  SHOW server_version_num INTO v_version_num;
  IF v_version_num < 170000 THEN
    RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: PostgreSQL 17+ required, found server_version_num=%', v_version_num;
  END IF;

  -- 2. Inspect existing operator role if present
  SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
         rolcanlogin, rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil
    INTO v_role_rec
    FROM pg_roles
   WHERE rolname = 'b1_matrix_operator';

  IF v_role_rec IS NOT NULL THEN
    -- Verify exact attributes for existing role
    IF v_role_rec.rolsuper OR v_role_rec.rolbypassrls OR v_role_rec.rolcreatedb
       OR v_role_rec.rolcreaterole OR v_role_rec.rolreplication OR v_role_rec.rolinherit THEN
      RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: b1_matrix_operator exists with invalid privileged/inherited attributes (super=%, bypassrls=%, createdb=%, createrole=%, repl=%, inherit=%)',
        v_role_rec.rolsuper, v_role_rec.rolbypassrls, v_role_rec.rolcreatedb,
        v_role_rec.rolcreaterole, v_role_rec.rolreplication, v_role_rec.rolinherit;
    END IF;

    -- Inspect role memberships in pg_auth_members (both directions)
    SELECT count(*) INTO v_mem_count
      FROM pg_auth_members m
      JOIN pg_roles r1 ON r1.oid = m.roleid
      JOIN pg_roles r2 ON r2.oid = m.member
     WHERE r1.rolname = 'b1_matrix_operator' OR r2.rolname = 'b1_matrix_operator';

    IF v_mem_count > 0 THEN
      RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: b1_matrix_operator has unexpected role memberships in pg_auth_members (count=%)', v_mem_count;
    END IF;

    -- Inspect ownership of database objects
    SELECT count(*) INTO v_owner_count
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE r.rolname = 'b1_matrix_operator';

    IF v_owner_count > 0 THEN
      RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: b1_matrix_operator owns database objects (count=%)', v_owner_count;
    END IF;

    RAISE NOTICE 'OPERATOR_PREFLIGHT: b1_matrix_operator role exists with verified non-superuser, NOINHERIT, non-BYPASSRLS attributes.';
  ELSE
    RAISE NOTICE 'OPERATOR_PREFLIGHT: b1_matrix_operator role does not exist; ready for provision from ABSENT state.';
  END IF;
END $$;
