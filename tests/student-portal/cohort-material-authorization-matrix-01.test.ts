import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canAccessPublishedMaterial,
  exactCurrentMaterialSectionIds,
  materialStudySystemMatches,
} from "../../src/lib/materials-audience";

const term = {
  year: { id: "year-current", name: "2026/2027" },
  semester: {
    id: "semester-current",
    name: "First",
    academic_year_id: "year-current",
  },
};

function enrollment(
  sectionId: string,
  overrides: Partial<{
    enrollmentStatus: string;
    sectionStatus: string;
    offeringStatus: string;
    yearId: string;
    semesterId: string;
  }> = {},
) {
  return {
    course_section_id: sectionId,
    enrollment_status: overrides.enrollmentStatus ?? "enrolled",
    section: {
      status: overrides.sectionStatus ?? "active",
      offering: {
        status: overrides.offeringStatus ?? "active",
        academic_year_id: overrides.yearId ?? term.year.id,
        semester_id: overrides.semesterId ?? term.semester.id,
      },
    },
  };
}

describe("cohort material authorization matrix", () => {
  it("allows only the exact enrolled active section in the canonical current term", () => {
    const sections = exactCurrentMaterialSectionIds(
      [
        enrollment("exact"),
        enrollment("completed", { enrollmentStatus: "completed" }),
        enrollment("dropped", { enrollmentStatus: "dropped" }),
        enrollment("wrong-year", { yearId: "year-old" }),
        enrollment("wrong-semester", { semesterId: "semester-old" }),
        enrollment("inactive-offering", { offeringStatus: "inactive" }),
        enrollment("inactive-section", { sectionStatus: "inactive" }),
      ],
      term,
    );

    expect([...sections]).toEqual(["exact"]);
    expect(sections.has("same-program-level-sibling")).toBeFalse();
    expect(exactCurrentMaterialSectionIds([enrollment("exact")], null)).toEqual(new Set());
  });

  it("denies wrong section, unpublished material, and mismatched or unresolved study systems", () => {
    const eligibleSectionIds = new Set(["exact"]);
    const allowed = {
      eligibleSectionIds,
      sectionId: "exact",
      status: "published",
      materialTag: "regular" as const,
      studentSystem: "regular",
    };

    expect(canAccessPublishedMaterial(allowed)).toBeTrue();
    expect(canAccessPublishedMaterial({ ...allowed, sectionId: "another-student-section" })).toBeFalse();
    expect(canAccessPublishedMaterial({ ...allowed, status: "draft" })).toBeFalse();
    expect(canAccessPublishedMaterial({ ...allowed, status: "archived" })).toBeFalse();
    // Canonical vocabulary: parallel/private is a different audience than regular/general.
    expect(canAccessPublishedMaterial({ ...allowed, materialTag: "parallel" })).toBeFalse();
    expect(canAccessPublishedMaterial({ ...allowed, materialTag: "نفقة خاصة" })).toBeFalse();
    expect(canAccessPublishedMaterial({ ...allowed, materialTag: "unknown-system" })).toBeFalse();
    expect(materialStudySystemMatches("both", null)).toBeFalse();
    expect(materialStudySystemMatches("both", "private")).toBeTrue();
  });
});

const root = join(import.meta.dir, "..", "..");
const source = readFileSync(join(root, "src/lib/student-materials.functions.ts"), "utf8");
const report = readFileSync(
  join(root, "docs/COHORT-MATERIAL-AUTHORIZATION-MATRIX-01.md"),
  "utf8",
);

describe("student material server boundaries", () => {
  it("requires authentication for list, detail, and download", () => {
    expect(source.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  });

  it("pins membership to the authenticated student's exact enrolled sections", () => {
    expect(source).toContain('.eq("student_profile_id", student.id)');
    expect(source).toContain('.eq("enrollment_status", "enrolled")');
    expect(source).not.toContain('.from("student_academic_status")');
    expect(source).not.toContain('.eq("program_id"');
    expect(source).not.toContain('.eq("level_id"');
  });

  it("shares the exact section and published/system gates across list, detail, and download", () => {
    expect(source.match(/eligibleSectionIdsForStudent\(/g)).toHaveLength(4);
    expect(source.match(/canAccessPublishedMaterial\(/g)).toHaveLength(2);
    expect(source).toContain('.eq("status", "published")');
    expect(source).toContain("materialStudySystemMatches(m.study_system, student.study_system)");
  });

  it("allows only exact faculty ownership and has no generic privileged-role bypass", () => {
    expect(source).toContain("(fp as any).id === material.faculty_profile_id");
    expect(source).toContain("if (!isOwner)");
    expect(source).not.toMatch(/isAdmin|isRegistrar|isDean|admin bypass|service_role.*allow/i);
  });

  it("authorizes before signing and records the successful download event", () => {
    const authorizationIndex = source.indexOf("if (!canAccessPublishedMaterial({");
    const signedUrlIndex = source.indexOf(".createSignedUrl(");
    const auditIndex = source.indexOf('.from("course_material_events").insert({');
    expect(authorizationIndex).toBeGreaterThan(-1);
    expect(signedUrlIndex).toBeGreaterThan(authorizationIndex);
    expect(auditIndex).toBeGreaterThan(signedUrlIndex);
    expect(source).toContain("createSignedUrl((file as any).storage_path, 60)");
  });

  it("documents the complete actor and service-role boundary matrix", () => {
    for (const phrase of [
      "Same program/level but sibling section",
      "Completed or dropped enrollment",
      "Wrong academic year or semester",
      "another student's section/file",
      "Inactive offering or section",
      "Exact faculty owner",
      "Service-role visibility is not authorization",
    ]) {
      expect(report).toContain(phrase);
    }
  });
});
