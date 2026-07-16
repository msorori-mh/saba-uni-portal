/**
 * REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01 — source-only guards.
 *
 * Verifies:
 *   1. The migration DRAFT (not yet applied) is additive-only, idempotent, and
 *      touches exactly the units/roles/assignments the phase describes.
 *   2. It never introduces a `student_activities` unit/role.
 *   3. It never mutates user_roles.
 *   4. The production authorization functions
 *      (user_matches_workflow_runtime_step / can_current_user_act_on_step)
 *      do NOT consult user_roles — so a stale user_roles row cannot bypass
 *      request_processing_assignments. This is validated at source level by
 *      grepping the applied migrations (the functions live in
 *      supabase/migrations/*).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DRAFT = readFileSync(
  join(ROOT, "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql"),
  "utf-8",
);

describe("processing-domains expansion draft — additive-only", () => {
  it("adds exactly the four new units", () => {
    for (const code of ["library", "labs", "graduate_affairs", "department"]) {
      expect(DRAFT).toContain(`'${code}'`);
    }
    expect(DRAFT).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
  });

  it("adds exactly the five new roles", () => {
    for (const code of [
      "library_officer",
      "labs_manager",
      "graduate_affairs_manager",
      "graduate_affairs_specialist",
      "department_head",
    ]) {
      expect(DRAFT).toContain(`'${code}'`);
    }
    expect(DRAFT).toMatch(/ON CONFLICT \(unit_id, code\) DO NOTHING/);
  });

  // Strip SQL comments so guarantees written in the header don't create false
  // matches; we only care about the actual DDL/DML statements.
  const CODE = DRAFT.replace(/--[^\n]*\n/g, "\n");

  it("never introduces a student_activities unit or role", () => {
    expect(CODE).not.toMatch(/student_activities/i);
  });

  it("never mutates user_roles", () => {
    expect(CODE).not.toMatch(/\buser_roles\b/i);
  });

  it("never touches enrollment_certificate workflow, requests, documents or fees", () => {
    expect(CODE).not.toMatch(/enrollment_certificate/i);
    expect(CODE).not.toMatch(/student_requests\b/i);
    expect(CODE).not.toMatch(/official_documents\b/i);
    expect(CODE).not.toMatch(/fee_types\b/i);
    expect(CODE).not.toMatch(/\b(DROP|DELETE|UPDATE)\b/i);
  });

  it("assigns each of the four staff-profile roles with NOT EXISTS idempotency", () => {
    for (const spId of [
      "4a838311-0ab7-4033-8e0c-69327d522bc7", // ناجي الروقي
      "b59e6e45-260d-4af6-b312-85381d354104", // محمد حيدر
      "f463a79b-65be-4a94-8003-1c9a2727b88f", // محمد شوقي
      "aa4f5c16-c993-4af6-a6d4-59d9542c1a7f", // صالح علي
    ]) {
      expect(DRAFT).toContain(spId);
    }
    expect(DRAFT).toMatch(/assignment_type\s*=\s*'staff_profile'/);
    expect(DRAFT).toMatch(/WHERE NOT EXISTS/);
  });

  it("assigns exactly the three verified department chairs, each scoped to their own department", () => {
    for (const fpId of [
      "d08a8509-4c04-472e-885f-053a80be12ec",
      "6f9f004d-c5f6-4dfe-b212-7f79ce8658e3",
      "c1fe6084-e594-482e-a178-ac8eaffed376",
    ]) {
      expect(DRAFT).toContain(fpId);
    }
    // department_id copied from faculty_profiles.department_id — never hardcoded
    expect(DRAFT).toMatch(/fp\.department_id/);
    expect(DRAFT).toMatch(/assignment_type\s*=\s*'faculty_profile'/);
  });
});

describe("user_roles is not a bypass for workflow step authorization", () => {
  // The two SECURITY DEFINER functions that gate every staff action on a
  // request step. If either one starts consulting user_roles, this test
  // fails and the phase must HOLD.
  const migrationsDir = join(ROOT, "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(migrationsDir, f), "utf-8"));

  function latestDefinition(name: string): string {
    // Walk newest → oldest so we compare against the version currently applied.
    const sorted = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .reverse();
    for (const f of sorted) {
      const body = readFileSync(join(migrationsDir, f), "utf-8");
      const re = new RegExp(
        String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.` +
          name +
          String.raw`\b[\s\S]*?\$function\$[\s\S]*?\$function\$`,
        "i",
      );
      const m = body.match(re);
      if (m) return m[0];
    }
    return "";
  }

  it("user_matches_workflow_runtime_step never references user_roles", () => {
    // Guard: not a single migration adds this function with a user_roles read.
    for (const body of files) {
      const blocks =
        body.match(
          /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.user_matches_workflow_runtime_step[\s\S]*?(\$function\$|\$\$;)/gi,
        ) ?? [];
      for (const b of blocks) {
        expect(b).not.toMatch(/\buser_roles\b/i);
      }
    }
  });

  it("can_current_user_act_on_step never references user_roles", () => {
    for (const body of files) {
      const blocks =
        body.match(
          /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.can_current_user_act_on_step[\s\S]*?(\$function\$|\$\$;)/gi,
        ) ?? [];
      for (const b of blocks) {
        expect(b).not.toMatch(/\buser_roles\b/i);
      }
    }
  });

  it("no admin / registrar / dean bypass in the two gating functions", () => {
    for (const name of [
      "user_matches_workflow_runtime_step",
      "can_current_user_act_on_step",
    ] as const) {
      const def = latestDefinition(name);
      expect(def).not.toMatch(/has_role\s*\(/i);
      expect(def).not.toMatch(/has_any_role\s*\(/i);
      expect(def).not.toMatch(/'admin'|'system_admin'|'registrar'|'dean'/i);
    }
  });

  it("both gating functions early-return false when auth.uid() is null", () => {
    for (const name of [
      "user_matches_workflow_runtime_step",
      "can_current_user_act_on_step",
    ] as const) {
      const def = latestDefinition(name);
      expect(def).toMatch(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
      expect(def).toMatch(/IF\s+v_uid\s+IS\s+NULL[\s\S]*?RETURN\s+false/i);
    }
  });
});
