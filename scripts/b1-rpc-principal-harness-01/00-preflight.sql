-- ============================================================================
-- G1–G4 + G8 — OPERATOR SESSION FAIL-CLOSED PREFLIGHT
-- PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-PACKAGE-CODEX-COMPREHENSIVE-HARDENING-03
--
-- READ-ONLY. No RPC action, no DDL, no GRANT, no ALTER ROLE, no write.
-- Every assertion below must pass. The first failure raises and, with
-- ON_ERROR_STOP=1, aborts the whole run BEFORE the first negative case.
--
-- Required psql variables:
--   expected_ref        project ref that must appear in the connected target
--   probe_sub           uuid used only to prove auth.uid() plumbing
--   migration_version   exact schema_migrations version of Migration 29
--   fn_graph_md5        pinned aggregate md5 of the allowlisted function graph
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL idle_in_transaction_session_timeout = '180s';

-- ============================================================================
-- 1. clean session + approved target ref
-- ============================================================================
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
BEGIN
  IF :'expected_ref' <> 'wpmicqriltrowwonknox' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_PRODUCTION_REF_MISMATCH: %', :'expected_ref';
  END IF;
END $$;

-- ============================================================================
-- 2. session_user contract — runs BEFORE any SET ROLE
--    not a forbidden identity, resolvable, not SUPERUSER, not BYPASSRLS
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

-- ============================================================================
-- 3. G3 — OPERATOR PRIVILEGE AND VISIBILITY CONTRACT
--    Explicit fingerprint relation list. The operator must be a pure observer:
--    no ownership (=> no owner RLS bypass), read-only, no write privilege.
-- ============================================================================
CREATE TEMP TABLE b1_fingerprint_relations(relname text PRIMARY KEY, rls_required boolean)
  ON COMMIT DROP;
INSERT INTO b1_fingerprint_relations(relname, rls_required) VALUES
  ('student_requests', true),
  ('student_request_workflow_steps', true),
  ('student_request_workflow_events', true),
  ('request_processing_assignments', true),
  ('student_request_attachment_uploads', true),
  ('student_request_attachments', true),
  ('student_request_fee_assessments', true),
  ('payment_receipts', true),
  ('official_documents', true),
  ('enrollment_certificate_document_details', true),
  ('transfer_request_details', true),
  ('enrollment_suspension_details', true),
  ('absence_excuse_details', true),
  ('extra_chance_details', true),
  ('file_withdrawal_details', true),
  ('student_excused_absences', true),
  ('student_extra_chances', true),
  ('student_academic_status', true),
  ('student_enrollments', true),
  ('notifications', true),
  ('audit_logs', true),
  ('request_types', true);

DO $$
DECLARE
  r record;
  v_missing text[] := '{}';
BEGIN
  -- 3a. every declared relation exists
  FOR r IN SELECT relname FROM b1_fingerprint_relations LOOP
    IF to_regclass('public.' || r.relname) IS NULL THEN
      v_missing := v_missing || r.relname;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FINGERPRINT_RELATION_MISSING: %', v_missing;
  END IF;

  -- 3b. session_user owns none of them (ownership implies implicit RLS bypass)
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN b1_fingerprint_relations f ON f.relname = c.relname
    WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = session_user
  LOOP
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_OPERATOR_OWNS_SCOPE_RELATION: %', r.relname;
  END LOOP;

  -- 3c. read-only: SELECT everywhere, and no write privilege anywhere
  FOR r IN SELECT relname FROM b1_fingerprint_relations LOOP
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

  -- 3d. RLS is enabled where the contract requires it
  FOR r IN
    SELECT f.relname FROM b1_fingerprint_relations f
    JOIN pg_class c ON c.relname = f.relname
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE f.rls_required AND NOT c.relrowsecurity
  LOOP
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_RLS_DISABLED_ON_SCOPE_RELATION: %', r.relname;
  END LOOP;

  -- 3e. every RLS-required relation actually carries at least one policy
  FOR r IN
    SELECT f.relname FROM b1_fingerprint_relations f
    WHERE f.rls_required
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = f.relname)
  LOOP
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_NO_POLICY_ON_SCOPE_RELATION: %', r.relname;
  END LOOP;
END $$;

-- 3f. observer visibility must be COMPLETE, not partial: the operator session
--     must actually see every row the fingerprint depends on.
DO $$
DECLARE
  v_requests int;
  v_steps    int;
  v_protected int;
BEGIN
  SELECT count(*) INTO v_requests FROM public.student_requests
  WHERE request_number IN (
    'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
    'SR-20260727-88D885F0','SR-20260727-695EC35B');
  IF v_requests <> 5 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: student_requests visible=%', v_requests;
  END IF;

  SELECT count(*) INTO v_steps
  FROM public.student_request_workflow_steps w
  JOIN public.student_requests r ON r.id = w.student_request_id
  WHERE r.request_number IN (
    'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
    'SR-20260727-88D885F0','SR-20260727-695EC35B');
  IF v_steps < 24 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: workflow steps visible=%', v_steps;
  END IF;

  SELECT count(*) INTO v_protected FROM public.student_requests
  WHERE request_number IN (
    'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8');
  IF v_protected <> 3 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: protected records visible=%', v_protected;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_processing_assignments a LIMIT 1
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN: request_processing_assignments empty/invisible';
  END IF;
END $$;

-- ============================================================================
-- 4. G4 — authenticated / anon principal equivalence
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
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_SET_ROLE_AUTHENTICATED_FAILED: current_user=%', current_user;
  END IF;
  IF current_setting('role', true) <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ROLE_GUC_MISMATCH: %', current_setting('role', true);
  END IF;
  IF current_setting('row_security', true) <> 'on' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ROW_SECURITY_OFF';
  END IF;
