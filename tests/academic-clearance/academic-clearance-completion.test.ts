import { describe, expect, it } from "bun:test";
import {
  assertValidEquivalencyRow,
  buildClearanceMinutes,
  buildSourceCourseSnapshots,
  buildTargetCourseSnapshots,
  canActorTransitionClearance,
  canFinalizeDepartmentTransfer,
  CLEARANCE_ACTIVE_STATUSES,
  CLEARANCE_APPROVAL_DECISION_LABELS,
  CLEARANCE_APPROVAL_STAGE_LABELS,
  CLEARANCE_OVERDUE_AFTER_DAYS,
  CLEARANCE_STATUS_LABELS,
  CLEARANCE_STATUSES,
  CREDIT_BEARING_DECISIONS,
  EQUIVALENCY_DECISION_LABELS,
  EQUIVALENCY_DECISIONS,
  nextClearanceStatus,
  summarizeClearanceReporting,
  summarizeCourseOutcomes,
  TARGET_MAPPED_DECISIONS,
  UNRESOLVED_DECISIONS,
} from "../../src/lib/academic-clearance";

describe("academic clearance completion: resolved D-10 vocabulary", () => {
  it("declares exactly the seven approved comparison decisions", () => {
    expect(EQUIVALENCY_DECISIONS).toEqual([
      "equivalent",
      "partially_equivalent",
      "general_requirement",
      "supporting_requirement",
      "not_equivalent",
      "needs_review",
      "committee_decision_required",
    ]);
    for (const decision of EQUIVALENCY_DECISIONS) {
      expect(EQUIVALENCY_DECISION_LABELS[decision]).toBeTruthy();
    }
    expect(EQUIVALENCY_DECISION_LABELS.supporting_requirement).toBe("متطلب مساند");
  });

  it("classifies target-mapped, credit-bearing and unresolved decisions", () => {
    expect(TARGET_MAPPED_DECISIONS).toEqual(["equivalent", "partially_equivalent"]);
    expect(CREDIT_BEARING_DECISIONS).toEqual([
      "equivalent",
      "partially_equivalent",
      "general_requirement",
      "supporting_requirement",
    ]);
    expect(UNRESOLVED_DECISIONS).toEqual(["needs_review", "committee_decision_required"]);
  });

  it("validates equivalency row shape against SQL constraint semantics", () => {
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        decision: "supporting_requirement",
        acceptedCreditHours: 2,
        rationale: "supporting credit",
      }),
    ).not.toThrow();
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        targetCourseId: "t1",
        decision: "supporting_requirement",
        acceptedCreditHours: 2,
        rationale: "x",
      }),
    ).toThrow("INVALID_EQUIVALENCY_TARGET_COUPLING");
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        decision: "supporting_requirement",
        acceptedCreditHours: 0,
        rationale: "x",
      }),
    ).toThrow("INVALID_EQUIVALENCY_ACCEPTED_HOURS");
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        decision: "equivalent",
        acceptedCreditHours: 3,
        rationale: "x",
      }),
    ).toThrow("INVALID_EQUIVALENCY_TARGET_COUPLING");
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        decision: "not_equivalent",
        acceptedCreditHours: 1,
        rationale: "x",
      }),
    ).toThrow("INVALID_EQUIVALENCY_ACCEPTED_HOURS");
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        decision: "general_requirement",
        acceptedCreditHours: 3,
        rationale: "x",
      }),
    ).not.toThrow();
  });

  it("mirrors the credit guard source bound and the rationale requirement", () => {
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        targetCourseId: "t1",
        decision: "equivalent",
        acceptedCreditHours: 4,
        rationale: "x",
      }),
    ).toThrow("INVALID_EQUIVALENCY_ACCEPTED_HOURS_EXCEED_SOURCE");
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        targetCourseId: "t1",
        decision: "equivalent",
        acceptedCreditHours: 3,
        rationale: "x",
      }),
    ).not.toThrow();
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        targetCourseId: "t1",
        decision: "equivalent",
        acceptedCreditHours: 3,
        rationale: "   ",
      }),
    ).toThrow("INVALID_EQUIVALENCY_RATIONALE_REQUIRED");
    expect(() =>
      assertValidEquivalencyRow({
        sourceCourseId: "s1",
        sourceCreditHours: 3,
        decision: "supporting_requirement",
        acceptedCreditHours: 2,
        rationale: "supporting credit",
      }),
    ).not.toThrow();
  });
});

