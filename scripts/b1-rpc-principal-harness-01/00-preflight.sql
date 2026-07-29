-- ============================================================================
-- PORTAL-B1-NEGATIVE-RPC-MATRIX-FINAL-EXECUTION-PACKAGE-REMEDIATION-05
-- FAIL-CLOSED OPERATOR PREFLIGHT (G3 / G4 / G5 / G6 / G8)
--
-- READ-ONLY. No RPC action, no DDL on persistent objects, no GRANT, no ALTER
-- ROLE, no write. The only objects created are ON COMMIT DROP temp tables that
-- carry the in-repository pins. The first failure raises and, with
-- ON_ERROR_STOP=1, aborts the whole run BEFORE the first negative case.
--
-- NO expected value is accepted from the command line. Every pin (endpoint,
-- migration version + name, function signatures + definition hashes, trigger
-- contracts, authoritative baseline fingerprint) is inlined offline by
-- render-negative-cases.ts from TARGET-MANIFEST.json into generated/pins.sql.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET LOCAL statement_timeout = '300s';
SET LOCAL idle_in_transaction_session_timeout = '360s';

-- Pins: temp tables b1_pin_scalar / b1_pin_function / b1_pin_trigger /
--       b1_pin_relation, plus b1_observed_fingerprint.
\ir generated/pins.sql

-- ============================================================================
-- 1. clean session
-- ============================================================================
DO $$
DECLARE v_claims text;
BEGIN
  SELECT current_setting('request.jwt.claims', true) INTO v_claims;
  IF v_claims IS NOT NULL AND v_claims <> '' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_DIRTY_JWT_CLAIMS_GUC';
  END IF;
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_NO_DATABASE';
  END IF;
END $$;

-- ============================================================================
-- 2. G3 — target attestation from the pinned manifest ONLY (exact match)
-- ============================================================================
DO $$
DECLARE
  v_ref  text := (SELECT value FROM b1_pin_scalar WHERE key = 'project_ref');
  v_db   text := (SELECT value FROM b1_pin_scalar WHERE key = 'approved_pgdatabase');
  v_user text := (SELECT value FROM b1_pin_scalar WHERE key = 'approved_pguser_regex');
BEGIN
  IF v_ref IS DISTINCT FROM 'wpmicqriltrowwonknox' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_PRODUCTION_REF_MISMATCH: %', v_ref;
  END IF;
  IF current_database() <> v_db THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_DATABASE_MISMATCH: %', current_database();
  END IF;
  IF session_user !~ v_user THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_SESSION_USER_SHAPE_MISMATCH';
  END IF;
END $$;

-- ============================================================================
-- 3. session_user contract — runs BEFORE any SET ROLE
-- ============================================================================
DO $$
DECLARE
  v_super  boolean;
  v_bypass boolean;
BEGIN
  IF session_user IN ('sandbox_exec', 'service_role', 'supabase_admin', 'postgres') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FORBIDDEN_SESSION_USER: %', session_user;
  END IF;

  SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
  FROM pg_roles WHERE rolname = session_user;

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

-- ============================================================================
-- 4. G5 — operator privilege contract over the pinned fingerprint relations
-- ============================================================================
DO $$
DECLARE
  r record;
  v_missing text[] := '{}';
