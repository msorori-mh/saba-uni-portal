import type { CurrentTerm } from "./current-term";

export type CanonicalStudySystem = "regular" | "private";
export type CourseMembershipSource =
  | "exact_enrollment"
  | "approved_cohort"
  | "approved_individual_addition";

export type CurrentTermCourseCandidate = {
  studentProfileId: string;
  sectionId: string;
  sectionStatus: string;
  offeringId: string;
  offeringStatus: string;
  academicYearId: string;
  semesterId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  studySystem: CanonicalStudySystem;
};

export type ExactEnrollmentCandidate = CurrentTermCourseCandidate & {
  enrollmentId: string;
  enrollmentStatus: string;
};

type ApprovalEvidence = {
  approvalStatus: "approved" | "pending" | "rejected";
  decisionReference: string | null;
};

export type FutureCohortMembership = CurrentTermCourseCandidate &
  ApprovalEvidence & {
    cohortMembershipId: string;
    cohortId: string;
  };

export type FutureIndividualCourseException = CurrentTermCourseCandidate &
  ApprovalEvidence & {
    exceptionId: string;
    effect: "add" | "exclude";
  };

export type CurrentTermCourseProvenance = {
  source: CourseMembershipSource;
  sourceId: string;
  decisionReference: string | null;
  sectionId: string;
  offeringId: string;
};

export type CurrentTermCourse = {
  courseId: string;
  courseCode: string;
  courseName: string;
  sectionId: string;
  offeringId: string;
  studySystem: CanonicalStudySystem;
  provenance: CurrentTermCourseProvenance;
};

export type CurrentTermCourseReadResult =
  | { status: "ready"; courses: CurrentTermCourse[]; rejectedSourceIds: string[] }
  | {
      status: "unavailable";
      reason: "TERM_AMBIGUOUS_OR_MISSING" | "STUDENT_PROFILE_AMBIGUOUS" | "STUDY_SYSTEM_UNRESOLVED";
      courses: [];
      rejectedSourceIds: string[];
    };

export type ResolveCurrentTermCoursesInput = {
  currentTerm: CurrentTerm | null;
  authenticatedStudentProfileIds: string[];
  studentStudySystem: string | null;
  enrollments: ExactEnrollmentCandidate[];
  futureSources?: {
    enabledByApprovedPolicy: boolean;
    cohortMemberships: FutureCohortMembership[];
    individualExceptions: FutureIndividualCourseException[];
  };
};

function approved(evidence: ApprovalEvidence): boolean {
  return evidence.approvalStatus === "approved" && Boolean(evidence.decisionReference?.trim());
}

function candidateMatches(
  candidate: CurrentTermCourseCandidate,
  profileId: string,
  studySystem: CanonicalStudySystem,
  term: CurrentTerm,
): boolean {
  return (
    candidate.studentProfileId === profileId &&
    candidate.studySystem === studySystem &&
    candidate.sectionStatus === "active" &&
    candidate.offeringStatus === "active" &&
    candidate.academicYearId === term.year.id &&
    candidate.semesterId === term.semester.id
  );
}

function toCourse(
  candidate: CurrentTermCourseCandidate,
  source: CourseMembershipSource,
  sourceId: string,
  decisionReference: string | null,
): CurrentTermCourse {
  return {
    courseId: candidate.courseId,
    courseCode: candidate.courseCode,
    courseName: candidate.courseName,
    sectionId: candidate.sectionId,
    offeringId: candidate.offeringId,
    studySystem: candidate.studySystem,
    provenance: {
      source,
      sourceId,
      decisionReference,
      sectionId: candidate.sectionId,
      offeringId: candidate.offeringId,
    },
  };
}

export function resolveStudentCurrentTermCourses(
  input: ResolveCurrentTermCoursesInput,
): CurrentTermCourseReadResult {
  const rejectedSourceIds: string[] = [];
  if (!input.currentTerm)
    return {
      status: "unavailable",
      reason: "TERM_AMBIGUOUS_OR_MISSING",
      courses: [],
      rejectedSourceIds,
    };
  if (
    input.authenticatedStudentProfileIds.length !== 1 ||
    !input.authenticatedStudentProfileIds[0]
  ) {
    return {
      status: "unavailable",
      reason: "STUDENT_PROFILE_AMBIGUOUS",
      courses: [],
      rejectedSourceIds,
    };
  }
  if (input.studentStudySystem !== "regular" && input.studentStudySystem !== "private") {
    return {
      status: "unavailable",
      reason: "STUDY_SYSTEM_UNRESOLVED",
      courses: [],
      rejectedSourceIds,
    };
  }

  const profileId = input.authenticatedStudentProfileIds[0];
  const studySystem = input.studentStudySystem;
  const term = input.currentTerm;
  const bySection = new Map<string, CurrentTermCourse>();

  for (const enrollment of input.enrollments) {
    if (
      enrollment.enrollmentStatus !== "enrolled" ||
      !candidateMatches(enrollment, profileId, studySystem, term)
    ) {
      rejectedSourceIds.push(enrollment.enrollmentId);
      continue;
    }
    bySection.set(
      enrollment.sectionId,
      toCourse(enrollment, "exact_enrollment", enrollment.enrollmentId, null),
    );
  }

  const future = input.futureSources;
  if (future && !future.enabledByApprovedPolicy) {
    rejectedSourceIds.push(...future.cohortMemberships.map((item) => item.cohortMembershipId));
    rejectedSourceIds.push(...future.individualExceptions.map((item) => item.exceptionId));
  } else if (future) {
    for (const membership of future.cohortMemberships) {
      if (!approved(membership) || !candidateMatches(membership, profileId, studySystem, term)) {
        rejectedSourceIds.push(membership.cohortMembershipId);
        continue;
      }
      if (!bySection.has(membership.sectionId)) {
        bySection.set(
          membership.sectionId,
          toCourse(
            membership,
            "approved_cohort",
            membership.cohortMembershipId,
            membership.decisionReference,
          ),
        );
      }
    }

    for (const exception of future.individualExceptions) {
      if (!approved(exception) || !candidateMatches(exception, profileId, studySystem, term)) {
        rejectedSourceIds.push(exception.exceptionId);
        continue;
      }
      if (exception.effect === "exclude") bySection.delete(exception.sectionId);
      else
        bySection.set(
          exception.sectionId,
          toCourse(
            exception,
            "approved_individual_addition",
            exception.exceptionId,
            exception.decisionReference,
          ),
        );
    }
  }

  return {
    status: "ready",
    courses: [...bySection.values()].sort(
      (a, b) => a.courseCode.localeCompare(b.courseCode) || a.sectionId.localeCompare(b.sectionId),
    ),
    rejectedSourceIds,
  };
}
