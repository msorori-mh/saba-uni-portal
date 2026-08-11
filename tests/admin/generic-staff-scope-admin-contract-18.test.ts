import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allowsMultipleActiveAssignees,
  FACULTY_ONLY_ROLE_CODES,
  isFacultyOnlyRoleCode,
} from "../../src/lib/admin-processing-assignments.functions";
import { dedupeDepartmentIds } from "../../src/lib/admin-people.functions";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PEOPLE = read("src/lib/admin-people.functions.ts");
const ASSIGN = read("src/lib/admin-processing-assignments.functions.ts");
const ROUTE = read("src/routes/admin/processing-assignments.tsx");
const SCOPE_UI = read("src/components/admin/people/staff-department-scope.tsx");
const AUTH04 = read("supabase/migrations/20260808210200_ga_authorization_04.sql");
const AUTH_TS = read("src/lib/graduates-affairs/authorization.ts");

describe("generic staff department scope write contract", () => {
  it("exports setStaffDepartmentScope with staffing admin roles only", () => {
    expect(PEOPLE).toContain("export const setStaffDepartmentScope");
    expect(PEOPLE).toContain('action_type: "staff_department_scope_set"');
    expect(PEOPLE).toContain("لا يمكنك تعديل نطاق أقسام ملفك التشغيلي بنفسك");
    expect(PEOPLE).toContain("أحد معرفات الأقسام غير موجود أو غير نشط");
    expect(PEOPLE).toContain('syncStaffDepartmentScope(data.staffProfileId, "specific", desiredIds)');
  });

  it("deduplicates department ids stably", () => {
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    expect(dedupeDepartmentIds([b, a, b, a])).toEqual([a, b].toSorted());
  });

  it("never hardcodes employee identities in staffing write/auth paths", () => {
    for (const src of [PEOPLE, ASSIGN, ROUTE, AUTH_TS, AUTH04]) {
      expect(src).not.toMatch(/صالح\s*علي/);
      expect(src).not.toMatch(/saleh@usr\.edu\.ye/i);
    }
  });
});

describe("processing assignments — multi-specialist concurrency", () => {
  it("managerial roles remain singleton; specialists allow multiple", () => {
    expect(allowsMultipleActiveAssignees({ is_managerial: true })).toBe(false);
    expect(allowsMultipleActiveAssignees({ is_managerial: false })).toBe(true);
    expect(allowsMultipleActiveAssignees({ is_managerial: null })).toBe(true);
    expect(ASSIGN).toContain("allowsMultipleActiveAssignees(role)");
    expect(ASSIGN).toContain("is_managerial");
  });

  it("still blocks duplicate active assignment for the same user+role", () => {
    expect(ASSIGN).toContain(
      "يوجد بالفعل إسناد نشط لهذا المستخدم على نفس الدور.",
    );
  });

  it("UI lists all active assignees and shows authorized departments", () => {
    expect(ROUTE).toContain("الأقسام المخولة");
    expect(ROUTE).toContain("الدور التشغيلي");
    expect(ROUTE).toContain("الوحدة التشغيلية");
    expect(ROUTE).toContain("الموظف");
    expect(ROUTE).toContain("allowsMultipleActiveAssignees(role)");
    expect(ROUTE).not.toContain("disabled={!role.is_active || !!cur || !unit?.is_active}");
    expect(ROUTE).toContain("لا أقسام مخولة — يُرفض التشغيل");
  });

  it("faculty-only role codes remain dean/vice_dean", () => {
    expect([...FACULTY_ONLY_ROLE_CODES]).toEqual(["dean", "vice_dean"]);
    expect(isFacultyOnlyRoleCode("graduate_affairs_specialist")).toBe(false);
  });
});

describe("AUTH-04 specialist semantics — SPD only, not department_scope=all", () => {
  it("SQL specialist helper reads staff_profile_departments only", () => {
    const start = AUTH04.indexOf(
      "CREATE OR REPLACE FUNCTION public.graduate_affairs_specialist_department_ids()",
    );
    expect(start).toBeGreaterThan(-1);
    const body = AUTH04.slice(start, start + 900);
    expect(body).toContain("staff_profile_departments");
    expect(body).not.toContain("department_scope");
  });

  it("staff scope UI warns that college-wide all does not grant GA specialist ops", () => {
    expect(SCOPE_UI).toContain("operationalScopeHint");
    expect(SCOPE_UI).toContain("staff_profile_departments");
    expect(SCOPE_UI).toContain("لا يمنح");
  });
});

describe("CONFIGURATION AUTHORITY != OPERATIONAL GA AUTHORITY", () => {
  it("staffing write roles do not include graduate_affairs_* capability grants", () => {
    expect(PEOPLE).toContain('const STAFF_ROLES = ["admin", "system_admin", "dean", "hr_officer"]');
    expect(PEOPLE).not.toMatch(/STAFF_ROLES.*graduate_affairs/);
    expect(ASSIGN).toContain(
      'const PROCESSING_ASSIGNMENT_ADMIN_ROLES = ["admin", "system_admin"] as const',
    );
  });
});
