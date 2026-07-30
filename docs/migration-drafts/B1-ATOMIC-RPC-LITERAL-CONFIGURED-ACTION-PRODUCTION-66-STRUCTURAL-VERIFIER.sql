-- PORTAL-B1-...-66 — STRUCTURAL VERIFIER (source-side, EXECUTABLE, FAIL-CLOSED)
--
-- Verifies the SHAPE of the migration file itself before it is scheduled.
-- It makes no reference to application schema and performs no write. Run it
-- against ANY scratch database (never production is required, but running it
-- against production is harmless because it only reads a file):
--
--   psql "$SCRATCH" -v ON_ERROR_STOP=1 \
--     -v migration_path=/abs/path/B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66.sql \
--     -f B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-STRUCTURAL-VERIFIER.sql
--
-- If pg_read_file is unavailable to the operator role, the identical assertions
-- are executed offline by
-- tests/b1-five-services-rpc-authorization-preflight-01/atomic-rpc-literal-configured-action-package-66.test.ts
--
-- ASSERTIONS
--   S1  exactly one BEGIN; and one COMMIT; (single transaction, no partial apply)
--   S2  exactly four CREATE OR REPLACE FUNCTION statements, no CREATE TABLE,
--       no DROP, no ALTER, no GRANT/REVOKE, no INSERT/UPDATE/DELETE/TRUNCATE
--   S3  the executor keeps signature (uuid, text, text, jsonb) RETURNS jsonb,
--       SECURITY DEFINER, SET search_path TO 'public'
--   S4  the readers keep SECURITY DEFINER + SET search_path TO 'public', 'pg_temp'
--   S5  b1_map_ui_staff_action is not referenced by any replaced function body
--   S6  the literal guard `p_action IS DISTINCT FROM v_config.action_type` is present
--       and raises with ERRCODE 42501
--   S7  no student_visible mutation, no protected request numbers
--   S8  enrollment_certificate is never named as a mutated object
--   S9  pre-condition and post-condition DO blocks abort on owner / search_path /
--       ACL / visibility drift
--   S10 AUTHORIZATION BEFORE ACTION ORACLE: the direct-assignee authorization
--       check precedes the literal-action guard
--   S11 specialized actions (confirm_payment / issue_document / sign) remain
--       delegated to their dedicated RPCs
--   S12 EOL portability: assertions are evaluated on the LF-normalized text, so a
--       CRLF checkout yields an identical verdict

\set ON_ERROR_STOP on

DO $structural$
DECLARE
  raw text;
  src text;            -- LF-normalized
  n int;
  bodies text;
  bad text;
