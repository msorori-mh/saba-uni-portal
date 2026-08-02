-- ============================================================================
-- PORTAL-B1-PINNED-BASELINE-EXECUTION-AUTHORIZATION-FAIL-CLOSED-REMEDIATION-26
-- FAIL-CLOSED EXECUTION AUTHORIZATION GATE (gate 3 of 3)
--
-- READ-ONLY. No RPC action, no DDL on persistent objects, no GRANT, no write.
-- Runs INSIDE the master script AFTER 00-preflight.sql and BEFORE case-0001.
-- With ON_ERROR_STOP=1 the first failure aborts the run before any negative
-- case executes.
--
-- Three independent gates, no single flag bypass:
--   gate 1 (00-preflight.sql §6): fresh PINNED baseline that does NOT
--          self-authorize execution (baseline_execution_authorized = 'false'),
--          matching fingerprint, required migration head.
--   gate 2 (session marker):      the read-only Operator Preflight passed in
--          THIS psql session (b1.operator_preflight_passed = 'true'). The
--          marker is set only after the preflight's ROLLBACK; it is not
--          execution authorization by itself.
--   gate 3 (this file):           a separate, explicit owner-approved execution
--          authorization artifact (authorization/EXECUTION-AUTHORIZATION.json,
--          rendered into pins from TARGET-MANIFEST.json) with status GRANTED,
--          bound to the ACTIVE baseline fingerprint, baseline artifact sha256
--          and reviewed package SHA, and inside its validity window.
--
-- REMEDIATION-26 does NOT grant that approval: the artifact is NOT_GRANTED,
-- so this gate always raises HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '120s';

-- pins: temp tables b1_pin_scalar / b1_pin_function / b1_pin_trigger /
--       b1_pin_relation, plus b1_observed_fingerprint (reloaded; the preflight
--       pins were dropped by its ROLLBACK).
\ir generated/pins.sql

-- ============================================================================
-- gate 2 proof: the Operator Preflight passed in THIS session
-- ============================================================================
DO $$
BEGIN
  IF current_setting('b1.operator_preflight_passed', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED: the read-only operator preflight has not passed in this session';
  END IF;
END $$;

-- ============================================================================
-- gate 1 re-proof: the baseline pins are still the non-self-authorizing PINNED
-- baseline (defense in depth against a hand-edited generated/pins.sql)
-- ============================================================================
DO $$
DECLARE
  v_status text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_status');
  v_auth   text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_execution_authorized');
  v_fp     text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_fingerprint');
BEGIN
  IF v_status IS DISTINCT FROM 'PINNED' OR v_fp IS NULL OR v_fp = '' THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE: baseline is %', coalesce(v_status, 'MISSING');
  END IF;
  IF v_auth IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE: baseline self-authorizes execution (execution_authorized=%); a read-only capture must never authorize execution',
      coalesce(v_auth, 'MISSING');
  END IF;
END $$;

-- ============================================================================
-- gate 3: explicit owner-approved execution authorization, bound to the
-- ACTIVE baseline and inside its own validity window
-- ============================================================================
DO $$
DECLARE
  k_hold       CONSTANT text := 'HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED';
  v_path       text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_artifact_path');
  v_status     text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_status');
  v_auth       text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_execution_authorized');
  v_req_pf     text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_requires_preflight_pass');
  v_bound_fp   text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_bound_baseline_fingerprint');
  v_bound_sha  text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_bound_baseline_artifact_sha256');
  v_bound_pkg  text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_bound_reviewed_package_sha');
  v_granted_at text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_authorized_at_utc');
  v_valid_min  text := (SELECT value FROM b1_pin_scalar WHERE key = 'execution_authorization_valid_for_minutes');
  v_base_fp    text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_fingerprint');
  v_base_sha   text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_artifact_sha256');
  v_base_pkg   text := (SELECT value FROM b1_pin_scalar WHERE key = 'baseline_reviewed_package_sha');
BEGIN
  IF v_path IS DISTINCT FROM 'scripts/b1-rpc-principal-harness-01/authorization/EXECUTION-AUTHORIZATION.json' THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: authorization artifact path is not the canonical path (%)', k_hold, coalesce(v_path, 'MISSING');
  END IF;
  IF v_status IS DISTINCT FROM 'GRANTED' OR v_auth IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: no explicit owner-approved execution authorization (status %)', k_hold, coalesce(v_status, 'MISSING');
  END IF;
  IF v_req_pf IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: the authorization does not require a successful operator preflight', k_hold;
  END IF;
  IF v_bound_fp IS NULL OR v_bound_fp IS DISTINCT FROM v_base_fp THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: authorization is not bound to the active baseline fingerprint', k_hold;
  END IF;
  IF v_bound_sha IS NULL OR v_bound_sha IS DISTINCT FROM v_base_sha THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: authorization is not bound to the active baseline artifact sha256', k_hold;
  END IF;
  IF v_bound_pkg IS NULL OR v_bound_pkg IS DISTINCT FROM v_base_pkg THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: authorization is not bound to the baseline reviewed package SHA', k_hold;
  END IF;
  IF v_granted_at IS NULL OR v_valid_min IS NULL THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: authorization validity window is missing', k_hold;
  END IF;
  IF now() > (v_granted_at::timestamptz + (v_valid_min || ' minutes')::interval) THEN
    RAISE EXCEPTION 'EXECUTION_GATE_FAIL: %: execution authorization is expired', k_hold;
  END IF;
END $$;

SELECT 'B1_EXECUTION_GATE_PASS' AS verdict;

ROLLBACK;
