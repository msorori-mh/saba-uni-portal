import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "docs", "migration-drafts");
/** Central EOL normalization: every textual assertion below runs on LF text,
 *  so an LF and a CRLF checkout of the same file yield identical verdicts. */
export const toLf = (value: string) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const readRaw = (f: string) => readFileSync(join(DIR, f), "utf8");
const read = (f: string) => toLf(readRaw(f));

const MIGRATION = read("B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66.sql");
const PREFLIGHT = read("B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-PREFLIGHT.sql");
const POST = read("B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-POST-VERIFIER.sql");
const ROLLBACK = read("B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-ROLLBACK-BY-FORWARD.sql");
const MATRIX_PATH = join(
  process.cwd(), "scripts", "b1-atomic-rpc-literal-configured-action-66", "50-literal-action-rpc-matrix.sql",
);
const MATRIX = toLf(readFileSync(MATRIX_PATH, "utf8"));

const STRUCTURAL = read("B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-STRUCTURAL-VERIFIER.sql");

/** CRLF twin of a source file — used to prove EOL portability. */
const toCrlf = (value: string) => toLf(value).replace(/\n/g, "\r\n");

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe("66 — migration is a single forward-only transaction", () => {
  it("declares itself as prepared but not applied", () => {
    expect(MIGRATION).toContain("FORWARD-ONLY PRODUCTION MIGRATION");
    expect(MIGRATION).toContain("NOT APPLIED** IN THIS TASK");
  });

  it("wraps everything in exactly one transaction", () => {
    expect(count(MIGRATION, "\nBEGIN;")).toBe(1);
    expect(count(MIGRATION, "\nCOMMIT;")).toBe(1);
    expect(MIGRATION.indexOf("\nBEGIN;")).toBeLessThan(MIGRATION.indexOf("\nCOMMIT;"));
  });

  it("replaces exactly four functions and performs no other schema or data change", () => {
    expect(count(MIGRATION, "CREATE OR REPLACE FUNCTION")).toBe(4);
    for (const forbidden of [
      "DROP FUNCTION", "DROP TABLE", "ALTER TABLE", "ALTER FUNCTION",
      "CREATE TABLE", "GRANT ", "REVOKE ", "TRUNCATE", "DELETE FROM ",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
    // the only INSERT is the pre-existing runtime event emission inside the
    // executor body — the migration itself writes no rows.
    expect(count(MIGRATION, "INSERT INTO public.")).toBe(1);
    expect(MIGRATION).toContain("INSERT INTO public.student_request_workflow_events");
    expect(MIGRATION).not.toMatch(/^\s*UPDATE public\.request_types/m);

  });
});

describe("66 — literal configured action enforcement", () => {
  it("removes the UI alias from every replaced body", () => {
    const bodies = MIGRATION.slice(MIGRATION.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(bodies).not.toContain("b1_map_ui_staff_action(v_config.action_type) = p_action");
    // the mapper may only appear inside comments / assertions, never as a call in a body
    expect(bodies).not.toMatch(/^\s*v_primary := public\.b1_map_ui_staff_action/m);
  });

  it("requires p_action to equal the configured action_type literally", () => {
    expect(MIGRATION).toContain("p_action IS DISTINCT FROM v_config.action_type");
    expect(MIGRATION).toContain("B1_ACTION_TYPE_MISMATCH");
    expect(MIGRATION).toContain("USING ERRCODE='42501'");
  });

  it("introduces no alias exception at all — there is no 'skip' action", () => {
    expect(MIGRATION).toContain("NO ALIAS EXCEPTION EXISTS");
    const bodies = MIGRATION.slice(MIGRATION.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(bodies).not.toContain("'skip'");
  });

  it("keeps the closed action/outcome vocabulary", () => {
    for (const [action, outcome] of [
      ["review", "reviewed"], ["approve", "approved"], ["clear", "cleared"],
      ["apply_decision", "applied"], ["archive", "archived"],
    ]) {
      expect(MIGRATION).toContain(`WHEN '${action}' THEN '${outcome}'`);
    }
    expect(MIGRATION).toContain("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
  });

  it("preserves every pre-existing safety contract of the executor", () => {
    for (const contract of [
      "AUTHENTICATION_REQUIRED",
      "FOR UPDATE",
      "LOCK TABLE public.request_type_workflow_transitions IN SHARE MODE",
      "can_current_user_act_on_step",
      "B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED",
      "B1_PREDECESSOR_INCOMPLETE",
      "B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN",
      "B1_TRANSITION_MUST_RESOLVE_ONCE",
      "B1_NEXT_RUNTIME_STEP_MUST_RESOLVE_ONCE",
      "B1_ACTIVE_STEP_INVARIANT_FAILED",
      "B1_COMMENT_REQUIRED",
      "apply_b1_academic_effect_for_request",
    ]) {
      expect(MIGRATION).toContain(contract);
    }
  });

  it("authorizes before mutating", () => {
    const exec = MIGRATION.slice(MIGRATION.indexOf("act_on_b1_student_request_step_atomic(p_step_id"));
    expect(exec.indexOf("FOR UPDATE")).toBeLessThan(exec.indexOf("can_current_user_act_on_step"));
    expect(exec.indexOf("can_current_user_act_on_step")).toBeLessThan(
      exec.indexOf("UPDATE public.student_request_workflow_steps SET status="),
    );
  });
});

describe("66 — reader functions stay consistent with the executor", () => {
  it("updates all three readers to publish the literal configured action", () => {
    for (const fn of [
      "public.get_b1_step_allowed_actions(p_step_id uuid)",
      "public.get_b1_assigned_request_details_for_actor(p_request_id uuid)",
      "public.get_b1_assigned_inbox_for_actor(p_limit integer",
    ]) {
      expect(MIGRATION).toContain(fn);
    }
    expect(count(MIGRATION, "LITERAL CONTRACT (66)")).toBe(3);
  });
});

describe("66 — identity, owner, search_path and ACL preservation", () => {
  it("keeps the executor signature, security and search_path", () => {
    expect(MIGRATION).toContain(
      "act_on_b1_student_request_step_atomic(p_step_id uuid, p_action text, p_comment text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)",
    );
    expect(MIGRATION).toContain("RETURNS jsonb");
    expect(count(MIGRATION, "SECURITY DEFINER")).toBeGreaterThanOrEqual(4);
    expect(MIGRATION).toMatch(/SET search_path TO 'public'\r?\n/);
    expect(count(MIGRATION, "SET search_path TO 'public', 'pg_temp'")).toBe(3);
  });

  it("asserts owner / search_path / ACL both before and after", () => {
    for (const guard of [
      "B1_66_UNEXPECTED_OWNER", "B1_66_UNEXPECTED_SEARCH_PATH", "B1_66_UNEXPECTED_ACL",
      "B1_66_OWNER_CHANGED", "B1_66_SEARCH_PATH_CHANGED", "B1_66_ACL_CHANGED",
      "B1_66_SECURITY_DEFINER_LOST", "B1_66_ALIAS_STILL_PRESENT", "B1_66_LITERAL_GUARD_MISSING",
      "B1_66_READER_ALIAS_STILL_PRESENT", "B1_66_READER_SEARCH_PATH_CHANGED",
    ]) {
      expect(MIGRATION).toContain(guard);
    }
  });
});

describe("66 — protected surfaces", () => {
  it("never mutates student_visible and asserts the five services stay hidden", () => {
    expect(MIGRATION).toContain("B1_66_STUDENT_VISIBLE_MUST_REMAIN_FALSE");
    expect(MIGRATION).not.toMatch(/SET\s+student_visible/i);
  });

  it("does not touch enrollment_certificate or protected records", () => {
    for (const forbidden of [
      "SR-20260713-2DE64041", "SR-20260715-FEDCB3E1", "SR-20260716-26BAD4C8",
      "USR-2026-000001", "USR-2026-000002",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
    expect(MIGRATION).not.toMatch(/enrollment_certificate[a-z_]*\s*\(/);
  });
});

describe("66 — verifiers and stop conditions", () => {
  it("preflight is read-only and captures the pre-image plus the vulnerability proof", () => {
    for (const forbidden of ["INSERT ", "UPDATE ", "DELETE ", "CREATE ", "DROP ", "ALTER ", "act_on_b1_student_request_step_atomic("]) {
      if (forbidden === "act_on_b1_student_request_step_atomic(") continue;
      expect(PREFLIGHT).not.toMatch(new RegExp(`^\\s*${forbidden}`, "mi"));
    }
    expect(PREFLIGHT).toContain("P2_preimage");
    expect(PREFLIGHT).toContain("approve_substitution_branch_present");
    expect(PREFLIGHT).toContain("P5_no_skip_action");
    expect(PREFLIGHT).toContain("STOP CONDITIONS");
  });

  it("post-verifier proves alias removal, zero data delta and protected surfaces", () => {
    for (const check of [
      "V1_executor", "V2_readers", "V3_mapper_preserved",
      "V4_migration_delta", "V5_data_delta", "V6_visibility", "V7_enrollment_certificate",
    ]) {
      expect(POST).toContain(check);
    }
  });

  it("rollback is forward-only and refuses to run unfilled", () => {
    expect(ROLLBACK).toContain("ROLLBACK BY FORWARD");
    expect(ROLLBACK).not.toContain("DROP FUNCTION");
    expect(ROLLBACK).toContain("B1_66_ROLLBACK_TEMPLATE_NOT_FILLED");
  });
});

describe("66 — RPC + authorization matrix harness", () => {
  it("targets the isolated environment and mutates nothing", () => {
    expect(MATRIX).toContain("ISOLATED PostgreSQL 17 environment");
    expect(MATRIX).toContain("NEVER run against production");
    expect(MATRIX.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(MATRIX).not.toContain("COMMIT;");
  });

  it("expands configured action x submitted action x principal", () => {
    for (const a of ["review", "approve", "clear", "apply_decision", "archive"]) {
      expect(MATRIX).toContain(`'${a}'`);
    }
    for (const p of [
      "exact_assignee", "wrong_assignee", "admin", "registrar", "dean",
      "department_head", "student_owner", "anon",
    ]) {
      expect(MATRIX).toContain(p);
    }
  });

  it("encodes the exact regression closed by this migration", () => {
    expect(MATRIX).toContain("REGRESSION_approve_instead_of_configured");
    expect(MATRIX).toContain("B1_ACTION_TYPE_MISMATCH");
    expect(MATRIX).toContain("B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED");
    expect(MATRIX).toContain("AUTHENTICATION_REQUIRED");
  });
});

// ===========================================================================
// 68 — remediation: EOL portability, authorization ordering, principal
//      coverage and executable fail-closed verifiers.
// ===========================================================================

const SQL_SOURCES: Array<[string, string]> = [
  ["migration", MIGRATION],
  ["preflight", PREFLIGHT],
  ["post-verifier", POST],
  ["structural-verifier", STRUCTURAL],
  ["rollback", ROLLBACK],
  ["matrix", MATRIX],
];

describe("68 — EOL portability (LF / CRLF)", () => {
  it("stores every package 66 SQL source with LF endings", () => {
    for (const f of [
      "B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66.sql",
      "B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-PREFLIGHT.sql",
      "B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-POST-VERIFIER.sql",
      "B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-STRUCTURAL-VERIFIER.sql",
      "B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-ROLLBACK-BY-FORWARD.sql",
    ]) {
      expect(readRaw(f).includes("\r")).toBe(false);
    }
    expect(readFileSync(MATRIX_PATH, "utf8").includes("\r")).toBe(false);
  });

  it("normalizes an LF and a CRLF twin of the same file to identical text", () => {
    for (const [name, src] of SQL_SOURCES) {
      expect([name, toLf(toCrlf(src))]).toEqual([name, src]);
    }
  });

  it("produces zero semantic SQL diff when only line endings change", () => {
    for (const [name, src] of SQL_SOURCES) {
      const lf = src.split("\n");
      const crlf = toCrlf(src).split("\r\n");
      expect([name, crlf]).toEqual([name, lf]);
      // token stream (whitespace-insensitive) is byte-identical
      expect(toCrlf(src).replace(/\s+/g, " ").trim()).toBe(src.replace(/\s+/g, " ").trim());
    }
  });

  it("asserts SET search_path independently of the line ending", () => {
    const re = /SET search_path TO 'public'\r?\n/;
    expect(MIGRATION).toMatch(re);
    expect(toCrlf(MIGRATION)).toMatch(re);
    expect(toLf(toCrlf(MIGRATION))).toMatch(re);
  });

  it("pins LF for the package paths in .gitattributes without reformatting the repo", () => {
    const attrs = toLf(readFileSync(join(process.cwd(), ".gitattributes"), "utf8"));
    for (const line of [
      "docs/migration-drafts/B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66*.sql text eol=lf",
      "scripts/b1-atomic-rpc-literal-configured-action-66/*.sql text eol=lf",
      "scripts/b1-isolated-authorization-env-65/*.sql text eol=lf",
      "tests/b1-five-services-rpc-authorization-preflight-01/*.ts text eol=lf",
    ]) {
      expect(attrs).toContain(line);
    }
    expect(attrs).not.toContain("* text=auto");
  });
});

describe("68 — authorization before action oracle", () => {
  const exec = MIGRATION.slice(
    MIGRATION.indexOf("act_on_b1_student_request_step_atomic(p_step_id"),
    MIGRATION.indexOf("2. Reader: single-step allowed actions"),
  );

  it("runs authentication, then authorization, then the literal action guard", () => {
    const auth = exec.indexOf("AUTHENTICATION_REQUIRED");
    const activeStep = exec.indexOf("B1_ACTIVE_STEP_REQUIRED");
    const assignee = exec.indexOf("B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED");
    const predecessor = exec.indexOf("B1_PREDECESSOR_INCOMPLETE");
    const mismatch = exec.indexOf("p_action IS DISTINCT FROM v_config.action_type");
    for (const i of [auth, activeStep, assignee, predecessor, mismatch]) expect(i).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(activeStep);
    expect(activeStep).toBeLessThan(assignee);
    expect(assignee).toBeLessThan(predecessor);
    expect(predecessor).toBeLessThan(mismatch);
  });

  it("probes authorization with the configured action, never the caller-supplied one", () => {
    expect(exec).toContain("can_current_user_act_on_step(p_step_id, COALESCE(v_config.action_type,''))");
    expect(exec).not.toContain("can_current_user_act_on_step(p_step_id,v_action)");
    expect(exec).not.toContain("can_current_user_act_on_step(p_step_id, p_action)");
  });

  it("raises the mismatch exactly once, after authorization, with 42501", () => {
    expect(count(exec, "B1_ACTION_TYPE_MISMATCH")).toBe(1);
    expect(exec).toContain("RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE='42501'");
  });

  it("keeps the existing denial contract for every unauthorized principal", () => {
    expect(exec).toContain("RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'");
    expect(exec).toContain("RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'");
  });
});

describe("68 — complete principal coverage in the matrix", () => {
  for (const principal of [
    "exact_assignee", "wrong_assignee", "admin", "system_admin", "registrar",
    "dean", "department_head", "student_owner", "anon",
  ]) {
    it(`covers principal ${principal}`, () => {
      expect(MATRIX).toContain(principal);
    });
  }

  it("expands every configured action across the principal set", () => {
    for (const a of ["review", "approve", "clear", "apply_decision", "archive"]) {
      expect(MATRIX).toContain(`'${a}'`);
    }
  });

  it("expects the authorization denial first for every non-assignee, mismatch only for the assignee", () => {
    expect(MATRIX).toContain("WHEN p.principal = 'anon' THEN 'AUTHENTICATION_REQUIRED'");
    expect(MATRIX).toContain(
      "WHEN p.principal <> 'exact_assignee' THEN 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED'",
    );
    expect(MATRIX).toContain("WHEN a IS DISTINCT FROM r.configured THEN 'B1_ACTION_TYPE_MISMATCH'");
    const nonAssignee = MATRIX.indexOf("WHEN p.principal <> 'exact_assignee'");
    const mismatch = MATRIX.indexOf("WHEN a IS DISTINCT FROM r.configured");
    expect(nonAssignee).toBeLessThan(mismatch);
  });

  it("asserts no admin / system_admin / registrar / dean bypass and no action oracle", () => {
    expect(MATRIX).toContain("NO_ACTION_ORACLE");
    expect(MATRIX).toContain("B1_66_ACTION_ORACLE_LEAK");
    expect(MATRIX).toContain("B1_66_MATRIX_FAILED_CASES");
    expect(MATRIX).toContain("REGRESSION_approve_instead_of_configured");
  });
});

describe("68 — executable fail-closed verifiers", () => {
  it("structural verifier raises on every structural violation", () => {
    expect(STRUCTURAL).toContain("\\set ON_ERROR_STOP on");
    for (const failure of [
      "S1_FAIL_NOT_SINGLE_BEGIN", "S1_FAIL_NOT_SINGLE_COMMIT", "S2_FAIL_FUNCTION_COUNT",
      "S2_FAIL_FORBIDDEN_STATEMENT", "S3_FAIL_EXECUTOR_IDENTITY", "S4_FAIL_READER_SEARCH_PATH_COUNT",
      "S5_FAIL_ALIAS_STILL_PRESENT", "S6_FAIL_LITERAL_GUARD_MISSING",
      "S7_FAIL_STUDENT_VISIBLE_MUTATION", "S7_FAIL_PROTECTED_RECORD_REFERENCED",
      "S8_FAIL_ENROLLMENT_CERTIFICATE_TOUCHED", "S9_FAIL_GUARD_MISSING",
      "S10_FAIL_AUTHORIZATION_NOT_BEFORE_ACTION_GUARD",
      "S11_FAIL_SPECIALIZED_ACTION_DELEGATION_MISSING",
    ]) {
      expect(STRUCTURAL).toContain(`RAISE EXCEPTION '${failure}`);
    }
    expect(STRUCTURAL).toContain("B1_66_STRUCTURAL_VERIFIER_PASS");
    // read-only: no automatic remediation inside a verifier
    for (const forbidden of ["CREATE OR REPLACE FUNCTION public.", "UPDATE public.", "DELETE FROM", "INSERT INTO"]) {
      expect(STRUCTURAL).not.toContain(forbidden);
    }
  });

  it("post verifier raises on drift, migration delta and data delta", () => {
    expect(POST).toContain("\\set ON_ERROR_STOP on");
    for (const failure of [
      "V_FAIL_SIGNATURE_DRIFT", "V_FAIL_OWNER_DRIFT", "V_FAIL_SECURITY_DEFINER_DRIFT",
      "V_FAIL_SEARCH_PATH_DRIFT", "V_FAIL_ACL_DRIFT", "V_FAIL_ALIAS_STILL_PRESENT",
      "V_FAIL_LITERAL_GUARD_MISSING", "V_FAIL_AUTHORIZATION_NOT_BEFORE_ACTION_GUARD",
      "V_FAIL_READER_NOT_PUBLISHING_LITERAL_ACTION", "V_FAIL_MIGRATION_DELTA_UNEXPECTED",
      "V_FAIL_DATA_DELTA_STUDENT_REQUESTS", "V_FAIL_DATA_DELTA_RUNTIME_STEPS",
      "V_FAIL_DATA_DELTA_WORKFLOW_EVENTS", "V_FAIL_DATA_DELTA_ACTIVE_STEPS",
      "V_FAIL_STUDENT_VISIBLE_DRIFT", "V_FAIL_ENROLLMENT_CERTIFICATE_IMPACTED",
    ]) {
      expect(POST).toContain(`RAISE EXCEPTION '${failure}`);
    }
    expect(POST).toContain("B1_66_POST_VERIFIER_PASS");
    expect(POST).toContain("V1b_authorization_before_action");
  });

  it("encodes migration delta = 1 and data delta = 0 as hard gates", () => {
    expect(POST).toContain("v_now - b.migration_count <> 1");
    expect(POST).toContain("v_now <> b.student_requests");
    expect(POST).toContain("v_now <> b.runtime_steps");
    expect(POST).toContain("v_now <> b.workflow_events");
    expect(POST).toContain("v_now <> b.active_steps");
  });

  it("keeps the five services hidden and enrollment_certificate protected as gates", () => {
    expect(POST).toContain("V_FAIL_STUDENT_VISIBLE_DRIFT");
    expect(POST).toContain("code = 'enrollment_certificate' AND student_visible IS TRUE");
    expect(MIGRATION).toContain("B1_66_STUDENT_VISIBLE_MUST_REMAIN_FALSE");
  });

  it("leaves specialized actions on their dedicated RPCs", () => {
    expect(MIGRATION).toContain("IF v_action IN ('confirm_payment','issue_document','sign')");
    expect(MIGRATION).toContain("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
  });
});
