import {
  filterActiveCurrentTermSections,
  type CurrentTerm,
  type CurrentTermSectionRow,
} from "@/lib/current-term";
import type { StudySystemTag } from "@/lib/course-materials.shared";

export type MaterialEnrollmentRow = CurrentTermSectionRow & {
  course_section_id: string;
  enrollment_status: string;
};

export function exactCurrentMaterialSectionIds(
  enrollments: MaterialEnrollmentRow[],
  currentTerm: CurrentTerm | null,
): Set<string> {
  const activeEnrollments = enrollments.filter((row) => row.enrollment_status === "enrolled");
  return new Set(
    filterActiveCurrentTermSections(activeEnrollments, currentTerm).map(
      (row) => row.course_section_id,
    ),
  );
}

export function materialStudySystemMatches(
  materialTag: StudySystemTag | string,
  studentSystem: string | null,
): boolean {
  const material = normalizeStudySystemTag(materialTag);
  const student = normalizeStudySystemTag(studentSystem);
  if (!material || !student) return false;
  if (student === "both") return true;
  return material === "both" || material === student;
}

export function canAccessPublishedMaterial(input: {
  eligibleSectionIds: ReadonlySet<string>;
  sectionId: string;
  status: string;
  materialTag: StudySystemTag;
  studentSystem: string | null;
}): boolean {
  return input.status === "published"
    && input.eligibleSectionIds.has(input.sectionId)
    && materialStudySystemMatches(input.materialTag, input.studentSystem);
}
