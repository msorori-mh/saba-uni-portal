import { describe, expect, it } from "bun:test";
import { filterActiveCurrentTermSections } from "../../src/lib/current-term";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const term = {
  year: { id: "year-1", name: "2026/2027" },
  semester: { id: "semester-1", name: "First", academic_year_id: "year-1" },
};

function row(
  id: string,
  values: Partial<{
    sectionStatus: string;
    offeringStatus: string;
    yearId: string;
    semesterId: string;
  }> = {},
) {
  return {
    id,
    section: {
      status: values.sectionStatus ?? "active",
      offering: {
        status: values.offeringStatus ?? "active",
        academic_year_id: values.yearId ?? "year-1",
        semester_id: values.semesterId ?? "semester-1",
      },
    },
  };
}

describe("current-term schedule filters", () => {
  it("keeps only active sections and offerings matching both current-term identifiers", () => {
    const rows = [
      row("matching"),
      row("inactive-section", { sectionStatus: "inactive" }),
      row("inactive-offering", { offeringStatus: "inactive" }),
      row("old-year", { yearId: "year-0" }),
      row("old-semester", { semesterId: "semester-0" }),
    ];

    expect(filterActiveCurrentTermSections(rows, term).map((item) => item.id)).toEqual([
      "matching",
    ]);
  });

  it("fails closed when the canonical current term is unavailable", () => {
    expect(filterActiveCurrentTermSections([row("matching")], null)).toEqual([]);
  });

  it("returns an empty result when a valid term has no active matching rows", () => {
    expect(
      filterActiveCurrentTermSections(
        [row("inactive", { sectionStatus: "inactive" }), row("historical", { yearId: "year-0" })],
        term,
      ),
    ).toEqual([]);
  });
});

const root = join(import.meta.dir, "..", "..");
const routeSources = {
  student: readFileSync(join(root, "src/routes/student.schedule.tsx"), "utf8"),
  mobileStudent: readFileSync(join(root, "src/routes/mobile.student.schedule.tsx"), "utf8"),
  faculty: readFileSync(join(root, "src/routes/faculty-portal.schedule.tsx"), "utf8"),
};

function expectCanonicalResolverBefore(source: string, scheduleTable: string) {
  const resolverIndex = source.indexOf("await fetchCanonicalCurrentTerm(");
  const scheduleQueryIndex = source.indexOf(`.from("${scheduleTable}")`);
  expect(resolverIndex).toBeGreaterThan(-1);
  expect(scheduleQueryIndex).toBeGreaterThan(resolverIndex);
}

function expectFailClosedWiring(source: string) {
  expect(source).toMatch(/catch\s*\{\s*return \{ rows: \[\],/s);
  expect(source).toMatch(/if \(!currentTerm\) return \{ rows: \[\],/);
  expect(source).toContain("filterActiveCurrentTermSections(");
  expect(source).toContain("academic_year_id, semester_id, status");
  expect(source).toContain("section_code, status");
}

describe("schedule route current-term contracts", () => {
  it("wires the student schedule to its own enrollments after fail-closed term resolution", () => {
    const source = routeSources.student;
    expectCanonicalResolverBefore(source, "student_enrollments");
    expectFailClosedWiring(source);
    expect(source).toContain('.eq("student_profile_id", (sp as any).id)');
    expect(source).toContain('.eq("enrollment_status", "enrolled")');
    expect(source).toContain('if (s.status !== "published" || !s.time_slot) continue');
  });

  it("wires the mobile student schedule to its own published enrollments", () => {
    const source = routeSources.mobileStudent;
    expectCanonicalResolverBefore(source, "student_enrollments");
    expectFailClosedWiring(source);
    expect(source).toContain('.eq("student_profile_id", (sp as { id: string }).id)');
    expect(source).toContain('.eq("enrollment_status", "enrolled")');
    expect(source).toContain('if (s.status !== "published" || !s.time_slot) continue');
  });

  it("wires the faculty schedule to the authenticated faculty predicate", () => {
    const source = routeSources.faculty;
    expectCanonicalResolverBefore(source, "class_schedule");
    expectFailClosedWiring(source);
    expect(source).toContain('.eq("faculty_profile_id", (fp as any).id)');
    expect(source).toContain('.in("status", ["draft", "published"])');
  });
});
