-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- operator-role/01-preflight.sql
--
-- Fail-closed preflight:
--   1. PostgreSQL 17+ required.
--   2. b1_matrix_operator MUST be ABSENT. If present for any reason -> HOLD.
--   3. b1_matrix_observer MUST be ABSENT.
--   4. No unexpected operator-owned objects in pg_class, pg_proc, pg_namespace,
--      or pg_type.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_version_num int;
  v_role_exists boolean;
  v_observer_exists boolean;
  v_owner_count int;
BEGIN
  SHOW server_version_num INTO v_version_num;
  IF v_version_num < 170000 THEN
    RAISE EXCEPTION 'OPERATOR_PREFLIGHT_FAIL: PostgreSQL 17+ required, found %', v_version_num;
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_operator') INTO v_role_exists;
  IF v_role_exists THEN
    RAISE EXCEPTION 'HOLD_OPERATOR_ROLE_ALREADY_EXISTS: b1_matrix_operator is present before provisioning';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_observer') INTO v_observer_exists;
  IF v_observer_exists THEN
    RAISE EXCEPTION 'HOLD_OBSERVER_ROLE_ALREADY_EXISTS: b1_matrix_observer is present before provisioning';
  END IF;

  SELECT count(*) INTO v_owner_count
    FROM (
      SELECT c.relowner FROM pg_class c WHERE c.relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('b1_matrix_operator','b1_matrix_observer'))
      UNION ALL
      SELECT p.proowner FROM pg_proc p WHERE p.proowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('b1_matrix_operator','b1_matrix_observer'))
      UNION ALL
      SELECT n.nspowner FROM pg_namespace n WHERE n.nspowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('b1_matrix_operator','b1_matrix_observer'))
      UNION ALL
      SELECT t.typowner FROM pg_type t WHERE t.typowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('b1_matrix_operator','b1_matrix_observer'))
    ) owners;
  IF v_owner_count > 0 THEN
    RAISE EXCEPTION 'HOLD_UNEXPECTED_OPERATOR_OWNERSHIP: % objects owned by operator/observer', v_owner_count;
  END IF;

  RAISE NOTICE 'OPERATOR_PREFLIGHT_PASS: operator and observer roles absent, no ownership residue';
END $$;
