/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01 — authorization & fail-closed contract.
 *
 * Hiding a button is not security: the pause is enforced in the database and
 * in the server functions. Only admin | system_admin can flip the switch; no
 * role can bypass the pause for its own request.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stripSqlComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

const draft = stripSqlComments(read("docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.sql"));
const cases = read("scripts/student-services-global-switch-01-pg17/01-cases.sql");

describe("switch write path", () => {
  it("anon can execute nothing; authenticated only the RPCs; the guards are not callable", () => {
    for (const signature of [
      "public.student_services_enabled()",
      "public.get_student_services_status()",
      "public.admin_get_student_services_switch()",
      "public.admin_set_student_services_enabled(boolean, text)",
    ]) {
      expect(draft).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon;`);
    }
    expect(draft).toContain(
      "REVOKE ALL ON FUNCTION public.guard_student_services_switch() FROM PUBLIC, anon, authenticated;",
    );
    expect(draft).toContain(
      "REVOKE ALL ON FUNCTION public.guard_student_services_switch_row() FROM PUBLIC, anon, authenticated;",
    );
    expect(draft).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*\banon\b/);
    expect(draft).not.toMatch(/GRANT[^;]*TO PUBLIC/);
  });

  it("the table has no write path except the admin RPC", () => {
    const writes = [...draft.matchAll(/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.student_services_switch/g)];
    // the seed + the upsert inside admin_set_student_services_enabled
    expect(writes.length).toBe(2);
    const admin = draft.slice(
      draft.indexOf("CREATE OR REPLACE FUNCTION public.admin_set_student_services_enabled("),
      draft.indexOf("REVOKE ALL ON FUNCTION public.admin_set_student_services_enabled"),
    );
    expect(admin).toContain("INSERT INTO public.student_services_switch");
    expect(draft).not.toMatch(/CREATE POLICY/i);
  });

  it("the commit is conditional on a self-check of privileges, RLS and the guard", () => {
    const post = draft.slice(draft.indexOf("DO $post$"), draft.indexOf("$post$;"));
    for (const check of [
      "STUDENT_SERVICES_SWITCH_01_ROW_COUNT",
      "STUDENT_SERVICES_SWITCH_01_RLS_NOT_ENABLED",
      "STUDENT_SERVICES_SWITCH_01_UNEXPECTED_POLICY",
      "STUDENT_SERVICES_SWITCH_01_TABLE_PRIVILEGE_LEAK",
      "STUDENT_SERVICES_SWITCH_01_ANON_EXECUTE_LEAK",
      "STUDENT_SERVICES_SWITCH_01_GUARD_NOT_INSTALLED",
    ]) {
      expect(post).toContain(check);
    }
    expect(draft.indexOf("DO $post$")).toBeLessThan(draft.lastIndexOf("COMMIT;"));
  });
});

describe("direct-RPC matrix (rehearsal cases)", () => {
  it("denies every non-admin role for enable, disable and the admin read", () => {
    for (const role of ["dean", "registrar", "student_affairs", "no role", "processing specialist", "student"]) {
      expect(cases).toContain(`-- ${role}`);
    }
    expect(cases).toContain("'STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED'");
    expect(cases).toContain("'STUDENT_SERVICES_SWITCH_AUTH_REQUIRED'");
    expect(cases).toContain("switch row untouched by every refused caller");
    expect(cases).toContain("refused flips wrote no audit row");
  });

  it("proves every student path is refused AND writes nothing", () => {
    const refused = cases.slice(cases.indexOf("CREATE OR REPLACE FUNCTION public.h_refused"));
    expect(refused).toContain("refused statement left rows behind");
    for (const label of [
      "legacy start: create_student_request",
      "legacy submit of a draft created earlier: submit_student_request",
      "P1 atomic: submit_student_request_with_details",
      "B1 start: new draft row",
      "B1 submit of a draft created earlier",
      "direct table INSERT already submitted",
      "direct table UPDATE draft -> submitted",
      "direct table UPDATE draft -> returned",
    ]) {
      expect(cases).toContain(label);
    }
    expect(cases.match(/'STUDENT_SERVICES_TEMPORARILY_DISABLED'\);/g)?.length).toBeGreaterThanOrEqual(10);
  });

  it("proves staff processing, resubmission and the audit trail while disabled", () => {
    for (const label of [
      "DISABLED: assigned staff still acts on an in-flight request",
      "DISABLED: returned legacy and returned B1 requests can still be resubmitted",
      "DISABLED: student may still edit and cancel an own draft",
      "exactly one audit row: action, actor, role, old and new values",
      "system_admin re-enabled; audited with actor and old/new state",
      "row missing -> admin_set_student_services_enabled recreates it (no permanent outage)",
    ]) {
      expect(cases).toContain(label);
    }
  });
});

describe("application layer", () => {
  it("no client component decides the pause on its own or talks to the table", () => {
    for (const path of [
      "src/components/student-requests/StudentServicesPausedNotice.tsx",
      "src/components/admin/StudentServicesSwitchCard.tsx",
      "src/routes/student.requests.index.tsx",
      "src/routes/mobile.student.requests.index.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("student_services_switch");
      expect(source).not.toContain("supabaseAdmin");
      expect(source).not.toContain("localStorage");
    }
  });

  it("the server gate cannot be skipped by a role: it has no role exemption at all", () => {
    const gate = read("src/lib/student-requests/student-services-switch.server.ts");
    expect(gate).not.toMatch(/hasAnyRole|assertAnyRole|userRoles|assertAdmin/);
    const guard = draft.slice(
      draft.indexOf("CREATE OR REPLACE FUNCTION public.guard_student_services_switch()"),
      draft.indexOf("REVOKE ALL ON FUNCTION public.guard_student_services_switch()"),
    );
    expect(guard).not.toMatch(/has_any_role|has_role|is_current_user_admin_actor/);
  });

  it("does not touch request_types.student_visible nor the enrollment-certificate flow", () => {
    expect(draft).not.toContain("request_types");
    expect(draft).not.toContain("student_visible");
    for (const path of [
      "src/lib/student-requests/student-services-switch.ts",
      "src/lib/student-requests/student-services-switch.server.ts",
      "src/lib/student-requests/student-services-switch.functions.ts",
      "src/components/student-requests/StudentServicesPausedNotice.tsx",
      "src/components/admin/StudentServicesSwitchCard.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("student_visible");
      expect(source).not.toContain("enrollment_certificate");
    }
  });
});
