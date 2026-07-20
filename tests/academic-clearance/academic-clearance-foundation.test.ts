import { describe, expect, it } from "bun:test";
import {
  canActorTransitionClearance,
  canFinalizeDepartmentTransfer,
  summarizeClearance,
} from "../../src/lib/academic-clearance";

describe("academic clearance foundation", () => {
  it("calculates accepted, remaining, unresolved and proposed level", () => {
    expect(
      summarizeClearance(
        120,
        [
          {
            sourceCourseId: "s1",
            sourceCreditHours: 3,
            targetCourseId: "t1",
            decision: "equivalent",
            acceptedCreditHours: 3,
            rationale: "same outcomes",
          },
          {
            sourceCourseId: "s2",
            sourceCreditHours: 3,
            decision: "needs_review",
            acceptedCreditHours: 0,
            rationale: "pending",
          },
        ],
        [
          { id: "t1", code: "A", name: "A", creditHours: 3, levelNumber: 1 },
          { id: "t2", code: "B", name: "B", creditHours: 3, levelNumber: 2 },
        ],
      ),
    ).toEqual({
      acceptedCredits: 3,
      remainingCredits: 117,
      proposedLevel: 2,
      unresolvedCount: 1,
      canSubmitDepartmentDecision: false,
    });
  });
  it("fails closed for invalid hours", () =>
    expect(() =>
      summarizeClearance(
        10,
        [
          {
            sourceCourseId: "s",
            sourceCreditHours: 3,
            decision: "equivalent",
            acceptedCreditHours: -1,
            rationale: "x",
          },
        ],
        [],
      ),
    ).toThrow("INVALID_ACCEPTED_CREDITS"));
  it("rejects over-credit and duplicate target credit", () => {
    expect(() =>
      summarizeClearance(
        6,
        [
          {
            sourceCourseId: "s",
            sourceCreditHours: 3,
            targetCourseId: "t",
            decision: "equivalent",
            acceptedCreditHours: 4,
            rationale: "x",
          },
        ],
        [{ id: "t", code: "T", name: "T", creditHours: 3 }],
      ),
    ).toThrow("INVALID_ACCEPTED_CREDITS");
    expect(() =>
      summarizeClearance(
        6,
        [
          {
            sourceCourseId: "s1",
            sourceCreditHours: 3,
            targetCourseId: "t",
            decision: "equivalent",
            acceptedCreditHours: 2,
            rationale: "x",
          },
          {
            sourceCourseId: "s2",
            sourceCreditHours: 3,
            targetCourseId: "t",
            decision: "partially_equivalent",
            acceptedCreditHours: 1,
            rationale: "x",
          },
        ],
        [{ id: "t", code: "T", name: "T", creditHours: 3 }],
      ),
    ).toThrow("DUPLICATE_TARGET_CREDIT");
  });
  it("allows only the target department head to edit and academic affairs to approve", () => {
    expect(
      canActorTransitionClearance({
        status: "department_review",
        actorRole: "department_head",
        actorDepartmentId: "target",
        targetDepartmentId: "target",
        action: "submit",
      }),
    ).toBe(true);
    expect(
      canActorTransitionClearance({
        status: "department_review",
        actorRole: "department_head",
        actorDepartmentId: "source",
        targetDepartmentId: "target",
        action: "submit",
      }),
    ).toBe(false);
    expect(
      canActorTransitionClearance({
        status: "academic_affairs_review",
        actorRole: "academic_affairs",
        targetDepartmentId: "target",
        action: "approve",
      }),
    ).toBe(true);
    for (const role of ["admin", "dean", "registrar", "student"])
      expect(
        canActorTransitionClearance({
          status: "academic_affairs_review",
          actorRole: role,
          targetDepartmentId: "target",
          action: "approve",
        }),
      ).toBe(false);
  });
  it("blocks final transfer until clearance approval", () => {
    for (const status of [
      "draft",
      "department_review",
      "academic_affairs_review",
      "rejected",
      "superseded",
    ] as const)
      expect(canFinalizeDepartmentTransfer(status)).toBe(false);
    expect(canFinalizeDepartmentTransfer("approved")).toBe(true);
  });
});
