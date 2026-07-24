import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (name: string) =>
  readFileSync(join(root, "docs/migration-drafts", name), "utf8");
const forward = read("DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01.sql");
const atomic = read("REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql");
const authz = read("STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql");

describe("department administrative position separation", () => {
  it("keeps both historical packages quarantined", () => {
    for (const name of [
      "DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql",
      "DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02.sql",
    ]) {
      expect(read(name)).toContain("NEVER_APPLY — SEMANTICALLY_INVALID");
      expect(existsSync(join(root, "supabase/migrations", name))).toBe(false);
    }
  });

  it("never changes academic affiliation in the replacement package", () => {
    expect(forward).not.toMatch(/update\s+public\.faculty_profiles/i);
    expect(forward).toContain("position_assignments");
    expect(forward).toContain("assignment_type='position_assignment'");
  });

  it("authorizes transfer chair scope through the direct administrative position", () => {
    expect(authz).toContain("s.assigned_position_assignment_id");
    expect(authz).toContain("rpa.department_id = d.current_department_id");
    expect(authz).toContain("rpa.department_id = d.requested_department_id");
    expect(authz).not.toMatch(/fp\.department_id\s*=\s*d\.(current|requested)_department_id/);
    expect(authz).not.toMatch(/has_any_role[\s\S]{0,120}(admin|registrar|dean)/i);
  });

  it("creates chair runtime with position assignment, never faculty assignment", () => {
    expect(atomic).toContain("a.assignment_type='position_assignment'");
    expect(atomic).toContain("a.faculty_profile_id IS NULL");
    expect(atomic).not.toContain("v_department_id IS NOT NULL)");
  });
});
