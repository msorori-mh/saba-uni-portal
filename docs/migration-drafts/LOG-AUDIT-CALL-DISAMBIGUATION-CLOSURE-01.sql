-- DRAFT ONLY — NOT APPLIED — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
-- LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01
--
-- Closure of the log_audit overload-ambiguity class at the database level.
--
-- Production currently hosts BOTH overloads (per source recon of
-- supabase/migrations at main 45148e09):
--   public.log_audit(text, uuid, text, jsonb, jsonb, text)          -- LEGACY 6-arg
--     first defined 20260601013349 (Phase 6A); args 4-6 DEFAULT NULL;
--     granted to authenticated+service_role, then REVOKED from
--     anon, public, authenticated in 20260611211954 (server-only today).
--   public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid)    -- CANONICAL 7-arg
--     first defined 20260621022558 (SR-A1/A2/B2), re-asserted
--     20260624140000; args 4-7 DEFAULT NULL; NO grant ever issued ->
--     default PUBLIC EXECUTE persists (client-callable today).
-- Because both carry trailing DEFAULTs, every uncast positional call with
-- 3-6 arguments matches BOTH overloads and raises ambiguous_function
-- (SQLSTATE 42725) TODAY. 28 live call sites at head are in this failure
-- class (cancel_official_document, issue_official_document,
-- act_on_student_request_step skip branch, finance/schedule/org triggers,
-- check_and_record_rate_limit, ...), plus 2 PostgREST callers passing the
-- 6 legacy named keys (PGRST203 class).
--
-- DECISION: keep the canonical 7-arg overload and DROP the legacy 6-arg
-- overload, then align EXECUTE privileges to server-only.
-- Safety invariant: nothing that works today can break, because every call
-- form that the 6-arg overload could resolve is already failing today with
-- 42725. After the DROP, those same uncast 3-6-arg calls resolve to the
-- 7-arg overload through its DEFAULTed 7th parameter, preserving audit
-- semantics (both bodies insert one row into public.audit_logs; the 6-arg
-- body used auth.uid(), the 7-arg body uses COALESCE(_actor_user_id,
-- auth.uid()), identical when _actor_user_id is NULL). No historical
-- audit_logs row is touched; the table and its RLS are unchanged.
--
-- RELATIONSHIP TO docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql:
-- this draft SUPERSEDES/EXTENDS it. REQUEST-B1 remediates exactly one
-- hotspot (cancel_official_document) by rewriting the caller to the casted
-- 7-arg contract; this closure removes the ambiguity for ALL call sites at
-- once by removing the legacy overload itself. REQUEST-B1's caller rewrite
-- remains valid and complementary after this closure (casted 7-arg calls
-- keep working unchanged). ORDERING: REQUEST-B1's preflight hard-requires
-- BOTH overloads (B1_LOG_AUDIT_SIX_ARG_MISSING), so this closure must be
-- applied AFTER REQUEST-B1 (coordinated B1 apply order #2). Applying this
-- closure first would make REQUEST-B1 refuse to run; that ordering
-- constraint is a documented follow-up (relax REQUEST-B1's six-arg guard
-- once this closure is applied).
--
-- This draft is forward-only and idempotent-as-possible:
--   * re-running after a successful apply is a verified no-op (preflight
--     accepts the post-state: only the canonical 7-arg overload present);
--   * it aborts loudly, changing nothing, on any unexpected schema state;
--   * it does NOT re-create any overload and does NOT touch audit data.
--
-- Grants end state for the surviving canonical overload (server-only,
-- matching the security intent of 20260611211954 and 20260618052922):
--   * REVOKE EXECUTE FROM PUBLIC, anon, authenticated  (no client EXECUTE)
--   * GRANT EXECUTE TO service_role                    (preserve the one
--     intended surviving grant from the 6-arg grant history)
--   * no new client EXECUTE is granted to any role.

BEGIN;

-- =========================================================
-- 1) PREFLIGHT — verify exact expected schema, else abort.
-- =========================================================
DO $$
DECLARE
  v_six regprocedure;
  v_seven regprocedure;
  v_overloads integer;
  v_seven_defaults integer;
  v_seven_secdef boolean;
  v_seven_rettype regtype;
  v_six_defaults integer;
  v_six_secdef boolean;
  v_col_matches integer;
  v_notnull_matches integer;
