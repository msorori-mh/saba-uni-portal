import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScheduleLookups } from "../../src/lib/imports/class-schedule";

// The validator only needs a DB client for cross-context conflict lookups,
// which these tests pass explicitly; stub the browser client module.
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { validateClassSchedule } = await import("../../src/lib/imports/class-schedule");

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("department-head scope on teaching assignment", () => {
  const src = read("src/lib/admin-course-offerings.functions.ts");
  const block = (name: string) => {
    const start = src.indexOf(`export const ${name} =`);
    const next = src.indexOf("export const ", start + 20);
    return src.slice(start, next === -1 ? undefined : next);
  };

  it("scope comes from the caller's own faculty profile and fails closed", () => {
    expect(src).toContain("async function resolveOfferingScope");
    expect(src).toContain('.eq("user_id", userId)');
    expect(src).toContain("if (!data?.department_id)");
    expect(src).toContain('["system_admin", "admin", "dean", "registrar"]');
  });

  it("every write checks the existing row AND the requested target", () => {
    const upsertOffering = block("upsertCourseOffering");
    expect(upsertOffering).toContain("assertOfferingInScope(scope, data.id)");
    expect(upsertOffering).toContain("assertCourseInScope(scope, data.course_id)");
    const upsertSection = block("upsertCourseSection");
    expect(upsertSection).toContain("assertSectionInScope(scope, data.id)");
    expect(upsertSection).toContain("assertOfferingInScope(scope, data.course_offering_id)");
    expect(block("deleteCourseOffering")).toContain("assertOfferingInScope(");
    expect(block("deleteCourseSection")).toContain("assertSectionInScope(");
  });

  it("scope checks run before the service-role write", () => {
    for (const name of ["upsertCourseOffering", "upsertCourseSection", "deleteCourseOffering", "deleteCourseSection"]) {
      const b = block(name);
      const check = b.search(/assert(Offering|Section|Course)InScope\(/);
      const write = b.search(/\.(update|insert|delete)\(/);
      expect(check).toBeGreaterThan(0);
      expect(write).toBeGreaterThan(check);
    }
  });

  it("lists are scoped too", () => {
    expect(block("listCourseOfferings")).toContain("scopedOfferingIds(scope)");
    expect(block("listCourseSections")).toContain("scopedOfferingIds(scope)");
  });
});

describe("materials follow the section's current lecturer", () => {
  it("faculty write access is decided by course_sections.faculty_profile_id", () => {
    const src = read("src/lib/faculty-materials.functions.ts");
    const fn = src.slice(src.indexOf("async function assertOwnsMaterial"), src.indexOf("async function assertOwnsMaterial") + 1400);
    expect(fn).toContain('.from("course_sections")');
    expect(fn).toContain("section.faculty_profile_id !== facultyProfileId");
    expect(fn).not.toContain("data.faculty_profile_id !== facultyProfileId");
  });

  it("download owner shortcut uses the current lecturer", () => {
    const src = read("src/lib/student-materials.functions.ts");
    expect(src).not.toContain("=== material.faculty_profile_id");
    expect(src).toContain("section.faculty_profile_id === (fp as any).id");
  });
});

describe("timetable import agrees with the section's lecturer", () => {
  const ctx = { academic_year_id: "y", semester_id: "s", program_id: "p", level_id: "l" };
  const lookups = (assigned: string | null): ScheduleLookups => ({
    offeringByCourseCode: new Map([["cs101", "off1"]]),
    sectionByOfferingAndCode: new Map([["off1|a", "sec1"]]),
    contextSectionIds: ["sec1"],
    roomByCode: new Map([["r1", "room1"]]),
    facultyByEmployeeNumber: new Map([["e1", "fac1"], ["e2", "fac2"]]),
    timeSlotByKey: new Map(),
    sectionFacultyById: new Map([["sec1", assigned]]),
  });
  // No DB conflicts: every query resolves to an empty list.
  const emptyDb: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === "then" ? (res: (v: unknown) => unknown) => res({ data: [], error: null }) : emptyDb),
    apply: () => emptyDb,
  });
  const row = (over: Record<string, unknown>) => ({
    course_code: "CS101", section_code: "A", day_of_week: "sunday",
    start_time: "08:00", end_time: "10:00", room_code: "R1", ...over,
  });

  it("rejects a LECTURE row naming a different lecturer", async () => {
    const res = await validateClassSchedule([row({ faculty_employee_number: "E2" })], ctx, lookups("fac1"), emptyDb);
    expect(res.rows[0].errors.map((e) => e.column)).toContain("faculty_employee_number");
    expect(res.rows[0].parsed).toBeNull();
  });

  it("accepts the assigned lecturer", async () => {
    const res = await validateClassSchedule([row({ faculty_employee_number: "E1" })], ctx, lookups("fac1"), emptyDb);
    expect(res.rows[0].errors).toEqual([]);
    expect(res.rows[0].parsed?.faculty_profile_id).toBe("fac1");
  });

  it("a lecture row without a lecturer inherits the assigned one", async () => {
    const res = await validateClassSchedule([row({})], ctx, lookups("fac1"), emptyDb);
    expect(res.rows[0].parsed?.faculty_profile_id).toBe("fac1");
  });

  it("labs may have a different instructor", async () => {
    const res = await validateClassSchedule(
      [row({ faculty_employee_number: "E2", schedule_type: "lab" })], ctx, lookups("fac1"), emptyDb,
    );
    expect(res.rows[0].errors).toEqual([]);
    expect(res.rows[0].parsed?.faculty_profile_id).toBe("fac2");
  });

  it("unassigned sections are not blocked", async () => {
    const res = await validateClassSchedule([row({ faculty_employee_number: "E2" })], ctx, lookups(null), emptyDb);
    expect(res.rows[0].errors).toEqual([]);
  });
});

describe("admin sees the mismatch", () => {
  it("sections list flags lecture-timetable lecturers that differ from the assignment", () => {
    expect(read("src/lib/admin-course-offerings.functions.ts")).toContain("schedule_faculty_mismatch");
    expect(read("src/routes/admin/course-offerings.tsx")).toContain("section-schedule-faculty-mismatch");
  });
});
