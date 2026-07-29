/**
 * PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-EXECUTION-PACKAGE-01
 *
 * Renders the 267 negative authorization cases from MATRIX.json into one
 * self-contained, single-transaction, ROLLBACK-only .sql file per case.
 *
 * OFFLINE ONLY. This script never connects to a database.
 * Output goes to scripts/b1-rpc-principal-harness-01/generated/ (git-ignored).
 *
 *   bun run scripts/b1-rpc-principal-harness-01/render-negative-cases.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Case = {
  case: string;
  request_number: string;
  step_key: string;
  runtime_step_id?: string | null;
  actor_user_id: string | null;
  action: string;
  expect: string;
  expect_error?: string;
  zero_mutation?: boolean;
};

const here = join(process.cwd(), "scripts", "b1-rpc-principal-harness-01");
const matrixPath = join(
  process.cwd(),
  "tests",
  "b1-five-services-rpc-authorization-preflight-01",
  "MATRIX.json",
);
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));

export const negativeCases: Case[] = [
  ...matrix.negative_cases,
  ...matrix.illegal_action_cases,
  ...matrix.supplemental_department_scope_cases,
];

const EXPECTED_TOTAL = 267;

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

export function renderCase(c: Case, index: number): string {
  const claims =
    c.actor_user_id === null
      ? `'{"role":"anon"}'`
      : `json_build_object('sub', ${lit(c.actor_user_id)}, 'role', 'authenticated')::text`;
  const rpc =
    c.action === "confirm_payment"
      ? `PERFORM public.record_external_university_payment_confirmation(v_step, 'B1_NEG_OPERATOR_HARNESS');`
      : `PERFORM public.act_on_b1_student_request_step_atomic(v_step, ${lit(c.action)}, 'B1_NEG_OPERATOR_HARNESS', '{}'::jsonb);`;

  return `-- case ${String(index + 1).padStart(3, "0")}/${EXPECTED_TOTAL}
-- class=${c.case} request=${c.request_number} step=${c.step_key} action=${c.action}
-- actor=${c.actor_user_id ?? "ANONYMOUS"} expect=DENY (${c.expect_error ?? "denial"})
\\set ON_ERROR_STOP on

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL ROLE authenticated;

DO $case$
DECLARE
  v_step uuid;
  v_before text;
  v_after text;
  v_observed text := 'ALLOW';
  v_state text;
  v_msg text;
BEGIN
  -- ---- session-role assertions (fail-closed, before any RPC) ----------------
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'B1_CASE_ROLE_NOT_AUTHENTICATED: %', current_user;
  END IF;
  IF current_setting('row_security', true) <> 'on' THEN
    RAISE EXCEPTION 'B1_CASE_ROW_SECURITY_OFF';
  END IF;
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'B1_CASE_PRINCIPAL_HAS_BYPASS';
  END IF;

  PERFORM set_config('request.jwt.claims', ${claims}, true);

  IF auth.uid() IS DISTINCT FROM ${c.actor_user_id === null ? "NULL::uuid" : `${lit(c.actor_user_id)}::uuid`} THEN
    RAISE EXCEPTION 'B1_CASE_AUTH_UID_MISMATCH: %', auth.uid();
  END IF;

  -- ---- resolve the runtime step --------------------------------------------
  SELECT w.id INTO v_step
  FROM public.student_request_workflow_steps w
  JOIN public.student_requests r ON r.id = w.student_request_id
  WHERE r.request_number = ${lit(c.request_number)} AND w.step_key = ${lit(c.step_key)};
${
  c.runtime_step_id
    ? `  IF v_step IS DISTINCT FROM ${lit(c.runtime_step_id)}::uuid THEN
    RAISE EXCEPTION 'B1_CASE_STEP_ID_DRIFT: %', v_step;
  END IF;`
    : `  IF v_step IS NULL THEN
    RAISE EXCEPTION 'B1_CASE_STEP_NOT_FOUND';
  END IF;`
}

  -- ---- before fingerprint ---------------------------------------------------
  SELECT md5(string_agg(x, '|')) INTO v_before FROM (
    SELECT md5(coalesce(string_agg(w::text,'|' ORDER BY w::text),'-')) AS x
      FROM public.student_request_workflow_steps w
      JOIN public.student_requests r ON r.id = w.student_request_id
     WHERE r.request_number = ${lit(c.request_number)}
    UNION ALL
    SELECT md5(coalesce(string_agg(e::text,'|' ORDER BY e::text),'-'))
      FROM public.student_request_workflow_events e
      JOIN public.student_requests r ON r.id = e.student_request_id
     WHERE r.request_number = ${lit(c.request_number)}
    UNION ALL
    SELECT md5(coalesce(string_agg(r::text,'|' ORDER BY r::text),'-'))
      FROM public.student_requests r
     WHERE r.request_number = ${lit(c.request_number)}
  ) s;

  -- ---- the exact direct RPC under test -------------------------------------
  BEGIN
    ${rpc}
  EXCEPTION WHEN OTHERS THEN
    v_observed := 'DENY';
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  -- ---- after fingerprint ----------------------------------------------------
  SELECT md5(string_agg(x, '|')) INTO v_after FROM (
    SELECT md5(coalesce(string_agg(w::text,'|' ORDER BY w::text),'-')) AS x
      FROM public.student_request_workflow_steps w
      JOIN public.student_requests r ON r.id = w.student_request_id
     WHERE r.request_number = ${lit(c.request_number)}
    UNION ALL
    SELECT md5(coalesce(string_agg(e::text,'|' ORDER BY e::text),'-'))
      FROM public.student_request_workflow_events e
      JOIN public.student_requests r ON r.id = e.student_request_id
     WHERE r.request_number = ${lit(c.request_number)}
    UNION ALL
    SELECT md5(coalesce(string_agg(r::text,'|' ORDER BY r::text),'-'))
      FROM public.student_requests r
     WHERE r.request_number = ${lit(c.request_number)}
  ) s;

  PERFORM set_config('request.jwt.claims', NULL, true);

  IF v_observed <> 'DENY' THEN
    RAISE EXCEPTION 'B1_NEG_UNEXPECTED_ALLOW case=% request=% step=% action=%',
      ${lit(c.case)}, ${lit(c.request_number)}, ${lit(c.step_key)}, ${lit(c.action)};
  END IF;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'B1_NEG_MUTATION_DETECTED case=% request=%',
      ${lit(c.case)}, ${lit(c.request_number)};
  END IF;

  RAISE NOTICE 'B1_NEG_CASE_PASS idx=% class=% request=% step=% action=% sqlstate=% msg=%',
    ${index + 1}, ${lit(c.case)}, ${lit(c.request_number)}, ${lit(c.step_key)},
    ${lit(c.action)}, coalesce(v_state,''), coalesce(v_msg,'');
END
$case$;

RESET ROLE;

-- UNCONDITIONAL: one case = one transaction = one ROLLBACK.
ROLLBACK;
`;
}

function main() {
  if (negativeCases.length !== EXPECTED_TOTAL) {
    throw new Error(
      `B1_RENDER_CASE_COUNT_MISMATCH: expected ${EXPECTED_TOTAL}, got ${negativeCases.length}`,
    );
  }
  if (matrix.production_ref !== "wpmicqriltrowwonknox") {
    throw new Error("B1_RENDER_PRODUCTION_REF_MISMATCH");
  }
  const out = join(here, "generated");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const manifest: Array<Record<string, unknown>> = [];
  negativeCases.forEach((c, i) => {
    const name = `${String(i + 1).padStart(3, "0")}-${c.case}-${c.step_key}.sql`;
    writeFileSync(join(out, name), renderCase(c, i), "utf8");
    manifest.push({
      index: i + 1,
      file: name,
      class: c.case,
      request_number: c.request_number,
      step_key: c.step_key,
      actor_user_id: c.actor_user_id,
      action: c.action,
      expect: "DENY",
    });
  });
  writeFileSync(
    join(out, "MANIFEST.json"),
    JSON.stringify(
      { matrix_id: matrix.matrix_id, total: manifest.length, cases: manifest },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`rendered ${manifest.length} rollback-only negative cases -> ${out}`);
}

if (import.meta.main) main();