BEGIN
  v_six   := to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text)');
  v_seven := to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)');

  -- The canonical 7-arg overload must exist with the exact expected signature.
  IF v_seven IS NULL THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_SEVEN_ARG_MISSING: canonical overload public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid) not found; aborting without changes';
  END IF;

  -- Only the two known overloads may exist (pre-state), or only the
  -- canonical one (post-state of a previous run -> idempotent no-op).
  SELECT count(*) INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'log_audit';

  IF v_six IS NOT NULL AND v_overloads <> 2 THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_UNEXPECTED_OVERLOAD_COUNT_%: expected exactly the legacy 6-arg and canonical 7-arg overloads; aborting without changes', v_overloads;
  END IF;
  IF v_six IS NULL AND v_overloads <> 1 THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_UNEXPECTED_OVERLOAD_COUNT_%: legacy 6-arg already absent but overload count differs from exactly one canonical 7-arg; aborting without changes', v_overloads;
  END IF;

  -- The canonical overload must keep its expected shape: 4 trailing
  -- DEFAULTs (args 4-7), RETURNS void, SECURITY DEFINER.
  SELECT p.pronargdefaults, p.prosecdef, p.prorettype
    INTO v_seven_defaults, v_seven_secdef, v_seven_rettype
  FROM pg_proc p
  WHERE p.oid = v_seven::oid;
  IF v_seven_defaults <> 4 OR v_seven_rettype <> 'void'::regtype OR NOT v_seven_secdef THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_SEVEN_ARG_SHAPE_UNEXPECTED: expected 4 defaults, RETURNS void, SECURITY DEFINER (got defaults=%, secdef=%); aborting without changes', v_seven_defaults, v_seven_secdef;
  END IF;

  -- If the legacy 6-arg overload is present, it must match its expected
  -- shape before we are allowed to drop it: 3 trailing DEFAULTs (args
  -- 4-6), SECURITY DEFINER.
  IF v_six IS NOT NULL THEN
    SELECT p.pronargdefaults, p.prosecdef
      INTO v_six_defaults, v_six_secdef
    FROM pg_proc p
    WHERE p.oid = v_six::oid;
    IF v_six_defaults <> 3 OR NOT v_six_secdef THEN
      RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_SIX_ARG_SHAPE_UNEXPECTED: expected 3 defaults and SECURITY DEFINER on the legacy overload (got defaults=%, secdef=%); aborting without changes', v_six_defaults, v_six_secdef;
    END IF;
  END IF;

  -- public.audit_logs must have the exact 12-column shape introduced by
  -- 20260601013349 (this draft never rewrites audit data; it must not run
  -- against a drifted table).
  SELECT count(*) INTO v_col_matches
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'audit_logs'
    AND (c.column_name, c.data_type) IN (
      ('id', 'uuid'),
      ('created_at', 'timestamp with time zone'),
      ('actor_user_id', 'uuid'),
      ('actor_role', 'text'),
      ('entity_type', 'text'),
      ('entity_id', 'uuid'),
      ('action_type', 'text'),
      ('old_values', 'jsonb'),
      ('new_values', 'jsonb'),
      ('notes', 'text'),
      ('ip_address', 'text'),
      ('user_agent', 'text')
    );
  SELECT count(*) INTO v_notnull_matches
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'audit_logs'
    AND c.is_nullable = 'NO'
    AND c.column_name IN ('id', 'created_at', 'entity_type', 'action_type');
  IF v_col_matches <> 12 OR v_notnull_matches <> 4 THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_AUDIT_LOGS_SHAPE_MISMATCH: expected the 12-column public.audit_logs shape from 20260601013349 (columns=%, notnull=%); aborting without changes', v_col_matches, v_notnull_matches;
  END IF;

  -- Target roles for the grants alignment must exist.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_ROLE_MISSING: roles anon/authenticated/service_role must exist; aborting without changes';
  END IF;
END $$;

-- =========================================================
-- 2) REMOVE the legacy overload (root of the 42725 ambiguity).
--    IF EXISTS keeps a re-run a no-op; the explicit signature
--    guarantees only the legacy 6-arg form can ever be dropped.
-- =========================================================
DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text);

-- =========================================================
-- 3) ALIGN grants on the canonical overload to server-only.
--    No new client EXECUTE is granted anywhere by this draft.
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) TO service_role;

COMMENT ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid) IS
  'LOGAUDIT_CLOSURE_01=1; canonical single overload; legacy 6-arg overload dropped; EXECUTE server-only (service_role + owner)';

-- =========================================================
-- 4) POSTFLIGHT — prove the closed end state inside the same
--    transaction, or roll everything back.
-- =========================================================
DO $$
DECLARE
  v_overloads integer;
  v_acl aclitem[];
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'log_audit';
  IF v_overloads <> 1
     OR to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_OVERLOAD_STATE_%: expected exactly one canonical 7-arg overload', v_overloads;
  END IF;

  SELECT p.proacl INTO v_acl
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')::oid;

  -- No PUBLIC / anon / authenticated EXECUTE may remain (proacl NULL here
  -- would mean the default PUBLIC grant survived, which must not happen).
  IF v_acl IS NULL OR EXISTS (
    SELECT 1
    FROM aclexplode(v_acl) a
    WHERE a.privilege_type = 'EXECUTE'
      AND (a.grantee = 0
           OR a.grantee IN (SELECT r.oid FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')))
  ) THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_ACL_CLIENT_EXECUTE: PUBLIC/anon/authenticated EXECUTE still present on the canonical overload';
  END IF;

  -- service_role must be able to execute (server-only channel).
  IF NOT has_function_privilege('service_role', 'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_ACL_SERVICE_ROLE_MISSING: service_role EXECUTE missing on the canonical overload';
  END IF;

  -- Belt-and-suspenders: anon and authenticated must NOT be able to execute.
  IF has_function_privilege('anon', 'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LOGAUDIT_CLOSURE_01_POST_ACL_CLIENT_PRIVILEGE: anon/authenticated can still execute the canonical overload';
  END IF;
END $$;

COMMIT;
