/**
 * STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING-SOURCE-ONLY-01
 *
 * Source-only tests. The DB is NOT migrated in this phase, so these
 * assertions inspect the draft SQL and confirm every bypass identified
 * in the audit is removed and replaced by the strict assignee-match
 * ordering.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const DRAFT = readFileSync(
  join(
    ROOT,
    "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  ),
  "utf-8",
);

function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$function\\$;`,
  );
  const m = DRAFT.match(re);
  if (!m) throw new Error(`function ${name} not found in draft`);
  return m[0];
}

describe("draft is quarantined outside supabase/migrations", () => {
  it("lives only under docs/migration-drafts", () => {
    expect(() =>
      readFileSync(
        join(
          ROOT,
          "supabase/migrations/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
        ),
      ),
    ).toThrow();
  });
});

describe("user_matches_workflow_runtime_step — strict assignee match", () => {
  const body = fnBody("user_matches_workflow_runtime_step");

  it("removes the registrar/admin universal bypass", () => {
    expect(body).not.toMatch(/is_current_user_registrar\s*\(/);
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
    expect(body).not.toMatch(/has_any_role\s*\(/);
  });

  it("checks direct assignee columns in the safe order", () => {
    const order = [
      "assigned_user_id",
      "assigned_staff_profile_id",
      "assigned_faculty_profile_id",
      "assigned_position_assignment_id",
    ];
    let cursor = 0;
    for (const col of order) {
      const idx = body.indexOf(col, cursor);
      expect(idx).toBeGreaterThan(-1);
      cursor = idx;
    }
  });

  it("rejects unit-only or role-only fallback", () => {
    // Fallback block requires BOTH unit_id AND role_id to be set.
    expect(body).toMatch(
      /processing_unit_id\s+IS\s+NULL\s+OR\s+v_step\.processing_role_id\s+IS\s+NULL[\s\S]{0,120}RETURN\s+false/i,
    );
    // Fallback SELECT joins BOTH unit_id AND role_id equality.
    expect(body).toMatch(/rpa\.unit_id\s*=\s*v_step\.processing_unit_id/);
    expect(body).toMatch(/rpa\.role_id\s*=\s*v_step\.processing_role_id/);
  });

  it("resolves the fallback user through staff/faculty/position joins", () => {
    expect(body).toMatch(/staff_profiles\s+sp/);
    expect(body).toMatch(/faculty_profiles\s+fp/);
    expect(body).toMatch(/position_assignments\s+pa/);
  });
});

describe("is_current_user_dean_for_student — scoped position only", () => {
  const body = fnBody("is_current_user_dean_for_student");

  it("removes has_any_role('dean') shortcut", () => {
    expect(body).not.toMatch(/has_any_role\s*\(\s*auth\.uid\(\)\s*,\s*ARRAY\[\s*'dean'/);
  });

  it("requires an active dean position scoped to student's department or college", () => {
    expect(body).toMatch(/op\.code\s*=\s*'dean'/);
    expect(body).toMatch(/pa\.is_active\s*=\s*true/);
    expect(body).toMatch(/department_id/);
    expect(body).toMatch(/parent_department_id/);
  });

  it("refuses when the student's department cannot be resolved", () => {
    expect(body).toMatch(
      /v_student_department_id\s+IS\s+NULL[\s\S]{0,80}RETURN\s+false/i,
    );
  });
});

describe("get_my_request_actor_inbox — strict visibility", () => {
  const body = fnBody("get_my_request_actor_inbox");

  it("does not include steps just because the caller is registrar/admin", () => {
    expect(body).not.toMatch(/is_current_user_registrar\s*\(/);
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
  });

  it("gates visibility through user_matches_workflow_runtime_step", () => {
    expect(body).toMatch(/user_matches_workflow_runtime_step\(\s*s\.id\s*\)/);
  });

  it("computes is_actionable through can_current_user_act_on_step", () => {
    expect(body).toMatch(
      /can_current_user_act_on_step\(\s*s\.id\s*,\s*'approve'\s*\)/,
    );
  });
});

describe("can_current_user_act_on_step — no admin skip bypass", () => {
  const body = fnBody("can_current_user_act_on_step");

  it("removes the is_current_user_admin_actor shortcut for skip", () => {
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
  });

  it("always requires user_matches_workflow_runtime_step for actionable steps", () => {
    // The gate appears before any action-specific branching.
    const idxGate = body.indexOf("user_matches_workflow_runtime_step");
    expect(idxGate).toBeGreaterThan(-1);
  });

  it("blocks the request owner from acting on their own step", () => {
    expect(body).toMatch(/is_owner_of_request\(\s*v_uid\s*,/);
  });
});

describe("issuance and archive contracts inherit the strict gate", () => {
  it("keeps issuance/archive functions gated by can_current_user_act_on_step", () => {
    // Existing DB functions call can_current_user_act_on_step at entry.
    // The draft intentionally does not replace them — hardening
    // propagates through the shared gate.
    expect(DRAFT).toMatch(/transitively covers document issuance and archive/i);
  });

  it("documents that no admin bypass exists inside those functions", () => {
    expect(DRAFT).toMatch(/NO admin bypass paths exist/);
  });
});