BEGIN
  raw := pg_read_file(current_setting('b1_66.migration_path', true));
  IF raw IS NULL THEN RAISE EXCEPTION 'S_FAIL_MIGRATION_FILE_UNREADABLE'; END IF;

  -- S12: normalize CRLF -> LF once; every assertion below is EOL-insensitive.
  src := replace(replace(raw, E'\r\n', E'\n'), E'\r', E'\n');

  -- S1
  IF (length(src) - length(replace(src, E'\nBEGIN;', ''))) / length(E'\nBEGIN;') <> 1 THEN
    RAISE EXCEPTION 'S1_FAIL_NOT_SINGLE_BEGIN'; END IF;
  IF (length(src) - length(replace(src, E'\nCOMMIT;', ''))) / length(E'\nCOMMIT;') <> 1 THEN
    RAISE EXCEPTION 'S1_FAIL_NOT_SINGLE_COMMIT'; END IF;
  IF position(E'\nBEGIN;' in src) > position(E'\nCOMMIT;' in src) THEN
    RAISE EXCEPTION 'S1_FAIL_TRANSACTION_ORDER'; END IF;

  -- S2
  n := (length(src) - length(replace(src, 'CREATE OR REPLACE FUNCTION', ''))) / length('CREATE OR REPLACE FUNCTION');
  IF n <> 4 THEN RAISE EXCEPTION 'S2_FAIL_FUNCTION_COUNT:%', n; END IF;
  FOREACH bad IN ARRAY ARRAY['DROP FUNCTION','DROP TABLE','ALTER TABLE','ALTER FUNCTION',
                             'CREATE TABLE','GRANT ','REVOKE ','TRUNCATE','DELETE FROM '] LOOP
    IF position(bad in src) > 0 THEN RAISE EXCEPTION 'S2_FAIL_FORBIDDEN_STATEMENT:%', bad; END IF;
  END LOOP;

  -- S3 / S4
  IF position('act_on_b1_student_request_step_atomic(p_step_id uuid, p_action text, p_comment text' in src) = 0
     OR position('RETURNS jsonb' in src) = 0
     OR position(E'SET search_path TO ''public''\n' in src) = 0 THEN
    RAISE EXCEPTION 'S3_FAIL_EXECUTOR_IDENTITY'; END IF;
  n := (length(src) - length(replace(src, 'SET search_path TO ''public'', ''pg_temp''', '')))
       / length('SET search_path TO ''public'', ''pg_temp''');
  IF n <> 3 THEN RAISE EXCEPTION 'S4_FAIL_READER_SEARCH_PATH_COUNT:%', n; END IF;
  n := (length(src) - length(replace(src, 'SECURITY DEFINER', ''))) / length('SECURITY DEFINER');
  IF n < 4 THEN RAISE EXCEPTION 'S4_FAIL_SECURITY_DEFINER_COUNT:%', n; END IF;

  bodies := substr(src, position('CREATE OR REPLACE FUNCTION' in src));

  -- S5
  IF position('b1_map_ui_staff_action(v_config.action_type) = p_action' in bodies) > 0 THEN
    RAISE EXCEPTION 'S5_FAIL_ALIAS_STILL_PRESENT'; END IF;

  -- S6
  IF position('p_action IS DISTINCT FROM v_config.action_type' in src) = 0
     OR position('B1_ACTION_TYPE_MISMATCH' in src) = 0
     OR position('USING ERRCODE=''42501''' in src) = 0 THEN
    RAISE EXCEPTION 'S6_FAIL_LITERAL_GUARD_MISSING'; END IF;

  -- S7
  IF src ~* 'SET\s+student_visible' THEN RAISE EXCEPTION 'S7_FAIL_STUDENT_VISIBLE_MUTATION'; END IF;
  FOREACH bad IN ARRAY ARRAY['SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8',
                             'USR-2026-000001','USR-2026-000002'] LOOP
    IF position(bad in src) > 0 THEN RAISE EXCEPTION 'S7_FAIL_PROTECTED_RECORD_REFERENCED:%', bad; END IF;
  END LOOP;

  -- S8
  IF src ~ 'enrollment_certificate[a-z_]*\s*\(' THEN
    RAISE EXCEPTION 'S8_FAIL_ENROLLMENT_CERTIFICATE_TOUCHED'; END IF;

  -- S9
  FOREACH bad IN ARRAY ARRAY['B1_66_UNEXPECTED_OWNER','B1_66_UNEXPECTED_SEARCH_PATH','B1_66_UNEXPECTED_ACL',
                             'B1_66_OWNER_CHANGED','B1_66_SEARCH_PATH_CHANGED','B1_66_ACL_CHANGED',
                             'B1_66_SECURITY_DEFINER_LOST','B1_66_ALIAS_STILL_PRESENT',
                             'B1_66_LITERAL_GUARD_MISSING','B1_66_READER_ALIAS_STILL_PRESENT',
                             'B1_66_READER_SEARCH_PATH_CHANGED','B1_66_STUDENT_VISIBLE_MUST_REMAIN_FALSE'] LOOP
    IF position(bad in src) = 0 THEN RAISE EXCEPTION 'S9_FAIL_GUARD_MISSING:%', bad; END IF;
  END LOOP;

  -- S10
  IF position('B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' in bodies) = 0
     OR position('B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' in bodies)
        > position('p_action IS DISTINCT FROM v_config.action_type' in bodies) THEN
    RAISE EXCEPTION 'S10_FAIL_AUTHORIZATION_NOT_BEFORE_ACTION_GUARD'; END IF;

  -- S11
  IF position('B1_SPECIALIZED_ACTION_RPC_REQUIRED' in src) = 0 THEN
    RAISE EXCEPTION 'S11_FAIL_SPECIALIZED_ACTION_DELEGATION_MISSING'; END IF;

  RAISE NOTICE 'B1_66_STRUCTURAL_VERIFIER_PASS';
END
$structural$;
