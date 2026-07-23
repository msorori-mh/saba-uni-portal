-- LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01 — post-draft verifier (harness)
--
-- Runs AFTER the draft (the runner applies the draft TWICE before this
-- script: second application proves idempotent re-run). Fail-closed: every
-- assertion raises on violation. Asserts:
--   (a) exactly ONE log_audit signature remains: the canonical 7-arg;
--   (b) the previously ambiguous call FORMS from each hotspot class
--       (3-arg, 5-arg, 6-arg uncast positional + 6-key named notation)
--       now execute and write rows;
--   (c) fully-cast 7-arg calls still work;
--   (d) proacl contains NO PUBLIC/anon/authenticated EXECUTE, and
--       service_role has EXECUTE;
--   (e) no NEW grants vs the pre-state snapshot (every current executor
--       was already an executor before the draft);
--   (f) every pre-existing audit_logs row is untouched (id + hash);
--   (g) idempotency: the draft was applied twice; the end state holds.
--
-- Ends by dropping every object this harness created (except the inert
-- NOLOGIN roles anon/authenticated/service_role, which are shared).

SET client_min_messages = warning;

-- ---------- (a) exactly one canonical overload ----------
DO $$
DECLARE
  v_overloads integer;
  v_identity text;
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'log_audit';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'POST_A_OVERLOAD_COUNT_%: expected exactly 1 log_audit overload', v_overloads;
  END IF;
  IF to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'POST_A_SIX_ARG_SURVIVED: legacy 6-arg overload still present';
  END IF;
  IF to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'POST_A_SEVEN_ARG_MISSING: canonical 7-arg overload not found';
  END IF;
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_identity
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'log_audit';
  IF v_identity <> '_entity_type text, _entity_id uuid, _action_type text, _old jsonb, _new jsonb, _notes text, _actor_user_id uuid' THEN
    RAISE EXCEPTION 'POST_A_IDENTITY_ARGS_%: expected the canonical 7-arg signature', v_identity;
  END IF;
END $$;

-- ---------- (b) previously ambiguous call forms now execute and write rows ----------
DO $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.audit_logs;

  -- 3-arg positional form
  PERFORM public.log_audit('probe', NULL, 'form_3arg');
  -- 5-arg positional form (cancel_official_document / issue_official_document /
  -- act_on_student_request_step skip / finance+schedule+org trigger class)
  PERFORM public.log_audit('probe', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'form_5arg', NULL, jsonb_build_object('k', 'v'));
  -- 6-arg positional form (process_payment_receipt_approval /
  -- apply_student_discount / check_and_record_rate_limit class)
  PERFORM public.log_audit('probe', NULL, 'form_6arg', NULL, jsonb_build_object('k', 'v'), 'note');
  -- 6-key named notation (PostgREST rpc() caller class)
  PERFORM public.log_audit(
    _entity_type := 'probe',
    _entity_id := NULL,
    _action_type := 'form_named6',
    _old := NULL,
    _new := jsonb_build_object('k', 'v'),
    _notes := NULL
  );

  SELECT count(*) INTO v_after FROM public.audit_logs;
  IF v_after <> v_before + 4 THEN
    RAISE EXCEPTION 'POST_B_ROWCOUNT_%_%: expected 4 new audit rows from legacy call forms', v_before, v_after;
  END IF;
  IF (SELECT count(*) FROM public.audit_logs
      WHERE action_type IN ('form_3arg', 'form_5arg', 'form_6arg', 'form_named6')
        AND entity_type = 'probe') <> 4 THEN
    RAISE EXCEPTION 'POST_B_ROWS_MISSING: legacy call form rows not found in audit_logs';
  END IF;
END $$;

-- ---------- (c) fully-cast 7-arg call still works ----------
DO $$
DECLARE
  v_actor uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_stored uuid;
BEGIN
  PERFORM public.log_audit(
    'probe'::text,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
    'form_7arg_casted'::text,
    NULL::jsonb,
    jsonb_build_object('k', 'v')::jsonb,
    'casted note'::text,
    v_actor::uuid
  );
  SELECT actor_user_id INTO v_stored
  FROM public.audit_logs
  WHERE action_type = 'form_7arg_casted';
  IF v_stored IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'POST_C_ACTOR_%: explicit _actor_user_id not honored by canonical overload', v_stored;
  END IF;