BEGIN
  FOR r IN SELECT relname FROM b1_pin_relation LOOP
    IF to_regclass('public.' || r.relname) IS NULL THEN
      v_missing := v_missing || r.relname;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FINGERPRINT_RELATION_MISSING: %', v_missing;
  END IF;

  -- ownership implies an implicit RLS bypass
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN b1_pin_relation f ON f.relname = c.relname
    WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = session_user
  LOOP
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_OPERATOR_OWNS_SCOPE_RELATION: %', r.relname;
  END LOOP;

  FOR r IN SELECT relname FROM b1_pin_relation LOOP
    IF NOT has_table_privilege(session_user, 'public.' || r.relname, 'SELECT') THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: no SELECT on %', r.relname;
    END IF;
    IF has_table_privilege(session_user, 'public.' || r.relname, 'INSERT')
       OR has_table_privilege(session_user, 'public.' || r.relname, 'UPDATE')
       OR has_table_privilege(session_user, 'public.' || r.relname, 'DELETE')
       OR has_table_privilege(session_user, 'public.' || r.relname, 'TRUNCATE') THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_OPERATOR_HAS_WRITE_PRIVILEGE: %', r.relname;
    END IF;
  END LOOP;

  FOR r IN
    SELECT f.relname FROM b1_pin_relation f
    JOIN pg_class c ON c.relname = f.relname
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE f.rls_required AND NOT c.relrowsecurity
  LOOP
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_RLS_DISABLED_ON_SCOPE_RELATION: %', r.relname;
  END LOOP;

  FOR r IN
    SELECT f.relname FROM b1_pin_relation f
    WHERE f.rls_required
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = f.relname)
  LOOP
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_NO_POLICY_ON_SCOPE_RELATION: %', r.relname;
  END LOOP;
END $$;

-- ============================================================================
-- 5. G6 — row-lock capability probe (FOR SHARE is used by every case)
--    Postgres requires UPDATE/DELETE privilege for row-level locking, which
--    contradicts the pure-observer privilege contract above. This probe makes
--    the contradiction explicit and FAIL-CLOSED: it never grants anything.
-- ============================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  BEGIN
    SELECT r.id INTO v_id FROM public.student_requests r
     WHERE r.request_number = 'SR-20260727-42393846' FOR SHARE;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_ROW_LOCK_CAPABILITY_NOT_PROVEN: the operator role cannot take FOR SHARE on public.student_requests; a DBA must provision a role that can take row share locks while holding no INSERT/UPDATE/DELETE/TRUNCATE, outside this package';
  END;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: locked probe row invisible';
  END IF;
END $$;

-- ============================================================================
-- 6. G5 — AUTHORITATIVE BASELINE: complete-content equality, not row counts
-- ============================================================================
DO $$
DECLARE
  v_status   text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_status');
  v_expected text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_fingerprint');
  v_observed text := (SELECT fingerprint FROM b1_observed_fingerprint);
BEGIN
  IF v_status IS DISTINCT FROM 'PINNED' OR v_expected IS NULL OR v_expected = '' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: authoritative baseline is % (observed %)',
      coalesce(v_status, 'MISSING'), v_observed;
  END IF;
  IF v_observed IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: fingerprint is NULL';
  END IF;
  IF v_observed IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: fingerprint mismatch (rows hidden by RLS or state drift)';
  END IF;
END $$;

-- ============================================================================
-- 7. G4 — authenticated / anon principal equivalence
-- ============================================================================
DO $$
BEGIN
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTHENTICATED_HAS_BYPASSRLS';
  END IF;
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ANON_HAS_BYPASSRLS';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE v_probe text := (SELECT value FROM b1_pin_scalar WHERE key = 'probe_sub');
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_SET_ROLE_AUTHENTICATED_FAILED: current_user=%', current_user;
  END IF;
  IF current_setting('row_security', true) <> 'on' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ROW_SECURITY_OFF';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_probe, 'role', 'authenticated')::text, true);
  IF auth.uid()::text IS DISTINCT FROM v_probe THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTH_UID_MISMATCH: got %', auth.uid();
  END IF;
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_AUTH_ROLE_MISMATCH: %', auth.role();
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF current_user <> 'anon' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_SET_ROLE_ANON_FAILED: current_user=%', current_user;
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ANON_AUTH_UID_NOT_NULL: %', auth.uid();
  END IF;
  IF auth.role() <> 'anon' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ANON_AUTH_ROLE_MISMATCH: %', auth.role();
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;
RESET ROLE;

