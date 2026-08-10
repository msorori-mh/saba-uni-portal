-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-16
-- observer/03-observer-acl-verifier.sql
--
-- Independent Observer ACL Verifier.
-- Probes all b1_observer_* functions for forbidden EXECUTE grants.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_leaks int;
BEGIN
  SELECT count(*) INTO v_leaks
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname LIKE 'b1_observer_%'
     AND (
       has_function_privilege('public', p.oid, 'EXECUTE') OR
       has_function_privilege('anon', p.oid, 'EXECUTE') OR
       has_function_privilege('authenticated', p.oid, 'EXECUTE') OR
       has_function_privilege('service_role', p.oid, 'EXECUTE')
     );

  IF v_leaks > 0 THEN
    RAISE EXCEPTION 'OBSERVER_ACL_VERIFIER_FAIL: % observer functions retain forbidden EXECUTE access', v_leaks;
  END IF;

  RAISE NOTICE 'OBSERVER_ACL_VERIFIER_PASS: 0 observer functions leak EXECUTE to public/anon/authenticated/service_role';
END $$;