describe("academic clearance completion: seven statuses", () => {
  it("declares seven statuses with Arabic labels including returned", () => {
    expect(CLEARANCE_STATUSES).toEqual([
      "draft",
      "department_review",
      "academic_affairs_review",
      "returned",
      "approved",
      "rejected",
      "superseded",
    ]);
    for (const status of CLEARANCE_STATUSES) expect(CLEARANCE_STATUS_LABELS[status]).toBeTruthy();
    expect(CLEARANCE_STATUS_LABELS.returned).toBe("معادة إلى القسم");
  });

  it("mirrors the SQL state machine including return/reject/rework", () => {
    expect(nextClearanceStatus("draft", "edit")).toBe("department_review");
    expect(nextClearanceStatus("returned", "edit")).toBe("department_review");
    expect(nextClearanceStatus("department_review", "submit")).toBe("academic_affairs_review");
    expect(nextClearanceStatus("academic_affairs_review", "approve")).toBe("approved");
    expect(nextClearanceStatus("academic_affairs_review", "reject")).toBe("rejected");
    expect(nextClearanceStatus("academic_affairs_review", "return")).toBe("returned");
    expect(nextClearanceStatus("approved", "correct")).toBe("superseded");
    expect(() => nextClearanceStatus("returned", "approve")).toThrow(
      "INVALID_CLEARANCE_TRANSITION",
    );
    expect(() => nextClearanceStatus("rejected", "edit")).toThrow("INVALID_CLEARANCE_TRANSITION");
    expect(() => nextClearanceStatus("approved", "submit")).toThrow("INVALID_CLEARANCE_TRANSITION");
    expect(() => nextClearanceStatus("draft", "return")).toThrow("INVALID_CLEARANCE_TRANSITION");
  });

  it("keeps the target chair as review owner and academic affairs as approver", () => {
    expect(
      canActorTransitionClearance({
        status: "returned",
        actorRole: "department_head",
        actorDepartmentId: "target",
        targetDepartmentId: "target",
        action: "edit",
      }),
    ).toBe(true);
    expect(
      canActorTransitionClearance({
        status: "returned",
        actorRole: "department_head",
        actorDepartmentId: "source",
        targetDepartmentId: "target",
        action: "edit",
      }),
    ).toBe(false);
    for (const action of ["reject", "return"] as const) {
      expect(
        canActorTransitionClearance({
          status: "academic_affairs_review",
          actorRole: "academic_affairs",
          targetDepartmentId: "target",
          action,
        }),
      ).toBe(true);
      expect(
        canActorTransitionClearance({
          status: "academic_affairs_review",
          actorRole: "department_head",
          actorDepartmentId: "target",
          targetDepartmentId: "target",
          action,
        }),
      ).toBe(false);
    }
    expect(
      canActorTransitionClearance({
        status: "draft",
        actorRole: "academic_affairs",
        targetDepartmentId: "target",
        action: "return",
      }),
    ).toBe(false);
  });

  it("documents submit capability vs strict transition semantics", () => {
    // canActorTransitionClearance is a UI affordance check: the chair can
    // submit across the editable set because the save RPC moves any editable
    // case to department_review, from which submission is valid. The strict
    // single-step machine (nextClearanceStatus) rejects draft -> submit.
    expect(
      canActorTransitionClearance({
        status: "draft",
        actorRole: "department_head",
        actorDepartmentId: "target",
        targetDepartmentId: "target",
        action: "submit",
      }),
    ).toBe(true);
    expect(() => nextClearanceStatus("draft", "submit")).toThrow("INVALID_CLEARANCE_TRANSITION");
  });

  it("blocks final transfer in every status except approved", () => {
    for (const status of CLEARANCE_STATUSES) {
      expect(canFinalizeDepartmentTransfer(status)).toBe(status === "approved");
    }
  });
});