-- ============================================================================
-- 8. G4 — EXACT MIGRATION CONTRACT (version AND name, not "non-empty")
-- ============================================================================
DO $$
DECLARE
  v_version text := (SELECT value FROM b1_pin_scalar WHERE key = 'migration_version');
  v_name    text := (SELECT value FROM b1_pin_scalar WHERE key = 'migration_name');
  v_n       int;
  v_found   text;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
   WHERE version = v_version;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_COUNT_% version=%', v_n, v_version;
  END IF;

  SELECT name INTO v_found FROM supabase_migrations.schema_migrations
   WHERE version = v_version;
  IF v_found IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_NAME_MISMATCH: got %, want %',
      coalesce(v_found, '<null>'), v_name;
  END IF;
END $$;

-- the six Migration-29 functions, by EXACT signature
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT signature FROM b1_pin_function WHERE migration_29 LOOP
    IF to_regprocedure(r.signature) IS NULL THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_FUNCTION_SET_DRIFT: %', r.signature;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM b1_pin_function WHERE migration_29) <> 6 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_FUNCTION_SET_DRIFT: pin count';
  END IF;
END $$;

-- the eight Migration-29 triggers, by EXACT contract
DO $$
DECLARE
  r         record;
  v_oid     oid;
  v_tgfoid  oid;
  v_tgtype  int;
  v_enabled "char";
  v_cols    text[];
BEGIN
  IF (SELECT count(*) FROM b1_pin_trigger) <> 8 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: pin count';
  END IF;

  FOR r IN SELECT * FROM b1_pin_trigger LOOP
    v_oid := to_regclass(r.table_name);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: table % missing', r.table_name;
    END IF;

    SELECT t.tgfoid, t.tgtype::int, t.tgenabled,
           coalesce((SELECT array_agg(a.attname ORDER BY a.attname)
                       FROM unnest(t.tgattr::int[]) k
                       JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = k), '{}')
      INTO v_tgfoid, v_tgtype, v_enabled, v_cols
      FROM pg_trigger t
     WHERE t.tgrelid = v_oid AND t.tgname = r.tgname AND NOT t.tgisinternal;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: % on % missing',
        r.tgname, r.table_name;
    END IF;
    IF v_tgfoid IS DISTINCT FROM to_regprocedure(r.function_signature)::oid THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: % tgfoid', r.tgname;
    END IF;
    IF v_tgtype IS DISTINCT FROM r.tgtype THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: % tgtype got % want %',
        r.tgname, v_tgtype, r.tgtype;
    END IF;
    IF v_enabled IS DISTINCT FROM r.tgenabled::"char" THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: % tgenabled', r.tgname;
    END IF;
    IF (SELECT array_agg(x ORDER BY x) FROM unnest(v_cols) x) IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM unnest(r.update_columns) x) THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: % UPDATE OF columns %',
        r.tgname, v_cols;
    END IF;
  END LOOP;
END $$;

-- the five services exist and remain hidden from students
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer',
                  'final_chance','file_withdrawal');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_SERVICE_SET_DRIFT_%', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer',
                  'final_chance','file_withdrawal')
     AND student_visible IS TRUE;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_SERVICE_UNEXPECTEDLY_VISIBLE_%', v_n;
  END IF;
END $$;

-- the five TEST_ONLY requests and the three protected certificate requests
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE request_number IN (
     'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
     'SR-20260727-88D885F0','SR-20260727-695EC35B');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_TEST_ONLY_REQUESTS_EXPECTED_5_GOT_%', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE request_number IN (
     'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: protected records visible=%', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_fee_assessments f
    JOIN public.student_requests r ON r.id = f.request_id
   WHERE r.request_number IN ('SR-20260727-3C550070','SR-20260727-88D885F0');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_UNEXPECTED_FEE_ASSESSMENTS_%', v_n;
  END IF;
END $$;

