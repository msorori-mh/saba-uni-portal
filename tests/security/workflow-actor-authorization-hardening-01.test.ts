/**
 * STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING-DEAN-SCOPE-CORRECTION-01
 *
 * Source-only tests. The DB is NOT migrated in this phase. These
 * assertions inspect the draft SQL and confirm:
 *   - Every bypass identified in the audit is removed.
 *   - Direct assignee columns absolutely block fallback on mismatch.
 *   - The fallback enforces (unit + role + assignment_type + identity + active window).
 *   - Dean scope is proven ONLY through request_processing_assignments
 *     on the canonical unit_code='dean' / role_code='dean' pair — no
 *     references to organizational_positions.department_id or
 *     departments.parent_department_id (columns that do NOT exist).
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

describe("schema-safety: executable SQL does not touch non-existent columns", () => {
  // Only inspect function bodies (executable SQL), not header/comment prose.
  const bodies = [
    "user_matches_workflow_runtime_step",
    "is_current_user_dean_for_student",
    "get_my_request_actor_inbox",
    "can_current_user_act_on_step",
  ].map(fnBody).join("\n");

  it("does not reference organizational_positions.department_id", () => {
    expect(bodies).not.toMatch(/organizational_positions[\s\S]{0,80}department_id/i);
    expect(bodies).not.toMatch(/\bop\.department_id\b/);
  });

  it("does not reference departments.parent_department_id or any parent_department_id", () => {
    expect(bodies).not.toMatch(/parent_department_id/);
  });

  it("does not reference an invented college_id column", () => {
    expect(bodies).not.toMatch(/\bcollege_id\b/);
  });
});

describe("user_matches_workflow_runtime_step — strict assignee match", () => {
  const body = fnBody("user_matches_workflow_runtime_step");

  it("removes the registrar/admin/dean universal bypass", () => {
    expect(body).not.toMatch(/is_current_user_registrar\s*\(/);
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
    expect(body).not.toMatch(/has_any_role\s*\(/);
    expect(body).not.toMatch(/is_current_user_dean_for_student\s*\(/);
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

  it("returns false immediately when any direct assignee is set but does not match", () => {
    // v_has_direct_assignee gate exists and returns false without fallback.
    expect(body).toMatch(/v_has_direct_assignee\s*:=\s*true/);
    expect(body).toMatch(
      /IF\s+v_has_direct_assignee\s+THEN[\s\S]{0,60}RETURN\s+false/i,
    );
  });

  it("rejects unit-only or role-only fallback", () => {
    expect(body).toMatch(
      /processing_unit_id\s+IS\s+NULL\s+OR\s+v_step\.processing_role_id\s+IS\s+NULL[\s\S]{0,120}RETURN\s+false/i,
    );
    expect(body).toMatch(/rpa\.unit_id\s*=\s*v_step\.processing_unit_id/);
    expect(body).toMatch(/rpa\.role_id\s*=\s*v_step\.processing_role_id/);
  });

  it("enforces assignment_type explicitly in fallback", () => {
    expect(body).toMatch(/assignment_type\s*=\s*'user'/);
    expect(body).toMatch(/assignment_type\s*=\s*'staff_profile'/);
    expect(body).toMatch(/assignment_type\s*=\s*'faculty_profile'/);
    expect(body).toMatch(/assignment_type\s*=\s*'position_assignment'/);
  });

  it("enforces the active window on the fallback assignment", () => {
    expect(body).toMatch(/rpa\.is_active\s*=\s*true/);
    expect(body).toMatch(/rpa\.starts_at\s+IS\s+NULL\s+OR\s+rpa\.starts_at\s*<=\s*now\(\)/i);
    expect(body).toMatch(/rpa\.ends_at\s+IS\s+NULL\s+OR\s+rpa\.ends_at\s*>\s*now\(\)/i);
  });
});

describe("is_current_user_dean_for_student — dean via request_processing_assignments only", () => {
  const body = fnBody("is_current_user_dean_for_student");

  it("preserves the (uuid) signature for backward compatibility", () => {
    expect(body).toMatch(
      /is_current_user_dean_for_student\(p_student_profile_id\s+uuid\)/,
    );
  });

  it("removes has_any_role / user_roles / admin-registrar overrides", () => {
    expect(body).not.toMatch(/has_any_role\s*\(/);
    expect(body).not.toMatch(/user_roles/);
    expect(body).not.toMatch(/is_current_user_registrar\s*\(/);
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
  });

  it("proves dean authority ONLY through canonical dean unit + dean role", () => {
    expect(body).toMatch(/request_processing_assignments/);
    expect(body).toMatch(/request_processing_roles/);
    expect(body).toMatch(/request_processing_units/);
    expect(body).toMatch(/rpr\.code\s*=\s*'dean'/);
    expect(body).toMatch(/rpu\.code\s*=\s*'dean'/);
  });

  it("enforces active + starts_at/ends_at window", () => {
    expect(body).toMatch(/rpa\.is_active\s*=\s*true/);
    expect(body).toMatch(/rpa\.starts_at\s+IS\s+NULL\s+OR\s+rpa\.starts_at\s*<=\s*now\(\)/i);
    expect(body).toMatch(/rpa\.ends_at\s+IS\s+NULL\s+OR\s+rpa\.ends_at\s*>\s*now\(\)/i);
  });

  it("enforces assignment_type resolution matching actor identity strictly", () => {
    expect(body).toMatch(/assignment_type\s*=\s*'user'/);
    expect(body).toMatch(/assignment_type\s*=\s*'staff_profile'/);
    expect(body).toMatch(/assignment_type\s*=\s*'faculty_profile'/);
    expect(body).toMatch(/assignment_type\s*=\s*'position_assignment'/);
  });

  it("refuses when the student profile cannot be resolved", () => {
    expect(body).toMatch(
      /NOT\s+EXISTS[\s\S]{0,120}student_profiles[\s\S]{0,80}RETURN\s+false/i,
    );
  });

  it("documents that multi-college scope is out of scope for this hardening", () => {
    expect(body).toMatch(/single-college/i);
    expect(body).toMatch(/multi-college/i);
  });
});

describe("get_my_request_actor_inbox — strict visibility", () => {
  const body = fnBody("get_my_request_actor_inbox");

  it("does not include steps just because the caller is registrar/admin/dean", () => {
    expect(body).not.toMatch(/is_current_user_registrar\s*\(/);
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
    expect(body).not.toMatch(/is_current_user_dean_for_student\s*\(/);
    expect(body).not.toMatch(/has_any_role\s*\(/);
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

describe("can_current_user_act_on_step — no admin/registrar/dean bypass", () => {
  const body = fnBody("can_current_user_act_on_step");

  it("removes admin/registrar/dean shortcuts", () => {
    expect(body).not.toMatch(/is_current_user_admin_actor\s*\(/);
    expect(body).not.toMatch(/is_current_user_registrar\s*\(/);
    expect(body).not.toMatch(/is_current_user_dean_for_student\s*\(/);
    expect(body).not.toMatch(/has_any_role\s*\(/);
  });

  it("always requires user_matches_workflow_runtime_step for actionable steps", () => {
    const idxGate = body.indexOf("user_matches_workflow_runtime_step");
    expect(idxGate).toBeGreaterThan(-1);
  });

  it("blocks the request owner from acting on their own step", () => {
    expect(body).toMatch(/is_owner_of_request\(\s*v_uid\s*,/);
  });
});

describe("issuance and archive contracts inherit the strict gate", () => {
  it("draft does NOT redefine issue/archive functions", () => {
    expect(DRAFT).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.issue_enrollment_certificate_from_workflow_step/i,
    );
    expect(DRAFT).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.archive_enrollment_certificate_from_workflow_step/i,
    );
  });

  it("draft does NOT redefine act_on_student_request_step", () => {
    expect(DRAFT).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.act_on_student_request_step/i,
    );
  });

  it("documents that hardening propagates through the shared gate", () => {
    expect(DRAFT).toMatch(/transitively covers document issuance and archive/i);
  });
});