describe("academic clearance completion: snapshots", () => {
  const vocabulary = { approvedCourseResultStatus: "official_passed" };

  it("builds immutable source snapshots only from official passed results", () => {
    const rows = buildSourceCourseSnapshots(
      [
        {
          studentGradeId: "g1",
          courseId: "c1",
          courseCode: "MATH101",
          courseName: "Calculus",
          creditHours: 3,
          finalGrade: "A",
          passed: true,
          resultStatus: "official_passed",
          officialResultReference: "  ORR-1 ",
        },
      ],
      vocabulary,
    );
    expect(rows).toEqual([
      {
        studentGradeId: "g1",
        courseId: "c1",
        courseCode: "MATH101",
        courseName: "Calculus",
        creditHours: 3,
        finalGrade: "A",
        passed: true,
        officialResultReference: "ORR-1",
      },
    ]);
  });

  it("fails closed without official passed status or provenance", () => {
    const base = {
      studentGradeId: "g1",
      courseId: "c1",
      courseCode: "MATH101",
      courseName: "Calculus",
      creditHours: 3,
      passed: true,
      resultStatus: "official_passed",
      officialResultReference: "ORR-1",
    };
    expect(() => buildSourceCourseSnapshots([{ ...base, passed: false }], vocabulary)).toThrow(
      "CLEARANCE_SNAPSHOT_NOT_PASSED",
    );
    expect(() =>
      buildSourceCourseSnapshots([{ ...base, resultStatus: "draft_result" }], vocabulary),
    ).toThrow("CLEARANCE_SNAPSHOT_NOT_OFFICIAL_RESULT");
    expect(() =>
      buildSourceCourseSnapshots([{ ...base, officialResultReference: "  " }], vocabulary),
    ).toThrow("CLEARANCE_SNAPSHOT_OFFICIAL_REFERENCE_REQUIRED");
    expect(() => buildSourceCourseSnapshots([base], { approvedCourseResultStatus: " " })).toThrow(
      "CLEARANCE_AUTHORITY_VOCABULARY_REQUIRED",
    );
    expect(() => buildSourceCourseSnapshots([base, { ...base, courseId: "c2" }], vocabulary)).toThrow(
      "DUPLICATE_SOURCE_SNAPSHOT",
    );
  });

  it("builds target plan snapshots with validation", () => {
    expect(
      buildTargetCourseSnapshots([
        {
          studyPlanCourseId: "spc1",
          courseId: "c1",
          courseCode: "CS101",
          courseName: "Intro",
          creditHours: 3,
          levelId: "l1",
          isRequired: true,
        },
      ]),
    ).toEqual([
      {
        studyPlanCourseId: "spc1",
        courseId: "c1",
        courseCode: "CS101",
        courseName: "Intro",
        creditHours: 3,
        levelId: "l1",
        isRequired: true,
      },
    ]);
    expect(() =>
      buildTargetCourseSnapshots([
        {
          studyPlanCourseId: "spc1",
          courseId: "c1",
          courseCode: "CS101",
          courseName: "Intro",
          creditHours: -1,
          isRequired: true,
        },
      ]),
    ).toThrow("INVALID_CREDIT_HOURS");
  });
});

describe("academic clearance completion: minutes and approvals provenance", () => {
  it("builds minutes rows sorted by source code with Arabic labels", () => {
    const minutes = buildClearanceMinutes({
      status: "approved",
      acceptedCreditHours: 5,
      remainingCreditHours: 115,
      approvedAt: "2026-07-20T00:00:00Z",
      sourceCourses: [
        { id: "s2", code: "B102", name: "B", creditHours: 2 },
        { id: "s1", code: "A101", name: "A", creditHours: 3 },
      ],
      targetCourses: [{ id: "t1", code: "T101", name: "T", creditHours: 3 }],
      rows: [
        {
          sourceCourseId: "s2",
          sourceCreditHours: 2,
          decision: "supporting_requirement",
          acceptedCreditHours: 2,
          rationale: "supporting",
        },
        {
          sourceCourseId: "s1",
          sourceCreditHours: 3,
          targetCourseId: "t1",
          decision: "equivalent",
          acceptedCreditHours: 3,
          rationale: "matched",
        },
      ],
    });
    expect(minutes.statusLabel).toBe("معتمدة");
    expect(minutes.equivalencies.map((entry) => entry.sourceCode)).toEqual(["A101", "B102"]);
    expect(minutes.equivalencies[0]).toMatchObject({
      targetCode: "T101",
      decisionLabel: "معادل",
      acceptedHours: 3,
    });
    expect(minutes.equivalencies[1]).toMatchObject({
      targetCode: null,
      decisionLabel: "متطلب مساند",
    });
  });

  it("fails closed on unknown minute references", () => {
    expect(() =>
      buildClearanceMinutes({
        status: "draft",
        acceptedCreditHours: 0,
        remainingCreditHours: 6,
        sourceCourses: [],
        targetCourses: [],
        rows: [
          {
            sourceCourseId: "missing",
            sourceCreditHours: 3,
            decision: "not_equivalent",
            acceptedCreditHours: 0,
            rationale: "x",
          },
        ],
      }),
    ).toThrow("CLEARANCE_MINUTES_SOURCE_MISSING");
  });

  it("labels every approval stage and decision", () => {
    expect(CLEARANCE_APPROVAL_STAGE_LABELS.academic_affairs).toBe("الشؤون الأكاديمية");
    expect(CLEARANCE_APPROVAL_STAGE_LABELS.target_department).toBe("القسم المستهدف");
    expect(CLEARANCE_APPROVAL_DECISION_LABELS.returned).toBe("إعادة إلى القسم");
    expect(CLEARANCE_APPROVAL_DECISION_LABELS.rejected).toBe("رفض");
  });
});

