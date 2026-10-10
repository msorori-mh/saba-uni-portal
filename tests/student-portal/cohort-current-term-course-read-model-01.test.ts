import { describe, expect, it } from "bun:test";
import {
  resolveStudentCurrentTermCourses,
  type ExactEnrollmentCandidate,
} from "../../src/lib/student-current-term-courses";

const term = {
  year: { id: "y1", name: "2026" },
  semester: { id: "s1", name: "First", academic_year_id: "y1" },
};

function enrollment(overrides: Partial<ExactEnrollmentCandidate> = {}): ExactEnrollmentCandidate {
  return {
    enrollmentId: "e1",
    enrollmentStatus: "enrolled",
    studentProfileId: "p1",
    sectionId: "section-a",
    sectionStatus: "active",
    offeringId: "offering-1",
    offeringStatus: "active",
    academicYearId: "y1",
    semesterId: "s1",
    courseId: "course-1",
    courseCode: "CS101",
    courseName: "Course",
    studySystem: "regular",
    ...overrides,
  };
}

const base = {
  currentTerm: term,
  authenticatedStudentProfileIds: ["p1"],
  studentStudySystem: "regular",
  enrollments: [enrollment()],
};

describe("cohort current-term course read model", () => {
  it("returns only exact enrolled current-term active section membership with provenance", () => {
    const result = resolveStudentCurrentTermCourses(base);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]?.provenance).toEqual({
      source: "exact_enrollment",
      sourceId: "e1",
      decisionReference: null,
      sectionId: "section-a",
      offeringId: "offering-1",
    });
  });

  it("fails closed on missing term, profile ambiguity, or unresolved vocabulary", () => {
    expect(resolveStudentCurrentTermCourses({ ...base, currentTerm: null }).status).toBe(
      "unavailable",
    );
    expect(
      resolveStudentCurrentTermCourses({ ...base, authenticatedStudentProfileIds: ["p1", "p2"] })
        .status,
    ).toBe("unavailable");
    expect(
      resolveStudentCurrentTermCourses({ ...base, studentStudySystem: "parallel" }).status,
    ).toBe("unavailable");
  });

  it("excludes completed, dropped, foreign, inactive, historical, and private mismatch rows", () => {
    const rows = [
      enrollment({ enrollmentId: "completed", enrollmentStatus: "completed" }),
      enrollment({ enrollmentId: "dropped", enrollmentStatus: "dropped" }),
      enrollment({ enrollmentId: "foreign", studentProfileId: "p2" }),
      enrollment({ enrollmentId: "inactive", sectionStatus: "inactive" }),
      enrollment({ enrollmentId: "historical", semesterId: "s0" }),
      enrollment({ enrollmentId: "private", studySystem: "private" }),
    ];
    const result = resolveStudentCurrentTermCourses({ ...base, enrollments: rows });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.courses).toEqual([]);
    expect(result.rejectedSourceIds).toHaveLength(6);
  });

  it("does not use future sources unless an approved policy explicitly enables them", () => {
    const candidate = {
      ...enrollment({ enrollmentId: "unused", sectionId: "section-b" }),
      cohortMembershipId: "cm1",
      cohortId: "c1",
      approvalStatus: "approved" as const,
      decisionReference: "DEC-1",
    };
    const result = resolveStudentCurrentTermCourses({
      ...base,
      enrollments: [],
      futureSources: {
        enabledByApprovedPolicy: false,
        cohortMemberships: [candidate],
        individualExceptions: [],
      },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.courses).toEqual([]);
    expect(result.rejectedSourceIds).toContain("cm1");
  });

  it("requires approval evidence and exposes future cohort/addition provenance when enabled", () => {
    const cohort = {
      ...enrollment({ enrollmentId: "unused", sectionId: "section-b" }),
      cohortMembershipId: "cm1",
      cohortId: "c1",
      approvalStatus: "approved" as const,
      decisionReference: "DEC-C",
    };
    const addition = {
      ...enrollment({ enrollmentId: "unused", sectionId: "section-c", courseCode: "CS102" }),
      exceptionId: "x1",
      effect: "add" as const,
      approvalStatus: "approved" as const,
      decisionReference: "DEC-X",
    };
    const pending = {
      ...addition,
      exceptionId: "x2",
      sectionId: "section-d",
      approvalStatus: "pending" as const,
    };
    const result = resolveStudentCurrentTermCourses({
      ...base,
      enrollments: [],
      futureSources: {
        enabledByApprovedPolicy: true,
        cohortMemberships: [cohort],
        individualExceptions: [addition, pending],
      },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.courses.map((course) => course.provenance.source)).toEqual([
      "approved_cohort",
      "approved_individual_addition",
    ]);
    expect(result.rejectedSourceIds).toContain("x2");
  });

  it("applies an approved exact-section exclusion without inferring siblings", () => {
    const exclusion = {
      ...enrollment(),
      exceptionId: "x-exclude",
      effect: "exclude" as const,
      approvalStatus: "approved" as const,
      decisionReference: "DEC-E",
    };
    const result = resolveStudentCurrentTermCourses({
      ...base,
      futureSources: {
        enabledByApprovedPolicy: true,
        cohortMemberships: [],
        individualExceptions: [exclusion],
      },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.courses).toEqual([]);
  });
});
