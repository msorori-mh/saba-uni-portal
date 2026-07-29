/**
 * PORTAL-B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01
 *
 * SOURCE-ONLY regression guard. The draft migration is NOT applied and is NOT
 * part of supabase/migrations — these tests pin the SQL contract of the draft.
 *
 * Defect: three actor-facing read RPCs probed the authorization gate with the
 * literal action 'approve', so any step configured with a different
 * action_type (e.g. `review` on student_affairs_intake, the step assigned to
 * هيثم الشبلي on SR-20260727-695EC35B) reported is_actionable = false for its
 * exact direct assignee.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DRAFT = join(
  ROOT,
  "docs/migration-drafts/B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql",
);
const VERIFIERS = join(ROOT, "docs/migration-drafts/b1-backend-verifiers");
const PREFIX = "30-B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01";

const sql = readFileSync(DRAFT, "utf8").replace(/\r\n/g, "\n");
// Executable SQL only: the header block documents the defect and therefore
// legitimately mentions terms the code itself must never contain.
const sqlCode = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const fn = (name: string) =>
  sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
      "i",
    ),
  )?.[0] ?? "";

const FIXED_RPCS = [
  "get_my_request_actor_inbox",
  "get_student_request_detail_for_actor",
  "get_student_request_fee_processing_context",
] as const;

describe("B1 actor is_actionable — configured-action source contract", () => {
  it("is a forward-only draft and NOT an applied migration", () => {
    expect(sql).toContain("SOURCE-ONLY");
    expect(sql).toContain("NEVER APPLIED BY THIS PR");
    expect(sql).toContain("FORWARD-ONLY");
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);

    const applied = readdirSync(join(ROOT, "supabase/migrations"));
    expect(
      applied.some((f) =>
        readFileSync(join(ROOT, "supabase/migrations", f), "utf8").includes(
          "workflow_runtime_step_configured_action",
        ),
      ),
    ).toBe(false);
  });

  it("adds the fail-closed configured-action resolver with a stable signature", () => {
    const helper = sql.match(
      /create or replace function public\.workflow_runtime_step_configured_action\([\s\S]*?\$function\$;/i,
    )?.[0];
    expect(helper).toBeDefined();
    expect(helper!).toMatch(/p_step_id\s+uuid/i);
    expect(helper!).toMatch(/returns text/i);
    expect(helper!).toMatch(/stable/i);
    expect(helper!).toMatch(/security definer/i);
    expect(helper!).toMatch(/set search_path to 'public', 'pg_temp'/i);
    expect(helper!).toContain("request_type_workflow_steps");
    // No default, no coalesce to a hard-coded action.
    expect(helper!).not.toMatch(/'approve'/i);
    expect(helper!).not.toMatch(/coalesce\s*\([^)]*'[a-z_]+'\s*\)/i);
  });

  it("revokes helper execute from PUBLIC and anon and grants nothing extra", () => {
    expect(sql).toMatch(
      /revoke all on function public\.workflow_runtime_step_configured_action\(uuid\)\s*\n?\s*from public, anon;/i,
    );
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function[\s\S]*?workflow_runtime_step_configured_action/i);
  });

  it("removes every literal 'approve' probe from the actor-facing RPCs", () => {
    for (const name of FIXED_RPCS) {
      const body = fn(name);
      expect(body).not.toBe("");
      expect(body).not.toMatch(/can_current_user_act_on_step\s*\([^)]*'approve'/i);
    }
    expect(sql).not.toMatch(/can_current_user_act_on_step\s*\([^)]*'approve'/i);
  });

  it("probes the configured action_type and fails closed when it is NULL", () => {
    for (const name of ["get_my_request_actor_inbox", "get_student_request_detail_for_actor"]) {
      const body = fn(name);
      expect(body).toMatch(
        /public\.workflow_runtime_step_configured_action\(s\.id\)\s+IS NOT NULL/i,
      );
      expect(body).toMatch(
        /can_current_user_act_on_step\(\s*\n?\s*s\.id,\s*\n?\s*public\.workflow_runtime_step_configured_action\(s\.id\)/i,
      );
      expect(body).toMatch(/s\.status = 'active'/);
    }
    const fee = fn("get_student_request_fee_processing_context");
    expect(fee).toMatch(/v_config\.action_type IS NOT NULL/i);
    expect(fee).toMatch(
      /can_current_user_act_on_step\(v_runtime\.id, v_config\.action_type\)/i,
    );
  });

  it("introduces no role bypass in the two pure actor RPCs", () => {
    for (const name of ["get_my_request_actor_inbox", "get_student_request_detail_for_actor"]) {
      const body = fn(name);
      expect(body).not.toMatch(/has_role|has_any_role|is_current_user_admin_actor/i);
      expect(body).not.toMatch(/'(admin|system_admin|registrar|dean|finance_officer)'/i);
    }
    // The pre-existing display-only admin clause in the fee context is
    // preserved verbatim and never widened.
    const fee = fn("get_student_request_fee_processing_context");
    expect((fee.match(/is_current_user_admin_actor\(\)/g) ?? []).length).toBe(1);
  });

  it("does not modify the authorization gate or any other guard function", () => {
    expect(sql).not.toMatch(
      /create or replace function public\.can_current_user_act_on_step/i,
    );
    expect(sql).not.toMatch(
      /create or replace function public\.user_matches_workflow_runtime_step/i,
    );
    expect(sql).not.toMatch(
      /create or replace function public\.current_user_has_exact_processing_binding/i,
    );
  });

  it("contains no DML, no student_visible change, no workflow activation", () => {
    expect(sqlCode).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from)\b/i);
    expect(sqlCode).not.toMatch(/student_visible/i);
    expect(sqlCode).not.toMatch(/\bdrop\s+(function|table|policy)\b/i);
    expect(sqlCode).not.toMatch(/\bgrant\s+/i);
  });

  it("preserves the untouched contract of each rewritten RPC", () => {
    const inbox = fn("get_my_request_actor_inbox");
    expect(inbox).toContain("public.user_matches_workflow_runtime_step(s.id)");
    expect(inbox).toContain("GREATEST(LEAST(COALESCE(p_limit,  50), 200), 1)");
    expect(inbox).toContain("ARRAY['pending', 'active']");

    const detail = fn("get_student_request_detail_for_actor");
    expect(detail).toContain("public.can_current_user_access_request(p_request_id)");
    expect(detail).toContain("'42501'");
    expect(detail).toContain("'P0002'");

    const fee = fn("get_student_request_fee_processing_context");
    expect(fee).toContain("payment_status <> 'cancelled'");
    expect(fee).toContain("'can_execute_current_step'");
  });
});

describe("B1 actor is_actionable — verifier package", () => {
  const files = {
    preflight: join(VERIFIERS, `${PREFIX}-PREFLIGHT.sql`),
    structural: join(VERIFIERS, `${PREFIX}-STRUCTURAL-VERIFIER.sql`),
    post: join(VERIFIERS, `${PREFIX}-POST-VERIFIER.sql`),
  };

  it("ships preflight, structural verifier and post-verifier", () => {
    for (const path of Object.values(files)) expect(existsSync(path)).toBe(true);
  });

  it("is strictly read-only in every verifier", () => {
    for (const path of Object.values(files)) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from|create\s+(or\s+replace\s+)?function|alter\s+table|drop\s+)/i);
    }
  });

  it("preflight proves the defect and snapshots the invariants", () => {
    const text = readFileSync(files.preflight, "utf8");
    expect(text).toContain("PASS_DEFECT_PRESENT");
    expect(text).toContain("SR-20260727-695EC35B");
    expect(text).toContain("supabase_migrations.schema_migrations");
    expect(text).toContain("workflow_runtime_step_configured_action");
  });

  it("structural verifier gates fail-closed shape, ACL and absence of bypass", () => {
    const text = readFileSync(files.structural, "utf8");
    expect(text).toContain("FAIL_HELPER_SIGNATURE");
    expect(text).toContain("FAIL_DEFAULT_APPROVE");
    expect(text).toContain("FAIL_PUBLIC_EXECUTE");
    expect(text).toContain("FAIL_LITERAL_ACTION_REMAINS");
    expect(text).toContain("FAIL_NOT_FAIL_CLOSED");
    expect(text).toContain("FAIL_ROLE_BYPASS_INTRODUCED");
  });

  it("post-verifier proves resolver correctness and zero mutation", () => {
    const text = readFileSync(files.post, "utf8");
    expect(text).toContain("FAIL_RESOLVER_MISMATCH");
    expect(text).toContain("FAIL_RESOLVER_DRIFT");
    expect(text).toContain("SR-20260727-695EC35B");
    for (const relation of [
      "student_requests",
      "student_request_workflow_steps",
      "student_request_workflow_events",
      "student_request_fee_assessments",
      "payment_receipts",
      "official_documents",
      "student_excused_absences",
    ]) {
      expect(text).toContain(relation);
    }
  });
});

describe("Haitham regression — action_type = 'review'", () => {
  it("an is_actionable probe built from the configured action covers 'review'", () => {
    // The old probe asked the gate about 'approve' on a step configured as
    // 'review'; the new probe asks about exactly what is configured, so a
    // 'review' step is actionable for its exact direct assignee and for
    // nobody else (authorization still lives in the untouched gate).
    const detail = fn("get_student_request_detail_for_actor");
    expect(detail).not.toContain("'approve'");
    expect(detail).toContain("public.workflow_runtime_step_configured_action(s.id)");

    const inbox = fn("get_my_request_actor_inbox");
    expect(inbox).not.toContain("'approve'");
    expect(inbox).toContain("public.workflow_runtime_step_configured_action(s.id)");
  });

  it("does not special-case any request, step key or user", () => {
    expect(sqlCode).not.toMatch(/SR-2026|hitham|06f48015|c8a94548/i);
    expect(sqlCode).not.toMatch(/student_affairs_intake/i);
  });
});