END $$;

-- ---------- (d) ACL: no PUBLIC/anon/authenticated EXECUTE; service_role yes ----------
DO $$
DECLARE
  v_acl aclitem[];
BEGIN
  SELECT p.proacl INTO v_acl
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')::oid;

  IF v_acl IS NULL THEN
    RAISE EXCEPTION 'POST_D_ACL_NULL: default PUBLIC EXECUTE survived on canonical overload';
  END IF;
  IF EXISTS (
    SELECT 1 FROM aclexplode(v_acl) a
    WHERE a.privilege_type = 'EXECUTE'
      AND (a.grantee = 0
           OR a.grantee IN (SELECT r.oid FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')))
  ) THEN
    RAISE EXCEPTION 'POST_D_CLIENT_ACL: PUBLIC/anon/authenticated EXECUTE present in proacl';
  END IF;
  IF has_function_privilege('anon', 'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST_D_CLIENT_PRIVILEGE: anon/authenticated can execute canonical overload';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST_D_SERVICE_ROLE_MISSING: service_role cannot execute canonical overload';
  END IF;
END $$;

-- ---------- (e) no NEW grants vs pre-state ----------
DO $$
DECLARE
  v_new text;
BEGIN
  SELECT COALESCE(r.rolname, 'PUBLIC') INTO v_new
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE p.oid = to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')::oid
    AND a.privilege_type = 'EXECUTE'
    AND COALESCE(r.rolname, 'PUBLIC') NOT IN (SELECT role_name FROM a_logaudit_pre_executors)
  LIMIT 1;
  IF v_new IS NOT NULL THEN
    RAISE EXCEPTION 'POST_E_NEW_GRANT_%: executor present that was not an executor pre-draft', v_new;
  END IF;
END $$;

-- ---------- (f) pre-existing audit rows untouched ----------
DO $$
DECLARE
  v_missing integer;
  v_drifted integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM a_logaudit_pre_data pre
  LEFT JOIN public.audit_logs cur ON cur.id = pre.id
  WHERE cur.id IS NULL;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'POST_F_ROWS_LOST_%: pre-existing audit rows missing', v_missing;
  END IF;

  SELECT count(*) INTO v_drifted
  FROM a_logaudit_pre_data pre
  JOIN public.audit_logs cur ON cur.id = pre.id
  WHERE md5(cur::text) IS DISTINCT FROM pre.row_hash;
  IF v_drifted <> 0 THEN
    RAISE EXCEPTION 'POST_F_ROWS_DRIFTED_%: pre-existing audit rows modified', v_drifted;
  END IF;

  -- total = 3 seeded + 4 legacy-form rows (b) + 1 casted row (c)
  IF (SELECT count(*) FROM public.audit_logs) <> 8 THEN
    RAISE EXCEPTION 'POST_F_TOTAL_%: unexpected audit_logs row total', (SELECT count(*) FROM public.audit_logs);
  END IF;
END $$;

-- ---------- (g) idempotency marker ----------
-- The runner applied the draft twice before this script; reaching this
-- point proves the second application was a verified no-op.

SELECT 'POST_VERIFY_OK' AS status,
       (SELECT count(*) FROM public.audit_logs) AS total_rows,
       (SELECT COALESCE(string_agg(COALESCE(r.rolname, 'PUBLIC'), ',' ORDER BY COALESCE(r.rolname, 'PUBLIC')), '')
        FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(p.proacl) a
        LEFT JOIN pg_roles r ON r.oid = a.grantee
        WHERE p.oid = to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)')::oid
          AND a.privilege_type = 'EXECUTE') AS executors;

-- ---------- cleanup: drop everything this harness created ----------
DROP TABLE IF EXISTS a_logaudit_pre_executors;
DROP TABLE IF EXISTS a_logaudit_pre_data;
DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid);
DROP FUNCTION IF EXISTS public.audit_resolve_role(uuid);
DROP TABLE IF EXISTS public.audit_logs;
DROP FUNCTION IF EXISTS auth.uid();
DROP SCHEMA IF EXISTS auth;

DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('log_audit', 'audit_resolve_role');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'CLEANUP_LEFTOVER_%: harness objects left behind', v_left;
  END IF;
END $$;

SELECT 'CLEANUP_OK' AS status;
