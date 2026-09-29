import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignmentCandidateKey, validateAssignmentIdentity } from "../../src/lib/processing-assignment-identity.ts";
import { loadCouncilFacultyEmails } from "../../src/lib/council-faculty-directory.server.ts";
import { staffFunctionalRoleToAppRole, staffRoleTypeSupportsLogin } from "../../src/lib/staff-functional-roles.ts";

describe("assignment identity", () => {
  const selected = { user_id: "user-a", profile_id: "staff-a", profile_kind: "staff" as const };
  it("distinguishes staff/faculty profiles even with the same user or UUID", () => {
    assert.notEqual(assignmentCandidateKey({ kind: "staff", profile_id: "same" }),
      assignmentCandidateKey({ kind: "faculty", profile_id: "same" }));
  });
  it("accepts only the selected active profile and current linked user", () => {
    assert.doesNotThrow(() => validateAssignmentIdentity(selected,
      { id: "staff-a", user_id: "user-a", status: "active" }));
    for (const profile of [
      null,
      { id: "staff-b", user_id: "user-a", status: "active" },
      { id: "staff-a", user_id: "user-b", status: "active" },
      { id: "staff-a", user_id: null, status: "active" },
      { id: "staff-a", user_id: "user-a", status: "inactive" },
    ]) assert.throws(() => validateAssignmentIdentity(selected, profile));
  });
  it("validates on the server before insertion and has no user-only fallback", () => {
    const source = readFileSync(new URL("../../src/lib/admin-processing-assignments.functions.ts", import.meta.url), "utf8");
    const create = source.slice(source.indexOf("export const createProcessingAssignment"), source.indexOf("export const deactivateProcessingAssignment"));
    assert.ok(create.indexOf("assertProcessingAssignmentAdmin(context.userId)") < create.indexOf("validateAssignmentIdentity(data, selectedProfile)"));
    assert.ok(create.indexOf("validateAssignmentIdentity(data, selectedProfile)") < create.indexOf(".insert({"));
    assert.ok(create.includes('.eq("id", data.profile_id)'));
    assert.ok(create.includes("if (profileErr) throw"));
    assert.ok(!create.includes('assignmentType = "user"'));
  });
});

describe("council email enrichment", () => {
  it("queries only unique faculty IDs from RLS-visible profiles", async () => {
    const calls: unknown[] = [];
    const client = { from(table: string) {
      calls.push(table);
      return { select(columns: string) {
        calls.push(columns);
        return { async in(column: string, ids: string[]) {
          calls.push([column, ids]);
          return { data: [{ id: "visible", email: "test@example.invalid" }], error: null };
        } };
      } };
    } };
    const result = await loadCouncilFacultyEmails(client as never,
      [{ faculty_id: "visible" }, { faculty_id: null }, { faculty_id: "visible" }]);
    assert.deepEqual(calls, ["faculty", "id, email", ["id", ["visible"]]]);
    assert.equal(result.get("visible"), "test@example.invalid");
    assert.equal(result.has("hidden"), false);
  });
  it("does not query the private directory when RLS returns no profiles", async () => {
    const client = { from() { throw new Error("must not query"); } };
    assert.equal((await loadCouncilFacultyEmails(client as never, [])).size, 0);
  });
  it("reports a failed private lookup instead of pretending there is no email", async () => {
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "denied" } }) }) }) };
    await assert.rejects(loadCouncilFacultyEmails(client as never, [{ faculty_id: "visible" }]));
  });
  it("retains manager gates and caller RLS for membership/profile operations", () => {
    const source = readFileSync(new URL("../../src/lib/admin-councils.functions.ts", import.meta.url), "utf8");
    assert.ok(!source.includes("faculty:faculty_id(email)"));
    for (const name of ["getCouncilMemberships", "searchAcademicsForCouncilLink", "linkAcademicToCouncil"]) {
      // Slice past the declaration so the next exported function bounds the check.
      const body = source.slice(source.indexOf(`export const ${name}`) + 13).split("export const ")[0];
      assert.ok(body.includes("await assertCouncilsMembershipManager(context.userId)"));
      assert.ok(body.includes("const sb = context.supabase"));
    }
  });
});

describe("profile-only staff logins", () => {
  for (const role of ["library_officer", "labs_manager", "lab_custodian"]) {
    it(`${role} can sign in without inheriting a broad legacy role`, () => {
      assert.equal(staffRoleTypeSupportsLogin(role), true);
      assert.equal(staffFunctionalRoleToAppRole(role), null);
    });
  }
  it("rejects unapproved roles and preserves existing approved mappings", () => {
    assert.equal(staffRoleTypeSupportsLogin("unknown"), false);
    assert.equal(staffRoleTypeSupportsLogin(""), false);
    assert.equal(staffFunctionalRoleToAppRole("registrar_general"), "registrar");
    assert.equal(staffFunctionalRoleToAppRole("revenue_finance_officer"), "finance_officer");
  });
  it("account create/restore never defaults an unmapped staff role to registrar", () => {
    const source = readFileSync(new URL("../../src/lib/admin-users.functions.ts", import.meta.url), "utf8");
    const mapping = source.slice(source.indexOf("function staffRoleFor"), source.indexOf("function catalogCodeForAccount"));
    assert.ok(!mapping.includes('"registrar"'));
    assert.ok(source.includes('if (kind === "student" || !appRole) return null;'));
    assert.ok(source.includes("if (!role) continue;"));
  });
});