describe("academic clearance completion: reporting", () => {
  it("aggregates per department/status with a 14-day overdue window on active cases", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const rows = summarizeClearanceReporting(
      [
        {
          targetDepartmentId: "d1",
          status: "returned",
          acceptedCreditHours: 6,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          targetDepartmentId: "d1",
          status: "approved",
          acceptedCreditHours: 12,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          targetDepartmentId: "d1",
          status: "draft",
          acceptedCreditHours: 0,
          updatedAt: "2026-07-19T00:00:00.000Z",
        },
        {
          targetDepartmentId: "d2",
          status: "draft",
          acceptedCreditHours: 0,
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      now,
    );
    expect(CLEARANCE_OVERDUE_AFTER_DAYS).toBe(14);
    expect(CLEARANCE_ACTIVE_STATUSES).toContain("returned");
    expect(rows.find((row) => row.status === "returned")).toMatchObject({
      caseCount: 1,
      overdueCount: 1,
      avgAcceptedHours: 6,
    });
    expect(rows.find((row) => row.status === "approved")).toMatchObject({
      caseCount: 1,
      overdueCount: 0,
    });
    expect(
      rows.find((row) => row.targetDepartmentId === "d1" && row.status === "draft"),
    ).toMatchObject({ overdueCount: 0 });
    expect(rows.find((row) => row.targetDepartmentId === "d2")).toMatchObject({
      overdueCount: 1,
    });
    expect(() =>
      summarizeClearanceReporting(
        [
          {
            targetDepartmentId: "d1",
            status: "draft",
            acceptedCreditHours: 0,
            updatedAt: "not-a-date",
          },
        ],
        now,
      ),
    ).toThrow("INVALID_REPORTING_TIMESTAMP");
  });

  it("counts resolved course outcomes including supporting requirements", () => {
    const rows = summarizeCourseOutcomes([
      {
        sourceCourseId: "c1",
        sourceCourseCode: "A",
        targetCourseId: "t1",
        targetCourseCode: "T",
        decision: "equivalent",
      },
      {
        sourceCourseId: "c1",
        sourceCourseCode: "A",
        targetCourseId: "t1",
        targetCourseCode: "T",
        decision: "equivalent",
      },
      {
        sourceCourseId: "c2",
        sourceCourseCode: "B",
        targetCourseId: null,
        targetCourseCode: null,
        decision: "supporting_requirement",
      },
      {
        sourceCourseId: "c3",
        sourceCourseCode: "C",
        targetCourseId: null,
        targetCourseCode: null,
        decision: "not_equivalent",
      },
      {
        sourceCourseId: "c4",
        sourceCourseCode: "D",
        targetCourseId: null,
        targetCourseCode: null,
        decision: "needs_review",
      },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.decision === "equivalent")).toMatchObject({
      decisionCount: 2,
    });
    expect(rows.find((row) => row.decision === "supporting_requirement")).toMatchObject({
      decisionCount: 1,
      decisionLabel: "متطلب مساند",
    });
    expect(rows.some((row) => row.decision === "needs_review")).toBe(false);
  });
});
