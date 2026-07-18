import { describe, expect, it } from "bun:test";
import {
  adaptLegacySectionToDeliveryGroup,
  type LegacySectionCompatibilityInput,
} from "../../src/lib/legacy-section-compatibility";

function input(
  overrides: Partial<LegacySectionCompatibilityInput> = {},
): LegacySectionCompatibilityInput {
  return {
    section_id: "section-1",
    section_code: "REG-A-LAB-PARALLEL",
    course_offering_id: "offering-1",
    course_id: "course-1",
    academic_year_id: "year-1",
    semester_id: "semester-1",
    section_status: "active",
    offering_status: "active",
    faculty_profile_id: "faculty-1",
    study_system_evidence: ["regular"],
    component_evidence: [{ component_id: "component-1", component_kind: "lecture" }],
    ...overrides,
  };
}

describe("legacy section compatibility adapter", () => {
  it("projects one authoritative section/system/component with explicit provenance", () => {
    const result = adaptLegacySectionToDeliveryGroup(input());
    expect(result).toEqual({
      ok: true,
      value: {
        delivery_group_id: "legacy-course-section:section-1",
        source_kind: "legacy_course_section",
        source_id: "section-1",
        course_offering_id: "offering-1",
        course_id: "course-1",
        academic_year_id: "year-1",
        semester_id: "semester-1",
        study_system: "regular",
        component: { component_id: "component-1", component_kind: "lecture" },
        faculty_profile_id: "faculty-1",
        status: { section: "active", offering: "active" },
        provenance: {
          source_table: "course_sections",
          source_primary_key: "section-1",
          mapping_kind: "unambiguous_one_to_one",
          section_code_observed: "REG-A-LAB-PARALLEL",
          inferred_from_section_code: false,
        },
      },
    });
  });

  it("never infers system or component from section_code", () => {
    const result = adaptLegacySectionToDeliveryGroup(
      input({
        section_code: "PARALLEL-LAB-99",
        study_system_evidence: ["regular"],
        component_evidence: [{ component_id: "component-1", component_kind: "lecture" }],
      }),
    );
    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.value.study_system).toBe("regular");
      expect(result.value.component.component_kind).toBe("lecture");
      expect(result.value.provenance.inferred_from_section_code).toBeFalse();
    }
  });

  it.each([[], ["regular", "parallel"]] as const)(
    "fails closed when study-system evidence is missing or ambiguous",
    (studySystems) => {
      expect(
        adaptLegacySectionToDeliveryGroup(
          input({ study_system_evidence: [...studySystems] }),
        ),
      ).toEqual({ ok: false, reason: "ambiguous_study_system" });
    },
  );

  it("fails closed for missing or multi-component evidence", () => {
    expect(adaptLegacySectionToDeliveryGroup(input({ component_evidence: [] }))).toEqual({
      ok: false,
      reason: "ambiguous_component",
    });
    expect(
      adaptLegacySectionToDeliveryGroup(
        input({
          component_evidence: [
            { component_id: "lecture", component_kind: "lecture" },
            { component_id: "lab", component_kind: "lab" },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: "ambiguous_component" });
  });

  it("fails closed when authoritative relational identity is incomplete", () => {
    expect(adaptLegacySectionToDeliveryGroup(input({ course_offering_id: "" }))).toEqual({
      ok: false,
      reason: "missing_source_identity",
    });
  });
});