END $$;

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

-- anon principal must be reachable and must resolve to a NULL subject
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
BEGIN
  IF current_user <> 'anon' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_SET_ROLE_ANON_FAILED: current_user=%', current_user;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ANON_AUTH_UID_NOT_NULL: %', auth.uid();
  END IF;
  IF auth.role() <> 'anon' THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_ANON_AUTH_ROLE_MISMATCH: %', auth.role();
  END IF;
END $$;
SELECT set_config('request.jwt.claims', NULL, true);
RESET ROLE;

-- ============================================================================
-- 5. G2B — CATALOG TARGET ATTESTATION
-- ============================================================================
DO $$
DECLARE
  v_n int;
  v_name text;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
  WHERE version = :'migration_version';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_COUNT_% version=%', v_n, :'migration_version';
  END IF;

  SELECT name INTO v_name FROM supabase_migrations.schema_migrations
  WHERE version = :'migration_version';
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_NAME_MISSING';
  END IF;
END $$;

-- the six Migration-29 functions, by exact name
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'assert_b1_runtime_step_assignee_effective',
    'assert_b1_runtime_step_row_assignee_effective',
    'b1_assignment_identity_lock_key',
    'b1_lock_assignment_identity_boundary',
    'b1_lock_assignment_identity_stmt',
    'guard_b1_runtime_step_activation'];
  v_found text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT p.proname ORDER BY p.proname), '{}')
    INTO v_found
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY(v_expected);
  IF v_found IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_expected) x) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_FUNCTION_SET_DRIFT: %', v_found;
  END IF;
END $$;

-- the eight Migration-29 triggers, by exact name
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'trg_b1_lock_faculty_profile_identity_stmt',
    'trg_b1_lock_position_assignment_stmt',
    'trg_b1_lock_processing_assignment_stmt',
    'trg_b1_lock_runtime_step_identity_stmt',
    'trg_b1_lock_staff_profile_identity_stmt',
    'trg_b1_lock_transfer_department_scope_stmt',
    'trg_guard_b1_runtime_step_activation',
    'trg_guard_b1_runtime_step_activation_insert'];
  v_found text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT t.tgname ORDER BY t.tgname), '{}')
    INTO v_found
  FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname = ANY(v_expected);
  IF v_found IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_expected) x) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT: %', v_found;
  END IF;
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

-- the five TEST_ONLY requests exist
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
END $$;

-- no fee assessments on the two payment-bearing test requests
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.student_request_fee_assessments f
  JOIN public.student_requests r ON r.id = f.request_id
  WHERE r.request_number IN ('SR-20260727-3C550070','SR-20260727-88D885F0');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'B1_PREFLIGHT_UNEXPECTED_FEE_ASSESSMENTS_%', v_n;
  END IF;
END $$;

-- ============================================================================
-- 6. G8 — EXTERNAL SIDE-EFFECT PINNING / FUNCTION GRAPH ATTESTATION
--    The allowlist is the exact set of functions the two RPC entry points may
--    reach. Their definitions must contain no external-call primitive and the
--    aggregate definition hash must equal the reviewed, pinned value.
-- ============================================================================
CREATE TEMP TABLE b1_function_allowlist(proname text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO b1_function_allowlist(proname) VALUES
  ('act_on_b1_student_request_step_atomic'),
  ('record_external_university_payment_confirmation'),
  ('can_current_user_act_on_step'),
  ('current_user_has_exact_processing_binding'),
  ('current_user_matches_transfer_department_scope'),
  ('workflow_runtime_predecessors_satisfied'),
  ('workflow_action_result_matches'),
  ('user_matches_workflow_runtime_step'),
  ('assert_b1_runtime_step_assignee_effective'),
  ('assert_b1_runtime_step_row_assignee_effective'),
  ('b1_assignment_identity_lock_key'),
  ('b1_lock_assignment_identity_boundary'),
  ('b1_lock_assignment_identity_stmt'),
  ('guard_b1_runtime_step_activation');

DO $$
DECLARE
  r record;
  v_missing text[] := '{}';
  v_def text;
BEGIN
  FOR r IN SELECT proname FROM b1_function_allowlist LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = r.proname
    ) THEN
      v_missing := v_missing || r.proname;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FUNCTION_GRAPH_MISSING: %', v_missing;
  END IF;

  -- no external side-effect primitive anywhere in the allowlisted graph
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN b1_function_allowlist a ON a.proname = p.proname
    WHERE n.nspname = 'public'
  LOOP
    v_def := lower(pg_get_functiondef(r.oid));
    IF v_def ~ '(pg_net\.|net\.http_|\bdblink\b|\bhttp_post\b|\bhttp_get\b|\blo_export\b|\blo_import\b|\bcopy\s+.*\bprogram\b)' THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_EXTERNAL_SIDE_EFFECT_IN_FUNCTION: %', r.proname;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE v_hash text;
BEGIN
  SELECT md5(string_agg(md5(pg_get_functiondef(p.oid)), '|' ORDER BY p.proname, p.oid))
    INTO v_hash
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN b1_function_allowlist a ON a.proname = p.proname
  WHERE n.nspname = 'public';

  RAISE NOTICE 'B1_FUNCTION_GRAPH_MD5=%', v_hash;

  IF :'fn_graph_md5' = 'UNPINNED' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FUNCTION_GRAPH_UNPINNED (observed %)', v_hash;
  END IF;
  IF v_hash IS DISTINCT FROM :'fn_graph_md5' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: B1_PREFLIGHT_FUNCTION_GRAPH_DRIFT';
  END IF;
END $$;

SELECT 'B1_OPERATOR_PREFLIGHT_PASS' AS verdict;

ROLLBACK;
