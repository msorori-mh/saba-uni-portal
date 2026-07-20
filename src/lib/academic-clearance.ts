export const EQUIVALENCY_DECISIONS = [
  "equivalent",
  "partially_equivalent",
  "general_requirement",
  "not_equivalent",
  "needs_review",
  "committee_decision_required",
] as const;

export type EquivalencyDecision = (typeof EQUIVALENCY_DECISIONS)[number];
export type ClearanceStatus =
  | "draft"
  | "department_review"
  | "academic_affairs_review"
  | "approved"
  | "rejected"
  | "superseded";

export interface CourseSnapshot {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  levelNumber?: number | null;
}

export interface EquivalencyRow {
  sourceCourseId: string;
  sourceCreditHours: number;
  targetCourseId?: string | null;
  decision: EquivalencyDecision;
  acceptedCreditHours: number;
  rationale: string;
}

export interface ClearanceSummary {
  acceptedCredits: number;
  remainingCredits: number;
  proposedLevel: number | null;
  unresolvedCount: number;
  canSubmitDepartmentDecision: boolean;
}

const unresolved = new Set<EquivalencyDecision>(["needs_review", "committee_decision_required"]);

export function summarizeClearance(
  targetPlanCredits: number,
  rows: readonly EquivalencyRow[],
  targetCourses: readonly CourseSnapshot[],
): ClearanceSummary {
  if (!Number.isFinite(targetPlanCredits) || targetPlanCredits < 0) {
    throw new Error("INVALID_TARGET_PLAN_CREDITS");
  }

  const acceptedCredits = rows.reduce((total, row) => {
    const target = targetCourses.find((course) => course.id === row.targetCourseId);
    if (
      !Number.isFinite(row.acceptedCreditHours) ||
      row.acceptedCreditHours < 0 ||
      row.acceptedCreditHours > row.sourceCreditHours ||
      (target && row.acceptedCreditHours > target.creditHours)
    ) {
      throw new Error("INVALID_ACCEPTED_CREDITS");
    }
    return total + row.acceptedCreditHours;
  }, 0);
  const acceptedTargets = rows.filter((row) => row.targetCourseId).map((row) => row.targetCourseId);
  if (new Set(acceptedTargets).size !== acceptedTargets.length)
    throw new Error("DUPLICATE_TARGET_CREDIT");
  if (acceptedCredits > targetPlanCredits) throw new Error("ACCEPTED_CREDITS_EXCEED_PLAN");
  const unresolvedCount = rows.filter((row) => unresolved.has(row.decision)).length;
  const remainingCredits = Math.max(0, targetPlanCredits - acceptedCredits);

  const unfulfilledLevels = targetCourses
    .filter(
      (course) =>
        !rows.some(
          (row) =>
            row.targetCourseId === course.id && row.acceptedCreditHours >= course.creditHours,
        ),
    )
    .map((course) => course.levelNumber)
    .filter((level): level is number => typeof level === "number" && level > 0);

  return {
    acceptedCredits,
    remainingCredits,
    proposedLevel: unfulfilledLevels.length ? Math.min(...unfulfilledLevels) : null,
    unresolvedCount,
    canSubmitDepartmentDecision:
      rows.length > 0 &&
      unresolvedCount === 0 &&
      rows.every((row) => row.rationale.trim().length > 0),
  };
}

export function canActorTransitionClearance(input: {
  status: ClearanceStatus;
  actorRole: string;
  actorDepartmentId?: string | null;
  targetDepartmentId: string;
  action: "edit" | "submit" | "approve" | "correct";
}): boolean {
  const isTargetChair =
    input.actorRole === "department_head" && input.actorDepartmentId === input.targetDepartmentId;
  if (input.action === "edit" || input.action === "submit") {
    return isTargetChair && ["draft", "department_review"].includes(input.status);
  }
  if (input.action === "approve") {
    return input.actorRole === "academic_affairs" && input.status === "academic_affairs_review";
  }
  return input.actorRole === "academic_affairs" && input.status === "approved";
}

export function canFinalizeDepartmentTransfer(clearanceStatus: ClearanceStatus): boolean {
  return clearanceStatus === "approved";
}