-- ============================================================================
-- 9. G8 — TRANSITIVE FUNCTION GRAPH PINNING
--    (a) every pinned function exists with its exact signature
--    (b) the closure computed FROM THE DATABASE is a subset of the pins
--    (c) no external-call primitive anywhere in the closure
--    (d) normalized definition SHA256 / security / owner / search_path match
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT signature FROM b1_pin_function LOOP
    IF to_regprocedure(r.signature) IS NULL THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: FUNCTION_GRAPH_DRIFT: pinned function missing %', r.signature;
    END IF;
  END LOOP;
END $$;

-- (b) discovered closure ⊆ pinned closure
DO $$
DECLARE
  v_pinned oid[];
  v_seen   oid[] := '{}';
  v_queue  oid[];
  v_cur    oid;
  v_def    text;
  r        record;
BEGIN
  SELECT array_agg(to_regprocedure(signature)::oid) INTO v_pinned FROM b1_pin_function;
  SELECT array_agg(to_regprocedure(signature)::oid) INTO v_queue
    FROM b1_pin_function WHERE entry_point;

  WHILE array_length(v_queue, 1) IS NOT NULL LOOP
    v_cur := v_queue[1];
    v_queue := v_queue[2:];
    CONTINUE WHEN v_cur = ANY(v_seen);
    v_seen := v_seen || v_cur;

    IF NOT (v_cur = ANY(v_pinned)) THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: FUNCTION_GRAPH_DRIFT: unpinned reachable function %',
        v_cur::regprocedure::text;
    END IF;

    v_def := pg_get_functiondef(v_cur);
    FOR r IN
      SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND v_def ~ ('public\.' || p.proname || '\s*\(')
    LOOP
      IF NOT (r.oid = ANY(v_seen)) THEN
        v_queue := v_queue || r.oid;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- (c) + (d)
DO $$
DECLARE
  r        record;
  v_oid    oid;
  v_def    text;
  v_norm   text;
  v_hash   text;
  v_sec    text;
  v_owner  text;
  v_path   text;
  v_tok    record;
BEGIN
  FOR r IN SELECT * FROM b1_pin_function LOOP
    v_oid := to_regprocedure(r.signature)::oid;
    v_def := pg_get_functiondef(v_oid);

    FOR v_tok IN SELECT token FROM b1_pin_forbidden_token LOOP
      IF position(v_tok.token IN lower(v_def)) > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_EXTERNAL_SIDE_EFFECT_IN_FUNCTION: % token %',
          r.signature, v_tok.token;
      END IF;
    END LOOP;

    v_norm := btrim(regexp_replace(v_def, '\s+', ' ', 'g'));
    v_hash := encode(sha256(convert_to(v_norm, 'UTF8')), 'hex');

    SELECT CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
           pg_get_userbyid(p.proowner),
           coalesce((SELECT c FROM unnest(coalesce(p.proconfig, '{}')) c
                      WHERE c LIKE 'search\_path=%'), '')
      INTO v_sec, v_owner, v_path
      FROM pg_proc p WHERE p.oid = v_oid;

    IF r.definition_sha256 IS NULL OR r.definition_sha256 = '' THEN
      RAISE NOTICE 'B1_FUNCTION_PIN % sha256=% security=% owner=% %',
        r.signature, v_hash, v_sec, v_owner, v_path;
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FUNCTION_GRAPH_UNPINNED: %', r.signature;
    END IF;
    IF v_hash IS DISTINCT FROM r.definition_sha256
       OR v_sec IS DISTINCT FROM r.security
       OR v_owner IS DISTINCT FROM r.owner
       OR v_path IS DISTINCT FROM r.search_path THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: FUNCTION_GRAPH_DRIFT: %', r.signature;
    END IF;
  END LOOP;
END $$;

SELECT 'B1_OPERATOR_PREFLIGHT_PASS' AS verdict;

ROLLBACK;
