export type LegacyStudySystem = "regular" | "parallel";

export type LegacySectionComponentEvidence = {
  component_id: string;
  component_kind: string;
};

export type LegacySectionCompatibilityInput = {
  section_id: string;
  section_code: string;
  course_offering_id: string;
  course_id: string;
  academic_year_id: string;
  semester_id: string;
  section_status: string;
  offering_status: string;
  faculty_profile_id: string | null;
  study_system_evidence: LegacyStudySystem[];
  component_evidence: LegacySectionComponentEvidence[];
};

export type LegacySectionDeliveryGroup = {
  delivery_group_id: string;
  source_kind: "legacy_course_section";
  source_id: string;
  course_offering_id: string;
  course_id: string;
  academic_year_id: string;
  semester_id: string;
  study_system: LegacyStudySystem;
  component: LegacySectionComponentEvidence;
  faculty_profile_id: string | null;
  status: {
    section: string;
    offering: string;
  };
  provenance: {
    source_table: "course_sections";
    source_primary_key: string;
    mapping_kind: "unambiguous_one_to_one";
    section_code_observed: string;
    inferred_from_section_code: false;
  };
};

export type LegacySectionCompatibilityFailure =
  | "missing_source_identity"
  | "ambiguous_study_system"
  | "ambiguous_component";

export type LegacySectionCompatibilityResult =
  | { ok: true; value: LegacySectionDeliveryGroup }
  | { ok: false; reason: LegacySectionCompatibilityFailure };

function hasRequiredIdentity(input: LegacySectionCompatibilityInput): boolean {
  return [
    input.section_id,
    input.course_offering_id,
    input.course_id,
    input.academic_year_id,
    input.semester_id,
  ].every((value) => value.trim().length > 0);
}

/**
 * Read-only projection of one historical course section into a delivery-group
 * compatible shape. Evidence must already come from authoritative relations;
 * section_code is provenance only and is never parsed for identity or audience.
 */
export function adaptLegacySectionToDeliveryGroup(
  input: LegacySectionCompatibilityInput,
): LegacySectionCompatibilityResult {
  if (!hasRequiredIdentity(input)) return { ok: false, reason: "missing_source_identity" };
  if (input.study_system_evidence.length !== 1) {
    return { ok: false, reason: "ambiguous_study_system" };
  }
  if (input.component_evidence.length !== 1) {
    return { ok: false, reason: "ambiguous_component" };
  }
  const component = input.component_evidence[0]!;
  if (component.component_id.trim().length === 0 || component.component_kind.trim().length === 0) {
    return { ok: false, reason: "ambiguous_component" };
  }

  return {
    ok: true,
    value: {
      delivery_group_id: `legacy-course-section:${input.section_id}`,
      source_kind: "legacy_course_section",
      source_id: input.section_id,
      course_offering_id: input.course_offering_id,
      course_id: input.course_id,
      academic_year_id: input.academic_year_id,
      semester_id: input.semester_id,
      study_system: input.study_system_evidence[0]!,
      component: { ...component },
      faculty_profile_id: input.faculty_profile_id,
      status: {
        section: input.section_status,
        offering: input.offering_status,
      },
      provenance: {
        source_table: "course_sections",
        source_primary_key: input.section_id,
        mapping_kind: "unambiguous_one_to_one",
        section_code_observed: input.section_code,
        inferred_from_section_code: false,
      },
    },
  };
}
