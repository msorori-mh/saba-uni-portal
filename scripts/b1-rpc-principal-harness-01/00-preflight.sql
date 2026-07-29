-- ============================================================================
-- G1 — OPERATOR SESSION FAIL-CLOSED PREFLIGHT
-- PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-EXECUTION-PACKAGE-01
--
-- READ-ONLY. No RPC action, no DDL, no GRANT, no ALTER ROLE, no write.
-- Every assertion below must pass. The first failure raises and, with
-- ON_ERROR_STOP=1, aborts the whole run BEFORE the first negative case.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '120s';

-- 1. production ref -----------------------------------------------------------
DO $$
DECLARE v_ref text;
BEGIN
  SELECT current_setting('request.jwt.claims', true) INTO v_ref; -- must be unset here
  IF v_ref IS NOT NULL AND v_ref <> '' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_DIRTY_JWT_CLAIMS_GUC';
  END IF;
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_NO_DATABASE';
  END IF;
END $$;

DO $$
DECLARE v_ok boolean;
BEGIN
  -- the Supabase project ref appears in the tenant database identity
  SELECT (:'expected_ref' = 'wpmicqriltrowwonknox') INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_PRODUCTION_REF_MISMATCH: %', :'expected_ref';
  END IF;
END $$;

-- 2. session_user is NOT the sandbox executor, not superuser, not BYPASSRLS ---
DO $$
DECLARE
  v_super  boolean;
  v_bypass boolean;
BEGIN
  IF session_user IN ('sandbox_exec', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FORBIDDEN_SESSION_USER: %', session_user;
  END IF;

  SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
  FROM pg_roles WHERE rolname = session_user;

  -- fail closed: never pass silently when the role row cannot be resolved
  IF NOT FOUND OR v_super IS NULL OR v_bypass IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_SESSION_USER_NOT_FOUND_IN_PG_ROLES: %', session_user;
  END IF;

  IF v_super THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: session_user must not be superuser (B1_PREFLIGHT_SESSION_USER_IS_SUPERUSER: %)', session_user;
  END IF;

  IF v_bypass THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_SESSION_USER_HAS_BYPASSRLS: %', session_user;
  END IF;
END $$;


-- 3-5. SET LOCAL ROLE authenticated must succeed and stick --------------------
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_SET_ROLE_AUTHENTICATED_FAILED: current_user=%', current_user;
  END IF;
  IF current_setting('role', true) <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ROLE_GUC_MISMATCH: %', current_setting('role', true);
  END IF;
END $$;

-- 6-7. RLS is enforced for this principal -------------------------------------
DO $$
BEGIN
  IF current_setting('row_security', true) <> 'on' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ROW_SECURITY_OFF';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTHENTICATED_HAS_BYPASSRLS';
  END IF;
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTHENTICATED_IS_SUPERUSER';
  END IF;
END $$;

-- 8. auth.uid() reflects the injected sub -------------------------------------
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'probe_sub', 'role', 'authenticated')::text,
  true
);

DO $$
BEGIN
  IF auth.uid()::text IS DISTINCT FROM :'probe_sub' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTH_UID_MISMATCH: got %, want %', auth.uid(), :'probe_sub';
  END IF;
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTH_ROLE_MISMATCH: %', auth.role();
  END IF;
END $$;

SELECT set_config('request.jwt.claims', NULL, true);
RESET ROLE;

-- 10. the five TEST_ONLY requests exist, protected records untouched ----------
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.student_requests
  WHERE request_number IN (
    'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
    'SR-20260727-88D885F0','SR-20260727-695EC35B');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_TEST_ONLY_REQUESTS_EXPECTED_5_GOT_%', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.student_requests
  WHERE request_number IN (
    'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_PROTECTED_RECORDS_MISSING';
  END IF;
END $$;

-- 11. no fee assessments on the two payment-bearing test requests -------------
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.student_request_fee_assessments f
  JOIN public.student_requests r ON r.id = f.student_request_id
  WHERE r.request_number IN ('SR-20260727-3C550070','SR-20260727-88D885F0');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_UNEXPECTED_FEE_ASSESSMENTS_%', v_n;
  END IF;
END $$;

-- 12. Migration 29 installed exactly once -------------------------------------
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
  WHERE version LIKE '2026072901451%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_MIGRATION_29_COUNT_%', v_n;
  END IF;
END $$;

SELECT 'B1_OPERATOR_PREFLIGHT_PASS' AS verdict;

ROLLBACK;
