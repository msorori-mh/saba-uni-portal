-- LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01 — pre-draft proof (harness)
--
-- Runs BEFORE the draft. Fail-closed: every check raises on violation.
--   1. Snapshots pre-state executors of BOTH overloads (for the post-draft
--      "no NEW grants" comparison) into a session temp table.
--   2. Snapshots a hash of every pre-existing audit_logs row.
--   3. Proves the dual-overload ambiguity is real: uncast 3-arg, 5-arg,
--      6-arg positional call FORMS and the 6-key named-notation PostgREST
--      form each raise ambiguous_function (SQLSTATE 42725) against the
--      pre-draft schema. If any of them unexpectedly succeeds, this script
--      raises and the chain stops.

SET client_min_messages = warning;

-- ---- 1) pre-state executors (PUBLIC represented as the literal 'PUBLIC') ----
DROP TABLE IF EXISTS a_logaudit_pre_executors;
CREATE TEMP TABLE a_logaudit_pre_executors (role_name text PRIMARY KEY);

INSERT INTO a_logaudit_pre_executors (role_name)
SELECT DISTINCT COALESCE(r.rolname, 'PUBLIC')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname = 'log_audit'
  AND a.privilege_type = 'EXECUTE';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM a_logaudit_pre_executors;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'PRED_STATE_EXECUTOR_SNAPSHOT_EMPTY_%: expected at least owner + PUBLIC executors across overloads', v_count;
  END IF;
END $$;

-- ---- 2) pre-state audit data hash ----
DROP TABLE IF EXISTS a_logaudit_pre_data;
CREATE TEMP TABLE a_logaudit_pre_data AS
SELECT id, md5(audit_logs::text) AS row_hash
FROM public.audit_logs;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM a_logaudit_pre_data;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'PRED_STATE_SEED_COUNT_%: expected exactly 3 seeded audit rows', v_count;
  END IF;
END $$;

-- ---- 3) ambiguity proof: every uncast legacy call FORM must fail today ----
DO $$
DECLARE
  v_probes integer := 0;
BEGIN
  -- 3-arg positional (matches both overloads via defaults)
  BEGIN
    PERFORM public.log_audit('probe', NULL, 'three_arg_form');
    RAISE EXCEPTION 'PRED_STATE_NOT_AMBIGUOUS_3ARG';
  EXCEPTION WHEN ambiguous_function THEN
    v_probes := v_probes + 1;
  END;

  -- 5-arg positional (the cancel_official_document / issue_official_document class)
  BEGIN
    PERFORM public.log_audit('probe', NULL, 'five_arg_form', NULL, jsonb_build_object('k', 'v'));
    RAISE EXCEPTION 'PRED_STATE_NOT_AMBIGUOUS_5ARG';
  EXCEPTION WHEN ambiguous_function THEN
    v_probes := v_probes + 1;
  END;

  -- 6-arg positional (the process_payment_receipt_approval / rate_limit class)
  BEGIN
    PERFORM public.log_audit('probe', NULL, 'six_arg_form', NULL, jsonb_build_object('k', 'v'), 'note');
    RAISE EXCEPTION 'PRED_STATE_NOT_AMBIGUOUS_6ARG';
  EXCEPTION WHEN ambiguous_function THEN
    v_probes := v_probes + 1;
  END;

  -- 6-key named notation (the PostgREST rpc() caller class, PGRST203 analogue)
  BEGIN
    PERFORM public.log_audit(
      _entity_type := 'probe',
      _entity_id := NULL,
      _action_type := 'named_six_key_form',
      _old := NULL,
      _new := jsonb_build_object('k', 'v'),
      _notes := NULL
    );
    RAISE EXCEPTION 'PRED_STATE_NOT_AMBIGUOUS_NAMED6';
  EXCEPTION WHEN ambiguous_function THEN
    v_probes := v_probes + 1;
  END;

  IF v_probes <> 4 THEN
    RAISE EXCEPTION 'PRED_STATE_AMBIGUITY_PROOF_INCOMPLETE_%: expected 4 ambiguous probes', v_probes;
  END IF;
END $$;

-- ---- sanity: 7-arg positional call must already work pre-draft ----
DO $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.audit_logs;
  PERFORM public.log_audit('probe', NULL, 'seven_arg_pred', NULL, NULL, NULL, NULL);
  SELECT count(*) INTO v_after FROM public.audit_logs;
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'PRED_STATE_SEVEN_ARG_BROKEN: canonical 7-arg call failed pre-draft';
  END IF;
  DELETE FROM public.audit_logs WHERE action_type = 'seven_arg_pred';
END $$;

SELECT 'PRED_STATE_OK' AS status,
       (SELECT count(*) FROM a_logaudit_pre_executors) AS pre_executors,
       (SELECT count(*) FROM a_logaudit_pre_data) AS pre_rows;
