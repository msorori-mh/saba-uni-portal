import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeHomePositionCodes,
  FACULTY_HOME_COPY,
  resolveFacultyHomeRole,
} from "../../src/lib/faculty-portal/dashboard-role";

const read = (path: string) => readFileSync(join(import.meta.dir, "../..", path), "utf8");

describe("faculty home content scope", () => {
  test("distinguishes academic and student affairs deputy by current appointment", () => {
    const current = { code: "vice_dean_academic", is_active: true, assignment_active: true, assigned_from: "2026-10-01", assigned_to: "2026-10-06" };
    expect(activeHomePositionCodes([current], "2026-10-06")).toEqual(["vice_dean_academic"]);
    for (const invalid of [
      { ...current, assigned_from: "2026-10-07" },
      { ...current, assigned_to: "2026-10-05" },
      { ...current, assigned_from: null },
      { ...current, assignment_active: false },
      { ...current, is_active: false },
    ]) expect(activeHomePositionCodes([invalid], "2026-10-06")).toEqual([]);
    expect(resolveFacultyHomeRole({ roles: ["vice_dean"], positionCodes: ["vice_dean_academic"], headedDepartmentIds: [] })).toBe("vice_dean_academic");
    expect(resolveFacultyHomeRole({ roles: ["vice_dean"], positionCodes: ["vice_dean_students"], headedDepartmentIds: [] })).toBe("vice_dean_students");
  });

  test("dean role outranks deputy; head requires real department; role alone stays generic", () => {
    const home = (roles: string[], positionCodes: string[] = [], headedDepartmentIds: string[] = []) =>
      resolveFacultyHomeRole({ roles, positionCodes, headedDepartmentIds });
    expect(home(["dean", "vice_dean"], ["vice_dean_academic"])).toBe("dean");
    expect(home(["vice_dean"])).toBe("vice_dean");
    expect(home(["faculty_member", "department_head"])).toBe("faculty_member");
    expect(home(["faculty_member"], [], ["dept-it"])).toBe("department_head");
    expect(home(["faculty_member"])).toBe("faculty_member");
    expect(FACULTY_HOME_COPY.vice_dean_students.title).toContain("شؤون الطلاب");
  });

  test("navigation to scoped pages uses server flags, not the displayed job title", () => {
    const page = read("src/routes/faculty-portal.index.tsx");
    const server = read("src/lib/faculty-portal/processing-access.functions.ts");
    expect(page).toContain('processingAccess?.canMonitorDelivery && (');
    expect(page).toContain('processingAccess?.canViewDepartmentReports && homeRole === "department_head"');
    expect(page).toContain("isLeadership && showProcessingCard && (");
    expect(read("src/lib/faculty-portal/dashboard-role.ts")).toContain('roles.includes("dean")');
    expect(server).toContain('roles.includes("department_head")');
    expect(server).toContain('headedDepartmentIds.includes(faculty.department_id)');
  });
});
