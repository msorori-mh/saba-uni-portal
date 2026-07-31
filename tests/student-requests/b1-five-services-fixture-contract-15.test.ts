import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  EXPECTED_BLOCKED_TOTAL,
  EXPECTED_EXECUTABLE_TOTAL,
  EXPECTED_NEGATIVE_TOTAL,
  FIXTURE_HOLD_TOKEN,
  FIXTURE_MARKER,
  MATRIX_SHA256_LF,
} from "../../scripts/b1-rpc-principal-harness-01/render-negative-cases";

const MATRIX_PATH = "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json";
const FIXTURE_SQL = "docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql";
const CLEANUP_SQL =
  "docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-CLEANUP-13.NOT_APPLIED.sql";
const PREFLIGHT = "scripts/b1-rpc-principal-harness-01/00-preflight.sql";

const readLf = (p: string) => readFileSync(p, "utf8").replace(/\r\n/gu, "\n");
const matrix = JSON.parse(readLf(MATRIX_PATH));
const fixtureSql = readLf(FIXTURE_SQL);

const HEAD_IT = "d4aaa5c9-72d1-4996-b0e8-d30c6327da6e";
const HEAD_CS = "97acbe02-c59c-409c-8d51-7d4ef72e6db7";
const HEAD_CIS = "f602b62c-194b-4591-8e9c-956e5cbb347d";
const DEPT_CIS = "22222222-2222-4222-8222-222222222222";

describe("fixture-13 remediation 15 — matrix binding", () => {
  it("keeps the MATRIX sha pinned in the renderer", () => {
    expect(createHash("sha256").update(readLf(MATRIX_PATH)).digest("hex")).toBe(MATRIX_SHA256_LF);
  });

  it("has no blocked cases left", () => {
    expect(EXPECTED_BLOCKED_TOTAL).toBe(0);
    expect(EXPECTED_EXECUTABLE_TOTAL).toBe(EXPECTED_NEGATIVE_TOTAL);
    expect(matrix.counts.execution_blocked).toBe(0);
    expect(matrix.counts.executable_negative_total).toBe(267);
    expect(matrix.blocked_execution.total).toBe(0);
  });

  it("rebinds exactly 22 cases onto deterministic fixtures", () => {
    expect(matrix.fixture_rebind.rebound_cases).toBe(22);
    const rebound = [
      ...matrix.illegal_action_cases,
      ...matrix.supplemental_department_scope_cases,
    ].filter((c: any) => c.legacy_request_number);
    expect(rebound).toHaveLength(22);
    for (const c of rebound) {
      expect(c.request_number).toMatch(/^SR-20260801-13\d{6}$/u);
      expect(c.request_id).toMatch(/^f1300000-0000-4000-8000-\d{12}$/u);
      expect(c.runtime_step_id).toMatch(/^f1300001-0000-4000-8000-\d{12}$/u);
      expect(c.pinned_runtime_status).toBe("active");
      expect(c.blocked_reason).toBeNull();
      expect(matrix.step_state_pins[`${c.request_number}|${c.step_key}`].runtime_status).toBe("active");
    }
  });

  it("models source=IT, target=CS and unrelated=CIS", () => {
    expect(matrix.principals["department/department_head@source"]).toBe(HEAD_IT);
    expect(matrix.principals["department/department_head@target"]).toBe(HEAD_CS);
    expect(matrix.principals["department/department_head@unrelated"]).toBe(HEAD_CIS);
    const unrelated = matrix.supplemental_department_scope_cases.find(
      (c: any) => c.case === "third_department_head_unrelated",
    );
    expect(unrelated.actor_user_id).toBe(HEAD_CIS);
    expect(unrelated.actor_department_id).toBe(DEPT_CIS);
  });

  it("declares 19 fixtures with one active step each", () => {
    expect(matrix.fixture_package.requests).toBe(19);
    expect(matrix.fixture_package.runtime_steps).toBe(104);
    expect(matrix.fixture_package.active_steps).toBe(19);
    expect(matrix.fixture_package.transfer_detail_rows).toBe(5);
    expect(matrix.fixture_package.status).toBe("NOT_APPLIED");
    expect(new Set(matrix.fixture_package.fixtures.map((f: any) => f.active_step_id)).size).toBe(19);
  });
});

describe("fixture-13 remediation 15 — migration draft contract", () => {
  it("stays a NOT_APPLIED draft outside supabase/migrations", () => {
    expect(FIXTURE_SQL.startsWith("docs/migration-drafts/")).toBe(true);
    expect(fixtureSql).toContain("NOT APPLIED");
  });

  it("copies the singular identity kind instead of assigned_user_id only", () => {
    expect(fixtureSql).toContain("v_assignment.staff_profile_id");
    expect(fixtureSql).toContain("v_assignment.faculty_profile_id");
    expect(fixtureSql).toContain("v_assignment.position_assignment_id");
    expect(fixtureSql).toContain("'direct_assignment_id', v_assignment.id");
    expect(fixtureSql).toContain("assert_b1_runtime_step_assignee_effective");
  });

  it("creates transfer details before transfer runtime steps", () => {
    expect(fixtureSql.indexOf("INSERT INTO public.transfer_request_details")).toBeLessThan(
      fixtureSql.indexOf("INSERT INTO public.student_request_workflow_steps"),
    );
  });

  it("uses deterministic ids and never generates random ones in a write", () => {
    const writes = fixtureSql
      .split("\n")
      .filter((l) => /INSERT INTO|VALUES \(|::uuid\)/u.test(l))
      .join("\n");
    expect(writes).not.toMatch(/gen_random_uuid/u);
    expect(fixtureSql).toContain("f1300001-0000-4000-8000-");
    expect(fixtureSql).toContain("f1300002-0000-4000-8000-");
  });

  it("forbids visibility, auth, storage, grant and update statements", () => {
    for (const forbidden of [
      /\bUPDATE\s+public\./iu,
      /\bDELETE\s+FROM\b/iu,
      /^\s*GRANT\b/mu,
      /\bALTER\s+TABLE\b/iu,
      /\bauth\.users\b/u,
      /\bstorage\.objects\b/u,
      /supabase_migrations\.schema_migrations\s+(SET|VALUES)/iu,
    ]) {
      expect(fixtureSql).not.toMatch(forbidden);
    }
  });

  it("has a matching cleanup that removes every fixture artifact", () => {
    const cleanup = readLf(CLEANUP_SQL);
    expect(cleanup).toContain("expected 104");
    expect(cleanup).toContain("expected 19");
    expect(cleanup).toContain("expected 5");
    expect(cleanup).toContain("transfer_request_details");
  });

  it("gates the harness on fixture state", () => {
    const preflight = readLf(PREFLIGHT);
    expect(preflight).toContain(FIXTURE_MARKER);
    expect(preflight).toContain(FIXTURE_HOLD_TOKEN);
  });
});
