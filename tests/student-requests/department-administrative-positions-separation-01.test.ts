import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const root = process.cwd();
const read = (name: string) =>
  readFileSync(join(root, "docs/migration-drafts", name), "utf8");
const forward = read("DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01.sql");
const atomic = read("REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql");
const authz = forward;
const appliedMigration2 = read("STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql");
const safeDisable = read("DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01-ROLLBACK-BY-FORWARD.sql");

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

  it("keeps applied Migration 2 byte-identical", () => {
    const normalized = appliedMigration2.replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(normalized).digest("hex")).toBe(
      "0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0",
    );
  });

  it("authorizes transfer chair scope through the direct administrative position", () => {
    expect(authz).toContain("s.assigned_position_assignment_id");
    expect(authz).toMatch(/rpa\.department_id\s*=\s*d\.current_department_id/);
    expect(authz).toMatch(/rpa\.department_id\s*=\s*d\.requested_department_id/);
    expect(authz).not.toMatch(/fp\.department_id\s*=\s*d\.(current|requested)_department_id/);
    expect(authz).not.toMatch(/has_any_role[\s\S]{0,120}(admin|registrar|dean)/i);
    expect(authz).toContain("REVOKE ALL ON FUNCTION");
  });

  it("creates chair runtime with position assignment, never faculty assignment", () => {
    expect(atomic).toContain("a.assignment_type='position_assignment'");
    expect(atomic).toContain("a.faculty_profile_id IS NULL");
    expect(atomic).not.toContain("v_department_id IS NOT NULL)");
  });

  it("locks, recognizes only known states, and never broadly disables chair rows", () => {
    expect(forward).toContain("pg_advisory_xact_lock");
    expect(forward).toContain("KNOWN_LEGACY_PRESTATE");
    expect(forward).toContain("EXACT_FINAL_STATE");
    expect(forward).toContain("UNEXPECTED_STATE");
    expect(forward).toContain("7ab0b14f-9007-40d6-9aaf-f1cba454ac8f");
    expect(forward).not.toMatch(
      /update\s+public\.request_processing_assignments[\s\S]{0,250}assignment_type\s*=\s*'faculty_profile'(?![\s\S]{0,120}\bid\s+in)/i,
    );
  });

  it("safe-disable preserves history and leaves transfer authorization fail closed", () => {
    expect(safeDisable).not.toMatch(/\bdelete\b/i);
    expect(safeDisable).not.toMatch(/update\s+public\.faculty_profiles/i);
    expect(safeDisable).not.toMatch(/update\s+public\.request_types/i);
    expect(safeDisable).not.toMatch(
      /update\s+public\.request_type_workflows/i,
    );
    expect(safeDisable).toContain("SELECT false");
    expect(safeDisable).toContain("SAFE_DISABLE_TRANSFER_REQUEST_TYPE_VISIBLE");
    expect(safeDisable).toContain("SAFE_DISABLE_ACTIVE_TRANSFER_WORKFLOW_EXISTS");
    expect(safeDisable).toContain("SAFE_DISABLE_EXECUTABLE_TRANSFER_RUNTIME_EXISTS");
    expect(safeDisable).toContain(
      "SAFE_DISABLE_AUTHORIZATION_FUNCTION_NOT_FAIL_CLOSED",
    );
    expect(safeDisable).toContain(
      "SAFE_DISABLE_ACTIVE_CHAIR_PROCESSING_ASSIGNMENT_REMAINS",
    );
    expect(safeDisable).not.toMatch(/student_visible\s+OR\s+is_active/i);
    expect(safeDisable).toMatch(
      /FROM\s+public\.request_types\s+WHERE\s+code\s+IN\s*\('department_transfer','transfer'\)\s+AND\s+student_visible/i,
    );
  });
});
