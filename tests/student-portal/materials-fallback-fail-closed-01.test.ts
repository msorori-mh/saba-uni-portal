import { describe, expect, it } from "bun:test";
import {
  canAccessPublishedMaterial,
  exactCurrentMaterialSectionIds,
  materialStudySystemMatches,
} from "../../src/lib/materials-audience";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const term = {
  year: { id: "year-1", name: "2026/2027" },
  semester: { id: "semester-1", name: "First", academic_year_id: "year-1" },
};

function enrollment(
  sectionId: string,
  options: Partial<{
    enrollmentStatus: string;
    sectionStatus: string;
    offeringStatus: string;
    yearId: string;
    semesterId: string;
  }> = {},
) {
  return {
    course_section_id: sectionId,
    enrollment_status: options.enrollmentStatus ?? "enrolled",
    section: {
      status: options.sectionStatus ?? "active",
      offering: {
        status: options.offeringStatus ?? "active",
        academic_year_id: options.yearId ?? "year-1",
        semester_id: options.semesterId ?? "semester-1",
      },
    },
  };
}

describe("materials fallback fail-closed audience", () => {
  it("allows only exact active enrolled sections in the canonical term", () => {
    const ids = exactCurrentMaterialSectionIds([
      enrollment("exact"),
      enrollment("completed", { enrollmentStatus: "completed" }),
      enrollment("dropped", { enrollmentStatus: "dropped" }),
      enrollment("old-year", { yearId: "year-0" }),
      enrollment("old-semester", { semesterId: "semester-0" }),
      enrollment("inactive-section", { sectionStatus: "inactive" }),
      enrollment("inactive-offering", { offeringStatus: "inactive" }),
    ], term);
    expect([...ids]).toEqual(["exact"]);
  });

  it("denies unavailable or mismatched canonical-term membership", () => {
    expect(exactCurrentMaterialSectionIds([enrollment("exact")], null)).toEqual(new Set());
    expect(exactCurrentMaterialSectionIds([enrollment("old", { yearId: "year-0" })], term)).toEqual(new Set());
  });

  it("does not infer sibling-section cohort membership", () => {
    const ids = exactCurrentMaterialSectionIds([enrollment("section-a")], term);
    expect(ids.has("section-a")).toBeTrue();
    expect(ids.has("section-b")).toBeFalse();
  });

  it("resolves legacy vocabulary through the canonical mapping and fails closed on unknown", () => {
    // COURSE-SYLLABUS-MATERIALS-AND-STUDY-SYSTEM-CLOSURE-01: regular→general, parallel→private.
    expect(materialStudySystemMatches("parallel", "private")).toBeTrue();
    expect(materialStudySystemMatches("both", "private")).toBeTrue();
    expect(materialStudySystemMatches("regular", "regular")).toBeTrue();
    expect(materialStudySystemMatches("both", "regular")).toBeTrue();
    expect(materialStudySystemMatches("general", "private")).toBeFalse();
    expect(materialStudySystemMatches("private", "regular")).toBeFalse();
    expect(materialStudySystemMatches("unknown", "general")).toBeFalse();
    expect(materialStudySystemMatches("general", null)).toBeFalse();
  });

  it("applies the published/exact-section/system gate to detail and download", () => {
    const base = {
      eligibleSectionIds: new Set(["section-a"]),
      sectionId: "section-a",
      status: "published",
      materialTag: "regular" as const,
      studentSystem: "regular",
    };
    expect(canAccessPublishedMaterial(base)).toBeTrue();
    expect(canAccessPublishedMaterial({ ...base, sectionId: "section-b" })).toBeFalse();
    expect(canAccessPublishedMaterial({ ...base, status: "draft" })).toBeFalse();
    expect(canAccessPublishedMaterial({ ...base, materialTag: "parallel" })).toBeFalse();
  });

  it("keeps list, detail and download on one exact audience resolver", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/student-materials.functions.ts"), "utf8");
    expect(source).toContain('.eq("enrollment_status", "enrolled")');
    expect(source).toContain("fetchCanonicalCurrentTerm");
    expect(source).toContain("exactCurrentMaterialSectionIds");
    expect(source.match(/eligibleSectionIdsForStudent\(/g)).toHaveLength(4);
    expect(source.match(/canAccessPublishedMaterial\(/g)).toHaveLength(2);
    expect(source).not.toContain('.from("student_academic_status")');
    expect(source).not.toContain("for (const s of o.sections ?? [])");
  });
});
